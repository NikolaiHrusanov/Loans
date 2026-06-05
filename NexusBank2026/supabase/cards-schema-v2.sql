-- NexusBank Cards v2 — encryption, partners, settings, analytics
-- Run AFTER cards-schema.sql (or on fresh DB run cards-schema.sql then this file)

-- Supabase installs pgcrypto in the "extensions" schema (not public).
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─────────────────────────────────────────────
-- SCHEMA UPGRADES
-- ─────────────────────────────────────────────

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS partner_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS encrypted_card_number bytea,
  ADD COLUMN IF NOT EXISTS balance numeric(15, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  ADD COLUMN IF NOT EXISTS card_theme text NOT NULL DEFAULT 'purple',
  ADD COLUMN IF NOT EXISTS is_single_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_freeze boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.card_transactions
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';

CREATE TABLE IF NOT EXISTS public.card_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL UNIQUE REFERENCES public.cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  online_payments boolean NOT NULL DEFAULT true,
  atm_withdrawals boolean NOT NULL DEFAULT true,
  international_payments boolean NOT NULL DEFAULT true,
  merchant_restrictions text,
  frozen boolean NOT NULL DEFAULT false,
  spending_limit numeric(15, 2),
  single_use boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_settings_card_id_idx ON public.card_settings (card_id);
CREATE INDEX IF NOT EXISTS card_settings_user_id_idx ON public.card_settings (user_id);

ALTER TABLE public.card_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own card settings" ON public.card_settings;
CREATE POLICY "Users read own card settings"
  ON public.card_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Safe read view (never exposes encrypted PAN)
CREATE OR REPLACE VIEW public.cards_safe
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  card_name,
  card_type,
  partner_type,
  card_network,
  cardholder_name,
  last_four_digits,
  expiry_date,
  status,
  is_virtual,
  spending_limit,
  balance,
  card_theme,
  is_single_use,
  online_only,
  allow_freeze,
  expires_at,
  created_at,
  updated_at
FROM public.cards;

GRANT SELECT ON public.cards_safe TO authenticated;

-- ─────────────────────────────────────────────
-- ENCRYPTION HELPERS (CVV is never stored)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.nexus_card_encryption_key(p_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(
    extensions.digest((p_user_id::text || '_nexus_cards_v2')::bytea, 'sha256'),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.encrypt_card_number(p_user_id uuid, p_pan text)
RETURNS bytea
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_encrypt(
    p_pan::text,
    public.nexus_card_encryption_key(p_user_id)::text
  );
$$;

CREATE OR REPLACE FUNCTION public.detect_card_network(p_pan text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := regexp_replace(p_pan, '\D', '', 'g');
BEGIN
  IF v ~ '^4' THEN RETURN 'visa'; END IF;
  IF v ~ '^3[47]' THEN RETURN 'amex'; END IF;
  IF v ~ '^6011|^65' THEN RETURN 'discover'; END IF;
  IF v ~ '^5[1-5]' OR (length(v) >= 4 AND substring(v, 1, 4)::int BETWEEN 2221 AND 2720) THEN
    RETURN 'mastercard';
  END IF;
  RETURN 'visa';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_pan(p_pan text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := regexp_replace(p_pan, '\D', '', 'g');
  i int;
  sum int := 0;
  n int;
  alt boolean := false;
BEGIN
  IF length(v) NOT BETWEEN 13 AND 19 THEN
    RETURN false;
  END IF;
  FOR i IN REVERSE length(v)..1 LOOP
    n := substring(v, i, 1)::int;
    IF alt THEN
      n := n * 2;
      IF n > 9 THEN n := n - 9; END IF;
    END IF;
    sum := sum + n;
    alt := NOT alt;
  END LOOP;
  RETURN sum % 10 = 0;
END;
$$;

-- ─────────────────────────────────────────────
-- ADD EXTERNAL CARD (full PAN encrypted; CVV verified then discarded)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_external_card_secure(
  p_card_number text,
  p_cardholder_name text,
  p_expiry_date text,
  p_cvv text,
  p_card_name text DEFAULT NULL,
  p_card_type text DEFAULT 'debit'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_pan text;
  v_last4 text;
  v_network text;
  v_holder text;
  v_card_id uuid;
  v_cvv_clean text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_pan := regexp_replace(p_card_number, '\D', '', 'g');
  v_cvv_clean := regexp_replace(COALESCE(p_cvv, ''), '\D', '', 'g');

  IF NOT public.validate_pan(v_pan) THEN
    RAISE EXCEPTION 'Invalid card number';
  END IF;

  IF length(v_cvv_clean) NOT IN (3, 4) THEN
    RAISE EXCEPTION 'Invalid CVV';
  END IF;

  IF p_card_type NOT IN ('debit', 'credit') THEN
    RAISE EXCEPTION 'Card type must be debit or credit';
  END IF;

  v_last4 := right(v_pan, 4);
  v_network := public.detect_card_network(v_pan);
  v_holder := COALESCE(NULLIF(trim(p_cardholder_name), ''), 'Cardholder');

  INSERT INTO public.cards (
    user_id, card_name, card_type, partner_type, card_network,
    encrypted_card_number, last_four_digits, expiry_date, cardholder_name,
    status, is_virtual, balance, card_theme
  ) VALUES (
    v_user_id,
    COALESCE(NULLIF(trim(p_card_name), ''), v_network || ' •••• ' || v_last4),
    p_card_type,
    'none',
    v_network,
    public.encrypt_card_number(v_user_id, v_pan),
    v_last4,
    COALESCE(NULLIF(trim(p_expiry_date), ''), '12/29'),
    v_holder,
    'active',
    false,
    0,
    'midnight'
  )
  RETURNING id INTO v_card_id;

  INSERT INTO public.card_settings (card_id, user_id, spending_limit, frozen)
  VALUES (v_card_id, v_user_id, NULL, false);

  RETURN json_build_object(
    'success', true,
    'card_id', v_card_id,
    'card_network', v_network,
    'last_four_digits', v_last4,
    'display', initcap(v_network) || ' •••• •••• •••• ' || v_last4,
    'message', 'Card saved securely. Full number is encrypted and never shown again.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_external_card_secure(text, text, text, text, text, text) TO authenticated;

-- ─────────────────────────────────────────────
-- CREATE NEXUS VIRTUAL CARD (Standard / Flexi / Blaze)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_nexus_virtual_card(
  p_card_name text DEFAULT 'Nexus Virtual Card',
  p_partner_type text DEFAULT 'standard',
  p_spending_limit numeric DEFAULT 1000,
  p_card_theme text DEFAULT 'purple',
  p_online_only boolean DEFAULT false,
  p_single_use boolean DEFAULT false,
  p_allow_freeze boolean DEFAULT true,
  p_expires_months int DEFAULT 36
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
  v_pan text;
  v_network text;
  v_expiry text;
  v_card_id uuid;
  v_theme text;
  v_partner text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_partner := lower(trim(p_partner_type));
  IF v_partner NOT IN ('standard', 'flexi', 'blaze_wear') THEN
    RAISE EXCEPTION 'Invalid partner type';
  END IF;

  IF p_spending_limit IS NULL OR p_spending_limit <= 0 THEN
    RAISE EXCEPTION 'Spending limit must be greater than zero';
  END IF;

  v_theme := lower(trim(p_card_theme));
  IF v_theme NOT IN ('purple', 'gold', 'teal', 'pink', 'midnight', 'flexi', 'blaze') THEN
    v_theme := CASE v_partner
      WHEN 'flexi' THEN 'flexi'
      WHEN 'blaze_wear' THEN 'blaze'
      ELSE 'purple'
    END;
  END IF;

  SELECT full_name INTO v_holder FROM public.profiles WHERE id = v_user_id;
  v_last4 := public.random_card_last4();
  v_network := CASE WHEN random() < 0.5 THEN 'visa' ELSE 'mastercard' END;
  v_pan := '4' || lpad(floor(random() * 100000000000000::numeric)::text, 15, '0');
  v_pan := left(v_pan, 15) || v_last4;
  v_expiry := to_char((now() + make_interval(months => COALESCE(p_expires_months, 36)))::date, 'MM/YY');

  INSERT INTO public.cards (
    user_id, card_name, card_type, partner_type, card_network,
    encrypted_card_number, last_four_digits, expiry_date, cardholder_name,
    status, is_virtual, spending_limit, balance, card_theme,
    is_single_use, online_only, allow_freeze, expires_at
  ) VALUES (
    v_user_id,
    COALESCE(NULLIF(trim(p_card_name), ''), 'Nexus ' || initcap(replace(v_partner, '_', ' ')) || ' Card'),
    'virtual',
    v_partner,
    v_network,
    public.encrypt_card_number(v_user_id, v_pan),
    v_last4,
    v_expiry,
    COALESCE(v_holder, 'NexusBank Member'),
    'active',
    true,
    p_spending_limit,
    p_spending_limit,
    v_theme,
    COALESCE(p_single_use, false),
    COALESCE(p_online_only, false),
    COALESCE(p_allow_freeze, true),
    now() + make_interval(months => COALESCE(p_expires_months, 36))
  )
  RETURNING id INTO v_card_id;

  INSERT INTO public.card_settings (
    card_id, user_id, online_payments, atm_withdrawals, international_payments,
    frozen, spending_limit, single_use
  ) VALUES (
    v_card_id, v_user_id,
    true,
    NOT COALESCE(p_online_only, false),
    true,
    false,
    p_spending_limit,
    COALESCE(p_single_use, false)
  );

  RETURN json_build_object(
    'success', true,
    'card_id', v_card_id,
    'partner_type', v_partner,
    'last_four_digits', v_last4,
    'card_network', v_network,
    'expiry_date', v_expiry,
    'card_theme', v_theme,
    'display', initcap(v_network) || ' •••• •••• •••• ' || v_last4,
    'message', 'Virtual card created instantly'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_nexus_virtual_card(text, text, numeric, text, boolean, boolean, boolean, int) TO authenticated;

-- ─────────────────────────────────────────────
-- CARD SETTINGS
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_card_settings(
  p_card_id uuid,
  p_online_payments boolean DEFAULT NULL,
  p_atm_withdrawals boolean DEFAULT NULL,
  p_international_payments boolean DEFAULT NULL,
  p_merchant_restrictions text DEFAULT NULL,
  p_spending_limit numeric DEFAULT NULL
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

  UPDATE public.card_settings cs
  SET
    online_payments = COALESCE(p_online_payments, cs.online_payments),
    atm_withdrawals = COALESCE(p_atm_withdrawals, cs.atm_withdrawals),
    international_payments = COALESCE(p_international_payments, cs.international_payments),
    merchant_restrictions = COALESCE(p_merchant_restrictions, cs.merchant_restrictions),
    spending_limit = COALESCE(p_spending_limit, cs.spending_limit),
    updated_at = now()
  FROM public.cards c
  WHERE cs.card_id = p_card_id
    AND cs.card_id = c.id
    AND c.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card settings not found';
  END IF;

  IF p_spending_limit IS NOT NULL THEN
    UPDATE public.cards
    SET spending_limit = p_spending_limit, updated_at = now()
    WHERE id = p_card_id AND user_id = v_user_id AND is_virtual = true;
  END IF;

  RETURN json_build_object('success', true, 'message', 'Card settings updated');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_card_settings(uuid, boolean, boolean, boolean, text, numeric) TO authenticated;

-- Keep legacy RPCs working (delegate to v2 where needed)
CREATE OR REPLACE FUNCTION public.create_virtual_card(
  p_card_name text DEFAULT 'Nexus Virtual Card',
  p_spending_limit numeric DEFAULT 1000
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.create_nexus_virtual_card(
    p_card_name, 'standard', p_spending_limit, 'purple', false, false, true, 36
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_card_status(p_card_id uuid, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_frozen boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN ('active', 'frozen') THEN
    RAISE EXCEPTION 'Status must be active or frozen';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cards
    WHERE id = p_card_id AND user_id = v_user_id AND allow_freeze = true
  ) THEN
    RAISE EXCEPTION 'Card not found or freeze not permitted';
  END IF;

  v_frozen := p_status = 'frozen';

  UPDATE public.cards
  SET status = p_status, updated_at = now()
  WHERE id = p_card_id AND user_id = v_user_id;

  UPDATE public.card_settings
  SET frozen = v_frozen, updated_at = now()
  WHERE card_id = p_card_id AND user_id = v_user_id;

  RETURN json_build_object(
    'success', true,
    'status', p_status,
    'message', CASE WHEN v_frozen THEN 'Card frozen' ELSE 'Card unfrozen' END
  );
END;
$$;

-- ─────────────────────────────────────────────
-- ANALYTICS
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_card_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_monthly numeric(15, 2);
  v_weekly numeric(15, 2);
  v_most_card text;
  v_categories json;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_monthly
  FROM public.card_transactions
  WHERE user_id = v_user_id
    AND transaction_type = 'purchase'
    AND transaction_date >= date_trunc('month', now());

  SELECT COALESCE(SUM(amount), 0) INTO v_weekly
  FROM public.card_transactions
  WHERE user_id = v_user_id
    AND transaction_type = 'purchase'
    AND transaction_date >= date_trunc('week', now());

  SELECT COALESCE(c.card_name, '—') INTO v_most_card
  FROM public.card_transactions ct
  JOIN public.cards c ON c.id = ct.card_id
  WHERE ct.user_id = v_user_id AND ct.transaction_type = 'purchase'
  GROUP BY c.card_name
  ORDER BY SUM(ct.amount) DESC
  LIMIT 1;

  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_categories
  FROM (
    SELECT COALESCE(category, 'general') AS name, SUM(amount) AS total
    FROM public.card_transactions
    WHERE user_id = v_user_id
      AND transaction_type = 'purchase'
      AND transaction_date >= date_trunc('month', now())
    GROUP BY COALESCE(category, 'general')
    ORDER BY total DESC
    LIMIT 6
  ) t;

  RETURN json_build_object(
    'monthly_spending', v_monthly,
    'weekly_spending', v_weekly,
    'most_used_card', COALESCE(v_most_card, '—'),
    'categories', v_categories
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_card_analytics() TO authenticated;

-- Backfill settings for cards created before v2
INSERT INTO public.card_settings (card_id, user_id, spending_limit, frozen)
SELECT c.id, c.user_id, c.spending_limit, c.status = 'frozen'
FROM public.cards c
WHERE NOT EXISTS (SELECT 1 FROM public.card_settings cs WHERE cs.card_id = c.id);

-- Realtime
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.card_settings;
