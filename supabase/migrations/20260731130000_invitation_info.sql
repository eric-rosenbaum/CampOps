-- Expose an invite's details (email, camp, role, validity) from its token so the acceptance page
-- can LOCK the email to what the invite was sent to. Anon-callable — the token is the secret.
CREATE OR REPLACE FUNCTION public.invitation_info(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv public.camp_invitations%ROWTYPE; v_camp text;
BEGIN
  SELECT * INTO v_inv FROM public.camp_invitations WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'used', 'email', v_inv.email);
  END IF;
  IF v_inv.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired', 'email', v_inv.email);
  END IF;
  SELECT name INTO v_camp FROM public.camps WHERE id = v_inv.camp_id;
  RETURN jsonb_build_object('valid', true, 'email', v_inv.email, 'camp_name', v_camp, 'role', v_inv.role);
END $$;
REVOKE ALL ON FUNCTION public.invitation_info(text) FROM public;
GRANT EXECUTE ON FUNCTION public.invitation_info(text) TO anon, authenticated;
