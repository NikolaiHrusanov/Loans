-- Run once in Supabase Dashboard → SQL Editor
-- Fixes sign-in when custom 8-digit email verification succeeded but Auth email was never confirmed.

CREATE OR REPLACE FUNCTION public.confirm_auth_email_after_verification(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_has_verified_code boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.verification_codes
    WHERE email = lower(trim(p_email))
      AND type = 'email'
      AND used = true
      AND created_at > now() - interval '24 hours'
  ) INTO v_has_verified_code;

  IF v_has_verified_code THEN
    UPDATE auth.users
    SET
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
    WHERE lower(email) = lower(trim(p_email));

    RETURN FOUND;
  END IF;

  -- Supabase OTP / magic link (no row in verification_codes)
  IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email) = lower(trim(p_email))
      AND email_confirmed_at IS NOT NULL
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_auth_email_after_verification(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_auth_email_after_verification(text) TO anon, authenticated;

-- Lets registration finish when step 2 email verification was skipped (sign-in needs confirmed email).
CREATE OR REPLACE FUNCTION public.confirm_auth_email_for_registration(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
  WHERE lower(email) = lower(trim(p_email));

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_auth_email_for_registration(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_auth_email_for_registration(text) TO anon, authenticated;

-- One-time backfill for accounts that already completed registration
UPDATE auth.users u
SET
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  updated_at = now()
FROM public.profiles p
WHERE p.id = u.id
  AND p.email_verified = true
  AND u.email_confirmed_at IS NULL;
