-- Team RPCs: authorize through is_camp_admin() instead of an inlined membership check.
--
-- Companion to 20260812140000_staff_groups_platform_admin_rls.sql. Both of these are the
-- staff-group-aware OVERLOADS added in 20260709232544_staff_groups_backfill.sql. The older
-- overloads they sit beside were already updated to is_camp_admin(); these two kept the
-- inlined `camp_members ... role = 'admin'` test, so a platform admin viewing a camp they
-- don't belong to hit `RAISE EXCEPTION 'Forbidden'`.
--
-- PostgREST resolves by argument list, and the web app always passes p_staff_group_id, so
-- these overloads are the ones Settings → Team actually calls. The corrected 5-arg and
-- 3-arg versions were never reached.
--
-- Signatures are unchanged so overload resolution stays exactly as it is. Every other guard
-- (no admin join codes, cannot remove the last admin) is preserved verbatim.

CREATE OR REPLACE FUNCTION public.generate_join_code(
  p_camp_id uuid,
  p_role text,
  p_dept text DEFAULT NULL::text,
  p_max_uses integer DEFAULT NULL::integer,
  p_days integer DEFAULT 30,
  p_staff_group_id uuid DEFAULT NULL::uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  IF NOT public.is_camp_admin(p_camp_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_role = 'admin' THEN
    RAISE EXCEPTION 'Join codes cannot grant admin access. Use direct email invitations for admins.';
  END IF;

  LOOP
    v_code := UPPER(SUBSTRING(MD5(RANDOM()::text) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM public.camp_join_codes WHERE code = v_code AND is_active = true)
      INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  INSERT INTO public.camp_join_codes
    (camp_id, code, role, department, max_uses, expires_at, staff_group_id, created_by)
  VALUES
    (p_camp_id, v_code, p_role, p_dept, p_max_uses,
     NOW() + (p_days || ' days')::INTERVAL, p_staff_group_id, auth.uid());

  RETURN v_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_member_role(
  p_member_id uuid,
  p_role text,
  p_department text DEFAULT NULL::text,
  p_staff_group_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_camp_id uuid;
BEGIN
  SELECT camp_id INTO v_camp_id FROM public.camp_members WHERE id = p_member_id;

  IF NOT public.is_camp_admin(v_camp_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Unchanged: a camp must keep at least one real admin, even when a platform admin is the
  -- one making the change.
  IF p_role != 'admin'
     AND (SELECT role FROM public.camp_members WHERE id = p_member_id) = 'admin'
     AND (SELECT COUNT(*) FROM public.camp_members
          WHERE camp_id = v_camp_id AND role = 'admin' AND is_active = true) <= 1
  THEN RAISE EXCEPTION 'Cannot remove the last admin'; END IF;

  UPDATE public.camp_members
  SET role = p_role, department = p_department, staff_group_id = p_staff_group_id
  WHERE id = p_member_id;
END;
$function$;
