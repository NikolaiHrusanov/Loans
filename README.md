-- NexusBank — Loans: one active loan per user, disbursement & payments.
-- Run in Supabase SQL Editor AFTER supabase/banking-schema.sql and supabase/money-management.sql

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loan_type text NOT NULL DEFAULT 'personal' CHECK (loan_type IN ('personal', 'auto', 'home')),
  principal_amount numeric(15, 2) NOT NULL CHECK (principal_amount > 0),
  remaining_balance numeric(15, 2) NOT NULL CHECK (remaining_balance >= 0),
  term_months integer NOT NULL CHECK (term_months >= 12 AND term_months <= 120),
  interest_rate numeric(5, 2) NOT NULL CHECK (interest_rate > 0),
  monthly_payment numeric(15, 2) NOT NULL CHECK (monthly_payment > 0),
  total_repayment numeric(15, 2) NOT NULL CHECK (total_repayment > 0),
  protection_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off')),
  next_payment_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loans_user_id_idx ON public.loans (user_id);

-- Only one active loan per user
CREATE UNIQUE INDEX IF NOT EXISTS loans_one_active_per_user
  ON public.loans (user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  amount numeric(15, 2) NOT NULL CHECK (amount > 0),
  balance_after numeric(15, 2) NOT NULL CHECK (balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loan_payments_loan_id_idx ON public.loan_payments (loan_id);
CREATE INDEX IF NOT EXISTS loan_payments_user_id_idx ON public.loan_payments (user_id);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own loans" ON public.loans;
CREATE POLICY "Users read own loans"
  ON public.loans FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own loan payments" ON public.loan_payments;
CREATE POLICY "Users read own loan payments"
  ON public.loan_payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- APPLY FOR LOAN (max 1 active; disburses to checking)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_for_loan(
  p_principal numeric,
  p_term_months integer,
  p_interest_rate numeric,
  p_monthly_payment numeric,
  p_total_repayment numeric,
  p_protection_enabled boolean DEFAULT false,
  p_loan_type text DEFAULT 'personal'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_loan_id uuid;
  v_account_id uuid;
  v_account public.bank_accounts%ROWTYPE;
  v_new_balance numeric(15, 2);
  v_total numeric(15, 2);
  v_type text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_principal IS NULL OR p_principal < 1000 OR p_principal > 40000 THEN
    RAISE EXCEPTION 'Loan amount must be between 1,000 and 40,000';
  END IF;

  IF p_term_months IS NULL OR p_term_months < 12 OR p_term_months > 120 THEN
    RAISE EXCEPTION 'Loan term must be between 12 and 120 months';
  END IF;

  IF p_monthly_payment IS NULL OR p_monthly_payment <= 0 THEN
    RAISE EXCEPTION 'Invalid monthly payment';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.loans
    WHERE user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You already have an active loan. Pay it off before applying for another.';
  END IF;

  v_type := COALESCE(NULLIF(trim(p_loan_type), ''), 'personal');
  IF v_type NOT IN ('personal', 'auto', 'home') THEN
    v_type := 'personal';
  END IF;

  PERFORM public.ensure_user_banking();

  v_account_id := public.get_primary_account_id(v_user_id);

  SELECT * INTO v_account
  FROM public.bank_accounts
  WHERE id = v_account_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No checking account found for disbursement';
  END IF;

  INSERT INTO public.loans (
    user_id,
    loan_type,
    principal_amount,
    remaining_balance,
    term_months,
    interest_rate,
    monthly_payment,
    total_repayment,
    protection_enabled,
    status,
    next_payment_date
  ) VALUES (
    v_user_id,
    v_type,
    p_principal,
    p_principal,
    p_term_months,
    p_interest_rate,
    p_monthly_payment,
    p_total_repayment,
    COALESCE(p_protection_enabled, false),
    'active',
    (CURRENT_DATE + INTERVAL '1 month')::date
  ) RETURNING id INTO v_loan_id;

  v_new_balance := v_account.balance + p_principal;

  UPDATE public.bank_accounts
  SET balance = v_new_balance, updated_at = now()
  WHERE id = v_account_id;

  INSERT INTO public.bank_transactions (
    user_id, account_id, description, amount, transaction_type, category, icon, balance_after
  ) VALUES (
    v_user_id, v_account_id,
    'Loan Disbursement — ' || initcap(v_type) || ' Loan',
    p_principal, 'credit', 'loan', 'percentage', v_new_balance
  );

  INSERT INTO public.transactions (
    user_id, type, amount, account_id, description, balance_after
  ) VALUES (
    v_user_id, 'deposit', p_principal, v_account_id,
    'Loan Disbursement — ' || initcap(v_type) || ' Loan',
    v_new_balance
  );

  v_total := public.sync_profile_balance(v_user_id);

  RETURN json_build_object(
    'success', true,
    'loan_id', v_loan_id,
    'disbursed_to', v_account_id,
    'account_balance', v_new_balance,
    'total_balance', v_total,
    'message', 'Loan approved! Funds deposited to your checking account.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_for_loan(numeric, integer, numeric, numeric, numeric, boolean, text) TO authenticated;

-- ─────────────────────────────────────────────
-- PAY LOAN (reduces remaining balance)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pay_loan(
  p_loan_id uuid,
  p_account_id uuid,
  p_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_loan public.loans%ROWTYPE;
  v_account public.bank_accounts%ROWTYPE;
  v_new_account_balance numeric(15, 2);
  v_new_loan_balance numeric(15, 2);
  v_total numeric(15, 2);
  v_payment_id uuid;
  v_new_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  IF v_loan.status <> 'active' THEN
    RAISE EXCEPTION 'This loan is already paid off';
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

  IF p_amount > v_loan.remaining_balance THEN
    RAISE EXCEPTION 'Payment exceeds remaining loan balance of %', v_loan.remaining_balance;
  END IF;

  v_new_account_balance := v_account.balance - p_amount;
  v_new_loan_balance := v_loan.remaining_balance - p_amount;
  v_new_status := CASE WHEN v_new_loan_balance <= 0 THEN 'paid_off' ELSE 'active' END;

  UPDATE public.bank_accounts
  SET balance = v_new_account_balance, updated_at = now()
  WHERE id = p_account_id;

  UPDATE public.loans
  SET
    remaining_balance = v_new_loan_balance,
    status = v_new_status,
    next_payment_date = CASE
      WHEN v_new_status = 'paid_off' THEN NULL
      ELSE (COALESCE(v_loan.next_payment_date, CURRENT_DATE) + INTERVAL '1 month')::date
    END,
    updated_at = now()
  WHERE id = p_loan_id;

  INSERT INTO public.bank_transactions (
    user_id, account_id, description, amount, transaction_type, category, icon, balance_after
  ) VALUES (
    v_user_id, p_account_id,
    'Loan Payment',
    p_amount, 'debit', 'loan', 'percentage', v_new_account_balance
  );

  INSERT INTO public.transactions (
    user_id, type, amount, account_id, description, balance_after
  ) VALUES (
    v_user_id, 'withdrawal', p_amount, p_account_id,
    'Loan Payment',
    v_new_account_balance
  );

  INSERT INTO public.loan_payments (
    loan_id, user_id, account_id, amount, balance_after
  ) VALUES (
    p_loan_id, v_user_id, p_account_id, p_amount, v_new_loan_balance
  ) RETURNING id INTO v_payment_id;

  v_total := public.sync_profile_balance(v_user_id);

  RETURN json_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'remaining_balance', v_new_loan_balance,
    'loan_status', v_new_status,
    'account_balance', v_new_account_balance,
    'total_balance', v_total,
    'message', CASE
      WHEN v_new_status = 'paid_off' THEN 'Congratulations! Your loan is fully paid off.'
      ELSE 'Loan payment successful'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_loan(uuid, uuid, numeric) TO authenticated;
