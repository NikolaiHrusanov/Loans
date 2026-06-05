-- NexusBank — Card management (debit/credit vault + virtual cards)
-- Run in Supabase SQL Editor AFTER banking-schema.sql and money-management.sql

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_name text NOT NULL,
  card_type text NOT NULL CHECK (card_type IN ('debit', 'credit', 'virtual')),
  card_network text NOT NULL CHECK (card_network IN ('visa', 'mastercard', 'amex', 'discover')),
  last_four_digits text NOT NULL CHECK (last_four_digits ~ '^\d{4}$'),
  expiry_date text NOT NULL,
  cardholder_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'expired', 'cancelled')),
  is_virtual boolean NOT NULL DEFAULT false,
  spending_limit numeric(15, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cards_user_id_idx ON public.cards (user_id);
CREATE INDEX IF NOT EXISTS cards_status_idx ON public.cards (user_id, status);

CREATE TABLE IF NOT EXISTS public.card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(15, 2) NOT NULL CHECK (amount > 0),
  merchant_name text NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('purchase', 'payment', 'refund')),
  transaction_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_transactions_card_id_idx ON public.card_transactions (card_id);
CREATE INDEX IF NOT EXISTS card_transactions_user_id_idx ON public.card_transactions (user_id);
CREATE INDEX IF NOT EXISTS card_transactions_date_idx ON public.card_transactions (transaction_date DESC);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own cards" ON public.cards;
CREATE POLICY "Users read own cards"
  ON public.cards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own card transactions" ON public.card_transactions;
CREATE POLICY "Users read own card transactions"
  ON public.card_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Writes via SECURITY DEFINER RPCs only

-- ─────────────────────────────────────────────
-- HELPERS
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.random_card_last4()
RETURNS text
LANGUAGE sql
AS $$
  SELECT lpad((floor(random() * 10000))::text, 4, '0');
$$;

-- ─────────────────────────────────────────────
-- ADD EXTERNAL CARD (last 4 only — never full PAN/CVV)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_external_card(
  p_card_name text,
  p_card_type text,
  p_card_network text,
  p_last_four_digits text,
  p_expiry_date text,
  p_cardholder_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_holder text;
  v_card_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_card_type NOT IN ('debit', 'credit') THEN
    RAISE EXCEPTION 'Card type must be debit or credit';
  END IF;

  IF p_card_network NOT IN ('visa', 'mastercard', 'amex', 'discover') THEN
    RAISE EXCEPTION 'Invalid card network';
  END IF;

  IF p_last_four_digits IS NULL OR p_last_four_digits !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'Enter exactly 4 digits (last four of card number only)';
  END IF;

  SELECT COALESCE(NULLIF(trim(p_cardholder_name), ''), full_name)
  INTO v_holder
  FROM public.profiles
  WHERE id = v_user_id;

  INSERT INTO public.cards (
    user_id, card_name, card_type, card_network, last_four_digits,
    expiry_date, cardholder_name, status, is_virtual
  ) VALUES (
    v_user_id,
    COALESCE(NULLIF(trim(p_card_name), ''), 'My Card'),
    p_card_type,
    lower(p_card_network),
    p_last_four_digits,
    COALESCE(NULLIF(trim(p_expiry_date), ''), '12/29'),
    COALESCE(v_holder, 'Cardholder'),
    'active',
    false
  )
  RETURNING id INTO v_card_id;

  RETURN json_build_object(
    'success', true,
    'card_id', v_card_id,
    'message', 'Card saved securely (last 4 digits only)'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_external_card(text, text, text, text, text, text) TO authenticated;

-- ─────────────────────────────────────────────
-- CREATE VIRTUAL NEXUSBANK CARD
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_virtual_card(
  p_card_name text DEFAULT 'Nexus Virtual Card',
  p_spending_limit numeric DEFAULT 1000
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_holder text;
  v_last4 text;
  v_network text;
  v_expiry text;
  v_card_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_spending_limit IS NULL OR p_spending_limit <= 0 THEN
    RAISE EXCEPTION 'Spending limit must be greater than zero';
  END IF;

  SELECT full_name INTO v_holder FROM public.profiles WHERE id = v_user_id;
  v_last4 := public.random_card_last4();
  v_network := CASE WHEN random() < 0.5 THEN 'visa' ELSE 'mastercard' END;
  v_expiry := to_char((now() + interval '3 years')::date, 'MM/YY');

  INSERT INTO public.cards (
    user_id, card_name, card_type, card_network, last_four_digits,
    expiry_date, cardholder_name, status, is_virtual, spending_limit
  ) VALUES (
    v_user_id,
    COALESCE(NULLIF(trim(p_card_name), ''), 'Nexus Virtual Card'),
    'virtual',
    v_network,
    v_last4,
    v_expiry,
    COALESCE(v_holder, 'NexusBank Member'),
    'active',
    true,
    p_spending_limit
  )
  RETURNING id INTO v_card_id;

  RETURN json_build_object(
    'success', true,
    'card_id', v_card_id,
    'last_four_digits', v_last4,
    'card_network', v_network,
    'expiry_date', v_expiry,
    'message', 'Virtual card created'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_virtual_card(text, numeric) TO authenticated;

-- ─────────────────────────────────────────────
-- FREEZE / UNFREEZE CARD
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_card_status(
  p_card_id uuid,
  p_status text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN ('active', 'frozen') THEN
    RAISE EXCEPTION 'Status must be active or frozen';
  END IF;

  UPDATE public.cards
  SET status = p_status, updated_at = now()
  WHERE id = p_card_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card not found';
  END IF;

  RETURN json_build_object(
    'success', true,
    'status', p_status,
    'message', CASE WHEN p_status = 'frozen' THEN 'Card frozen' ELSE 'Card unfrozen' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_card_status(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────
-- UPDATE SPENDING LIMIT (virtual cards)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_card_spending_limit(
  p_card_id uuid,
  p_spending_limit numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_spending_limit IS NULL OR p_spending_limit <= 0 THEN
    RAISE EXCEPTION 'Spending limit must be greater than zero';
  END IF;

  UPDATE public.cards
  SET spending_limit = p_spending_limit, updated_at = now()
  WHERE id = p_card_id AND user_id = v_user_id AND is_virtual = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Virtual card not found';
  END IF;

  RETURN json_build_object('success', true, 'message', 'Spending limit updated');
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_card_spending_limit(uuid, numeric) TO authenticated;

-- Realtime (enable in Dashboard → Database → Replication if not already on)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.card_transactions;
