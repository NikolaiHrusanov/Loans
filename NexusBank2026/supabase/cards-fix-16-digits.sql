-- Quick patch: enforce exactly 16-digit card numbers for Add Existing Card
-- Run in Supabase SQL Editor if cards still reject valid numbers.

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
  IF length(v) <> 16 THEN
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
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_pan text;
  v_last4 text;
  v_network text;
  v_holder text;
  v_card_id uuid;
  v_cvv_clean text;
  v_expiry text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_pan := regexp_replace(p_card_number, '\D', '', 'g');
  v_cvv_clean := regexp_replace(COALESCE(p_cvv, ''), '\D', '', 'g');
  v_expiry := trim(COALESCE(p_expiry_date, ''));

  IF length(v_pan) <> 16 THEN
    RAISE EXCEPTION 'Card number must be exactly 16 digits';
  END IF;

  IF NOT public.validate_pan(v_pan) THEN
    RAISE EXCEPTION 'Invalid card number — check all 16 digits';
  END IF;

  IF length(v_cvv_clean) <> 3 THEN
    RAISE EXCEPTION 'CVV must be exactly 3 digits';
  END IF;

  IF NOT public.validate_card_expiry(v_expiry) THEN
    RAISE EXCEPTION 'Invalid or expired card expiry (use MM/YY)';
  END IF;

  IF p_card_type NOT IN ('debit', 'credit') THEN
    RAISE EXCEPTION 'Card type must be debit or credit';
  END IF;

  v_last4 := right(v_pan, 4);
  v_network := public.detect_card_network(v_pan);
  v_holder := COALESCE(NULLIF(trim(p_cardholder_name), ''), 'Cardholder');

  IF EXISTS (
    SELECT 1 FROM public.cards
    WHERE user_id = v_user_id
      AND is_virtual = false
      AND card_network = v_network
      AND last_four_digits = v_last4
  ) THEN
    RAISE EXCEPTION 'This card is already linked to your account';
  END IF;

  INSERT INTO public.cards (
    user_id, card_name, card_type, partner_type, card_network,
    encrypted_card_number, last_four_digits, expiry_date, cardholder_name,
    status, is_virtual, balance, card_theme
  ) VALUES (
    v_user_id,
    COALESCE(NULLIF(trim(p_card_name), ''), initcap(v_network) || ' •••• ' || v_last4),
    p_card_type,
    'none',
    v_network,
    public.encrypt_card_number(v_user_id, v_pan),
    v_last4,
    v_expiry,
    v_holder,
    'active',
    false,
    0,
    'midnight'
  )
  RETURNING id INTO v_card_id;

  INSERT INTO public.card_settings (card_id, user_id, spending_limit, frozen)
  VALUES (v_card_id, v_user_id, NULL, false)
  ON CONFLICT (card_id) DO NOTHING;

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
