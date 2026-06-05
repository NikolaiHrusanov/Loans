-- NexusBank — Money management: deposits, withdrawals, transfers, transaction log.
-- Run in Supabase SQL Editor AFTER supabase/banking-schema.sql

-- ─────────────────────────────────────────────
-- PROFILES: total balance column (synced from bank_accounts)
-- ─────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS balance numeric(15, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0);

-- Prevent clients from changing balance directly; only RPC functions may update it.
CREATE OR REPLACE FUNCTION public.profiles_protect_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.balance IS DISTINCT FROM OLD.balance THEN
    IF COALESCE(current_setting('nexus.allow_balance_update', true), '0') <> '1' THEN
      NEW.balance := OLD.balance;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_balance_protect ON public.profiles;
CREATE TRIGGER profiles_balance_protect
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_balance();

-- ─────────────────────────────────────────────
-- TRANSACTIONS — unified audit log
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'transfer_sent', 'transfer_received')),
  amount numeric(15, 2) NOT NULL CHECK (amount > 0),
  account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  counterparty_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  counterparty_email text,
  counterparty_name text,
  description text NOT NULL,
  balance_after numeric(15, 2),
  transfer_group_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON public.transactions (user_id);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON public.transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_transfer_group_idx ON public.transactions (transfer_group_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own transaction log" ON public.transactions;
CREATE POLICY "Users read own transaction log"
  ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- HELPERS
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_profile_balance(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(15, 2);
BEGIN
  SELECT COALESCE(SUM(balance), 0)
  INTO v_total
  FROM public.bank_accounts
  WHERE user_id = p_user_id;

  PERFORM set_config('nexus.allow_balance_update', '1', true);
  UPDATE public.profiles
  SET balance = v_total, updated_at = now()
  WHERE id = p_user_id;
  PERFORM set_config('nexus.allow_balance_update', '0', true);

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_primary_account_id(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.bank_accounts
  WHERE user_id = p_user_id
  ORDER BY CASE account_type WHEN 'checking' THEN 0 WHEN 'savings' THEN 1 ELSE 2 END, created_at
  LIMIT 1;

  IF v_id IS NULL THEN
    PERFORM public.initialize_user_banking(p_user_id);
    SELECT id INTO v_id
    FROM public.bank_accounts
    WHERE user_id = p_user_id
    ORDER BY CASE account_type WHEN 'checking' THEN 0 WHEN 'savings' THEN 1 ELSE 2 END, created_at
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

-- Backfill profile balances for existing users
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.bank_accounts LOOP
    PERFORM public.sync_profile_balance(r.user_id);
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────
-- SEARCH REGISTERED USERS (for transfers)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_registered_users(p_query text)
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_q text := lower(trim(p_query));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF length(v_q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email
  FROM public.profiles p
  WHERE p.id <> v_user_id
    AND p.account_status = 'active'
    AND (
      lower(p.email) LIKE v_q || '%'
      OR lower(p.full_name) LIKE '%' || v_q || '%'
    )
  ORDER BY p.full_name
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_registered_users(text) TO authenticated;

-- ─────────────────────────────────────────────
-- DEPOSIT FUNDS
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deposit_funds(
  p_account_id uuid,
  p_amount numeric,
  p_description text DEFAULT 'Deposit'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account public.bank_accounts%ROWTYPE;
  v_new_balance numeric(15, 2);
  v_total numeric(15, 2);
  v_tx_id uuid;
  v_desc text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit amount must be greater than zero';
  END IF;

  IF p_amount > 1000000 THEN
    RAISE EXCEPTION 'Deposit amount exceeds maximum allowed';
  END IF;

  SELECT * INTO v_account
  FROM public.bank_accounts
  WHERE id = p_account_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  v_desc := COALESCE(NULLIF(trim(p_description), ''), 'Deposit');
  v_new_balance := v_account.balance + p_amount;

  UPDATE public.bank_accounts
  SET balance = v_new_balance, updated_at = now()
  WHERE id = p_account_id;

  INSERT INTO public.bank_transactions (
    user_id, account_id, description, amount, transaction_type, category, icon, balance_after
  ) VALUES (
    v_user_id, p_account_id, v_desc, p_amount, 'credit', 'deposit', 'deposit', v_new_balance
  );

  INSERT INTO public.transactions (
    user_id, type, amount, account_id, description, balance_after
  ) VALUES (
    v_user_id, 'deposit', p_amount, p_account_id, v_desc, v_new_balance
  ) RETURNING id INTO v_tx_id;

  v_total := public.sync_profile_balance(v_user_id);

  RETURN json_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'account_balance', v_new_balance,
    'total_balance', v_total,
    'message', 'Deposit successful'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deposit_funds(uuid, numeric, text) TO authenticated;

-- ─────────────────────────────────────────────
-- WITHDRAW FUNDS
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.withdraw_funds(
  p_account_id uuid,
  p_amount numeric,
  p_description text DEFAULT 'Withdrawal'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account public.bank_accounts%ROWTYPE;
  v_new_balance numeric(15, 2);
  v_total numeric(15, 2);
  v_tx_id uuid;
  v_desc text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;

  SELECT * INTO v_account
  FROM public.bank_accounts
  WHERE id = p_account_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_account.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient funds. Available balance: %', v_account.balance;
  END IF;

  v_desc := COALESCE(NULLIF(trim(p_description), ''), 'Withdrawal');
  v_new_balance := v_account.balance - p_amount;

  UPDATE public.bank_accounts
  SET balance = v_new_balance, updated_at = now()
  WHERE id = p_account_id;

  INSERT INTO public.bank_transactions (
    user_id, account_id, description, amount, transaction_type, category, icon, balance_after
  ) VALUES (
    v_user_id, p_account_id, v_desc, p_amount, 'debit', 'withdrawal', 'withdraw', v_new_balance
  );

  INSERT INTO public.transactions (
    user_id, type, amount, account_id, description, balance_after
  ) VALUES (
    v_user_id, 'withdrawal', p_amount, p_account_id, v_desc, v_new_balance
  ) RETURNING id INTO v_tx_id;

  v_total := public.sync_profile_balance(v_user_id);

  RETURN json_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'account_balance', v_new_balance,
    'total_balance', v_total,
    'message', 'Withdrawal successful'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.withdraw_funds(uuid, numeric, text) TO authenticated;

-- ─────────────────────────────────────────────
-- TRANSFER TO REGISTERED USER
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.transfer_to_user(
  p_from_account_id uuid,
  p_recipient_email text,
  p_amount numeric,
  p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
  v_recipient_id uuid;
  v_recipient_name text;
  v_sender_account public.bank_accounts%ROWTYPE;
  v_recipient_account_id uuid;
  v_recipient_account public.bank_accounts%ROWTYPE;
  v_sender_new numeric(15, 2);
  v_recipient_new numeric(15, 2);
  v_sender_total numeric(15, 2);
  v_recipient_total numeric(15, 2);
  v_group_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_recipient_email));
  v_sender_desc text;
  v_recipient_desc text;
  v_sender_name text;
  v_tx_id uuid;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be greater than zero';
  END IF;

  IF v_email IS NULL OR v_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'Valid recipient email is required';
  END IF;

  SELECT id, full_name INTO v_recipient_id, v_recipient_name
  FROM public.profiles
  WHERE lower(email) = v_email AND account_status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No registered NexusBank user found with email: %', v_email;
  END IF;

  IF v_recipient_id = v_sender_id THEN
    RAISE EXCEPTION 'You cannot transfer money to yourself';
  END IF;

  SELECT * INTO v_sender_account
  FROM public.bank_accounts
  WHERE id = p_from_account_id AND user_id = v_sender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source account not found';
  END IF;

  IF v_sender_account.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient funds. Available balance: %', v_sender_account.balance;
  END IF;

  v_recipient_account_id := public.get_primary_account_id(v_recipient_id);

  SELECT * INTO v_recipient_account
  FROM public.bank_accounts
  WHERE id = v_recipient_account_id
  FOR UPDATE;

  v_sender_new := v_sender_account.balance - p_amount;
  v_recipient_new := v_recipient_account.balance + p_amount;

  v_sender_desc := 'Transfer to ' || COALESCE(v_recipient_name, v_email);
  IF p_note IS NOT NULL AND trim(p_note) <> '' THEN
    v_sender_desc := v_sender_desc || ' — ' || trim(p_note);
  END IF;

  SELECT full_name INTO v_sender_name FROM public.profiles WHERE id = v_sender_id;
  v_recipient_desc := 'Transfer from ' || COALESCE(v_sender_name, 'NexusBank user');
  IF p_note IS NOT NULL AND trim(p_note) <> '' THEN
    v_recipient_desc := v_recipient_desc || ' — ' || trim(p_note);
  END IF;

  UPDATE public.bank_accounts SET balance = v_sender_new, updated_at = now() WHERE id = p_from_account_id;
  UPDATE public.bank_accounts SET balance = v_recipient_new, updated_at = now() WHERE id = v_recipient_account_id;

  INSERT INTO public.bank_transactions (user_id, account_id, description, amount, transaction_type, category, icon, balance_after)
  VALUES (v_sender_id, p_from_account_id, v_sender_desc, p_amount, 'debit', 'transfer', 'transfer', v_sender_new);

  INSERT INTO public.bank_transactions (user_id, account_id, description, amount, transaction_type, category, icon, balance_after)
  VALUES (v_recipient_id, v_recipient_account_id, v_recipient_desc, p_amount, 'credit', 'transfer', 'transfer', v_recipient_new);

  INSERT INTO public.transactions (
    user_id, type, amount, account_id, counterparty_user_id, counterparty_email, counterparty_name,
    description, balance_after, transfer_group_id
  ) VALUES (
    v_sender_id, 'transfer_sent', p_amount, p_from_account_id, v_recipient_id, v_email,
    (SELECT full_name FROM public.profiles WHERE id = v_recipient_id),
    v_sender_desc, v_sender_new, v_group_id
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.transactions (
    user_id, type, amount, account_id, counterparty_user_id, counterparty_email, counterparty_name,
    description, balance_after, transfer_group_id
  ) VALUES (
    v_recipient_id, 'transfer_received', p_amount, v_recipient_account_id, v_sender_id,
    (SELECT email FROM public.profiles WHERE id = v_sender_id),
    (SELECT full_name FROM public.profiles WHERE id = v_sender_id),
    v_recipient_desc, v_recipient_new, v_group_id
  );

  v_sender_total := public.sync_profile_balance(v_sender_id);
  v_recipient_total := public.sync_profile_balance(v_recipient_id);

  RETURN json_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'transfer_group_id', v_group_id,
    'sender_balance', v_sender_new,
    'sender_total_balance', v_sender_total,
    'recipient_name', (SELECT full_name FROM public.profiles WHERE id = v_recipient_id),
    'recipient_email', v_email,
    'message', 'Transfer completed successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_to_user(uuid, text, numeric, text) TO authenticated;

-- Update welcome banking to sync profile balance
CREATE OR REPLACE FUNCTION public.initialize_user_banking(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checking_id uuid;
  v_savings_id uuid;
  v_basic_id uuid;
  v_checking_last4 text;
  v_savings_last4 text;
  v_basic_last4 text;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.bank_accounts WHERE user_id = p_user_id LIMIT 1) THEN
    PERFORM public.sync_profile_balance(p_user_id);
    RETURN;
  END IF;

  v_checking_last4 := lpad((floor(random() * 10000))::text, 4, '0');
  v_savings_last4 := lpad((floor(random() * 10000))::text, 4, '0');
  v_basic_last4 := lpad((floor(random() * 10000))::text, 4, '0');

  INSERT INTO public.bank_accounts (user_id, account_name, account_type, account_number_last4, balance)
  VALUES (p_user_id, 'Everyday Checking', 'checking', v_checking_last4, 5000.00)
  RETURNING id INTO v_checking_id;

  INSERT INTO public.bank_accounts (user_id, account_name, account_type, account_number_last4, balance, apy)
  VALUES (p_user_id, 'Standard Savings', 'savings', v_savings_last4, 12000.00, 3.25)
  RETURNING id INTO v_savings_id;

  INSERT INTO public.bank_accounts (user_id, account_name, account_type, account_number_last4, balance, apy)
  VALUES (p_user_id, 'Basic Savings', 'savings', v_basic_last4, 3000.00, 2.10)
  RETURNING id INTO v_basic_id;

  INSERT INTO public.bank_transactions (user_id, account_id, description, amount, transaction_type, category, icon, balance_after)
  VALUES
    (p_user_id, v_checking_id, 'Welcome Bonus — Account Opening', 5000.00, 'credit', 'deposit', 'building', 5000.00),
    (p_user_id, v_savings_id, 'Welcome Bonus — Account Opening', 12000.00, 'credit', 'deposit', 'building', 12000.00),
    (p_user_id, v_basic_id, 'Welcome Bonus — Account Opening', 3000.00, 'credit', 'deposit', 'building', 3000.00);

  INSERT INTO public.transactions (user_id, type, amount, account_id, description, balance_after)
  VALUES
    (p_user_id, 'deposit', 5000.00, v_checking_id, 'Welcome Bonus — Account Opening', 5000.00),
    (p_user_id, 'deposit', 12000.00, v_savings_id, 'Welcome Bonus — Account Opening', 12000.00),
    (p_user_id, 'deposit', 3000.00, v_basic_id, 'Welcome Bonus — Account Opening', 3000.00);

  PERFORM public.sync_profile_balance(p_user_id);
END;
$$;

-- ─────────────────────────────────────────────
-- REALTIME
-- ─────────────────────────────────────────────

ALTER TABLE public.bank_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bank_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_accounts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END;
$$;
