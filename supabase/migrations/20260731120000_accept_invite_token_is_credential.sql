-- The invite token is a long, unguessable secret delivered only to the invited person's inbox -
-- possessing it IS the proof of access. The extra "signed-in email must equal the invited email"
-- check caused lockouts (already logged in as another account, or typed a slightly different
-- email at signup) with no way forward. Drop it; keep single-use + expiry. Also stop a platform
-- admin from accidentally consuming an invite (they should open camps from the admin console).
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_inv public.camp_invitations%ROWTYPE;
  v_existing_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Please sign in to accept this invitation.');
  END IF;

  IF is_platform_admin() THEN
    RETURN jsonb_build_object('error', 'You’re a platform admin. Open this camp from the admin console instead of accepting an invite.');
  END IF;

  SELECT * INTO v_inv FROM public.camp_invitations
    WHERE token = p_token AND accepted_at IS NULL AND expires_at > NOW();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'This invitation link is invalid or has expired. Ask for a new one.');
  END IF;

  SELECT id INTO v_existing_id FROM public.camp_members
    WHERE camp_id = v_inv.camp_id AND user_id = auth.uid();

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.camp_members
    SET is_active = true, role = v_inv.role, department = v_inv.department,
        staff_group_id = v_inv.staff_group_id
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.camp_members (camp_id, user_id, role, department, staff_group_id, is_active)
    VALUES (v_inv.camp_id, auth.uid(), v_inv.role, v_inv.department, v_inv.staff_group_id, true);
  END IF;

  UPDATE public.camp_invitations SET accepted_at = NOW() WHERE id = v_inv.id;
  RETURN jsonb_build_object('camp_id', v_inv.camp_id);
END;
$function$;
