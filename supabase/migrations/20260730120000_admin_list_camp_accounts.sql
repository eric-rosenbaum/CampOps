-- Admin console: list every account (+ pending invite) tied to a camp, with email + role.
-- Emails live in auth.users, which the client can't read directly, so this SECURITY DEFINER
-- function exposes them — but only to platform admins.

CREATE OR REPLACE FUNCTION admin_list_camp_accounts(p_camp_id uuid)
RETURNS TABLE (
  user_id     uuid,
  email       text,
  full_name   text,
  role        text,
  staff_group text,
  status      text,
  since       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    -- Actual members (accounts that have joined)
    SELECT
      cm.user_id,
      u.email::text,
      p.full_name,
      cm.role::text,
      sg.name,
      CASE WHEN cm.is_active THEN 'active' ELSE 'inactive' END,
      cm.created_at
    FROM camp_members cm
    JOIN auth.users u        ON u.id = cm.user_id
    LEFT JOIN profiles p     ON p.id = cm.user_id
    LEFT JOIN staff_groups sg ON sg.id = cm.staff_group_id
    WHERE cm.camp_id = p_camp_id

    UNION ALL

    -- Pending invitations (sent, not yet accepted / not expired) — no account exists yet
    SELECT
      NULL::uuid,
      ci.email::text,
      NULL::text,
      ci.role::text,
      NULL::text,
      'invited',
      ci.created_at
    FROM camp_invitations ci
    WHERE ci.camp_id = p_camp_id
      AND ci.accepted_at IS NULL
      AND ci.expires_at > now()

    ORDER BY 6, 2;  -- status, email (UNION requires output-column positions, not names)
END;
$$;

REVOKE ALL ON FUNCTION admin_list_camp_accounts(uuid) FROM public;
GRANT EXECUTE ON FUNCTION admin_list_camp_accounts(uuid) TO authenticated;
