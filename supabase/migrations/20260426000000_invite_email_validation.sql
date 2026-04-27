-- Validate that the user accepting an invitation signed in with the invited email address.
-- Also block admin role from being granted via join codes.

CREATE OR REPLACE FUNCTION accept_invitation(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv camp_invitations;
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_inv FROM camp_invitations
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation.');
  END IF;

  IF lower(v_inv.email) != lower(v_user_email) THEN
    RETURN jsonb_build_object(
      'error',
      'This invitation was sent to ' || v_inv.email || '. Please sign in with that email address to accept it.'
    );
  END IF;

  INSERT INTO camp_members (camp_id, user_id, role, department, invited_by)
  VALUES (v_inv.camp_id, auth.uid(), v_inv.role, v_inv.department, v_inv.invited_by)
  ON CONFLICT (camp_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    department = EXCLUDED.department,
    is_active = true;

  UPDATE camp_invitations SET accepted_at = now() WHERE id = v_inv.id;

  RETURN jsonb_build_object('camp_id', v_inv.camp_id);
END;
$$;

-- Block admin role from join codes — admins must be invited individually by email.
CREATE OR REPLACE FUNCTION generate_join_code(
  p_camp_id  uuid,
  p_role     text DEFAULT 'staff',
  p_dept     text DEFAULT NULL,
  p_max_uses int  DEFAULT NULL,
  p_days     int  DEFAULT 7
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code text;
BEGIN
  IF NOT is_camp_admin(p_camp_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_role = 'admin' THEN
    RAISE EXCEPTION 'Join codes cannot grant admin access. Use direct email invitations for admins.';
  END IF;

  LOOP
    v_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM camp_join_codes WHERE code = v_code AND is_active = true);
  END LOOP;

  INSERT INTO camp_join_codes
    (camp_id, code, role, department, max_uses, expires_at, created_by)
  VALUES (
    p_camp_id, v_code, p_role, p_dept, p_max_uses,
    CASE WHEN p_days IS NOT NULL THEN now() + (p_days || ' days')::interval ELSE NULL END,
    auth.uid()
  );

  RETURN v_code;
END;
$$;
