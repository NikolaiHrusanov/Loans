-- Exact recipient lookup for transfers (run in Supabase SQL Editor)
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.lookup_registered_user_by_email(p_email text)
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(p_email));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_email IS NULL OR v_email NOT LIKE '%@%' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email
  FROM public.profiles p
  WHERE lower(p.email) = v_email
    AND p.account_status = 'active'
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_registered_user_by_email(text) TO authenticated;
