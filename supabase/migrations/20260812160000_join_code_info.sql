-- Preview a join code without consuming it.
--
-- Counterpart to invitation_info(). The passwordless staff flow needs to answer "is this code
-- real, and which camp is it for?" BEFORE asking for an email address, so the join screen can
-- say "Join Pine Ridge Camp" and reject a bad code without creating an account first.
--
-- Anon-callable: the 6-character code is the secret, exactly as the invite token is. It returns
-- only the camp name, the role the code grants, and the staff group's name — never member
-- lists, never the camp id, and it does not increment use_count. Validity mirrors
-- join_camp_with_code() exactly (active, unexpired, uses remaining), so a code that previews
-- as valid is one that will actually join.
CREATE OR REPLACE FUNCTION public.join_code_info(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.camp_join_codes%ROWTYPE;
  v_camp_name text;
  v_group_name text;
BEGIN
  SELECT * INTO v_row FROM public.camp_join_codes
  WHERE UPPER(code) = UPPER(TRIM(p_code)) AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at <= NOW() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;
  IF v_row.max_uses IS NOT NULL AND v_row.use_count >= v_row.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'used_up');
  END IF;

  SELECT name INTO v_camp_name FROM public.camps
   WHERE id = v_row.camp_id AND deleted_at IS NULL AND status = 'active';
  IF v_camp_name IS NULL THEN
    -- Suspended, expired or deleted camps must not accept new staff.
    RETURN jsonb_build_object('valid', false, 'reason', 'camp_unavailable');
  END IF;

  SELECT name INTO v_group_name FROM public.staff_groups WHERE id = v_row.staff_group_id;

  RETURN jsonb_build_object(
    'valid', true,
    'camp_name', v_camp_name,
    'role', v_row.role,
    'group_name', v_group_name
  );
END $$;

REVOKE ALL ON FUNCTION public.join_code_info(text) FROM public;
GRANT EXECUTE ON FUNCTION public.join_code_info(text) TO anon, authenticated;
