-- Manage the founder super-admin list from the admin console (no SQL needed).
-- All three are platform-admin-gated and read auth.users via SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.list_platform_admins()
RETURNS TABLE(user_id uuid, email text, added_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pa.user_id, u.email::text, pa.added_at
  FROM platform_admins pa JOIN auth.users u ON u.id = pa.user_id
  WHERE is_platform_admin() ORDER BY pa.added_at;
$$;
CREATE OR REPLACE FUNCTION public.add_platform_admin(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE v_id uuid;
  BEGIN
    IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Only platform admins can manage platform admins'; END IF;
    SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(trim(p_email));
    IF v_id IS NULL THEN RAISE EXCEPTION 'No CampCommand account exists for %. They must sign in once first, then you can add them.', p_email; END IF;
    INSERT INTO platform_admins (user_id, added_by) VALUES (v_id, auth.uid()) ON CONFLICT DO NOTHING;
  END;
$$;
CREATE OR REPLACE FUNCTION public.remove_platform_admin(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Only platform admins can manage platform admins'; END IF;
    IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot remove your own platform-admin access'; END IF;
    DELETE FROM platform_admins WHERE user_id = p_user_id;
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_platform_admins() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_platform_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_platform_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_platform_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_platform_admin(uuid) TO authenticated;
