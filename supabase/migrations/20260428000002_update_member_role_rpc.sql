-- RPC for updating a camp member's role, enforcing business rules:
-- 1. Caller must be an admin of the camp
-- 2. Cannot change the camp creator's role (first member by created_at)
-- 3. Cannot change your own role
CREATE OR REPLACE FUNCTION update_member_role(
  p_member_id uuid,
  p_role       text,
  p_department text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_camp_id         uuid;
  v_target_user_id  uuid;
  v_creator_user_id uuid;
BEGIN
  -- Resolve camp and target user for the member being updated
  SELECT camp_id, user_id INTO v_camp_id, v_target_user_id
  FROM camp_members WHERE id = p_member_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Caller must be an admin
  IF NOT is_camp_admin(v_camp_id) THEN
    RAISE EXCEPTION 'Only admins can change member roles';
  END IF;

  -- Cannot change your own role
  IF v_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  -- The camp creator (earliest camp_member row) is always admin
  SELECT user_id INTO v_creator_user_id
  FROM camp_members WHERE camp_id = v_camp_id AND is_active = true
  ORDER BY created_at ASC LIMIT 1;

  IF v_target_user_id = v_creator_user_id AND p_role != 'admin' THEN
    RAISE EXCEPTION 'Cannot change the camp creator''s role';
  END IF;

  UPDATE camp_members SET role = p_role, department = p_department
  WHERE id = p_member_id;
END;
$$;
