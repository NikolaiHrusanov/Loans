-- NexusBank — per-user banking tables, RLS, and $20,000 welcome setup.
-- Run once in Supabase SQL Editor (Dashboard → SQL → New query).

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('checking', 'savings', 'investment')),
  account_number_last4 text NOT NULL,
  balance numeric(15, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency text NOT NULL DEFAULT 'USD',
  apy numeric(5, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_accounts_user_id_idx ON public.bank_accounts (user_id);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(15, 2) NOT NULL CHECK (amount > 0),
  transaction_type text NOT NULL CHECK (transaction_type IN ('credit', 'debit')),
  category text,
  icon text,
  balance_after numeric(15, 2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_transactions_user_id_idx ON public.bank_transactions (user_id);
CREATE INDEX IF NOT EXISTS bank_transactions_account_id_idx ON public.bank_transactions (account_id);
CREATE INDEX IF NOT EXISTS bank_transactions_created_at_idx ON public.bank_transactions (created_at DESC);

-- ─────────────────────────────────────────────
-- INITIALIZE $20,000 WELCOME BALANCE (per user)
-- ─────────────────────────────────────────────

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
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.bank_accounts WHERE user_id = p_user_id LIMIT 1) THEN
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

  INSERT INTO public.bank_transactions (
    user_id, account_id, description, amount, transaction_type, category, icon, balance_after, created_at
  ) VALUES
    (p_user_id, v_checking_id, 'Welcome Bonus — Account Opening', 5000.00, 'credit', 'deposit', 'building', 5000.00, now()),
    (p_user_id, v_savings_id, 'Welcome Bonus — Account Opening', 12000.00, 'credit', 'deposit', 'building', 12000.00, now()),
    (p_user_id, v_basic_id, 'Welcome Bonus — Account Opening', 3000.00, 'credit', 'deposit', 'building', 3000.00, now());
END;
$$;

-- Auto-provision banking when a profile row is created (registration).
CREATE OR REPLACE FUNCTION public.on_profile_created_init_banking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.initialize_user_banking(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_created_banking ON public.profiles;
CREATE TRIGGER profile_created_banking
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.on_profile_created_init_banking();

-- Callable from the app for users who registered before this migration.
CREATE OR REPLACE FUNCTION public.ensure_user_banking()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_total numeric(15, 2);
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.initialize_user_banking(v_user_id);

  SELECT COALESCE(SUM(balance), 0), COUNT(*)
  INTO v_total, v_count
  FROM public.bank_accounts
  WHERE user_id = v_user_id;

  RETURN json_build_object(
    'total_balance', v_total,
    'account_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_banking() TO authenticated;

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY — each user sees only their data
-- ─────────────────────────────────────────────

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own bank accounts" ON public.bank_accounts;
CREATE POLICY "Users read own bank accounts"
  ON public.bank_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own transactions" ON public.bank_transactions;
CREATE POLICY "Users read own transactions"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Inserts/updates are handled by SECURITY DEFINER functions only (no client write policies).
