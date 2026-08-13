-- Join codes become word-shaped: CEDAR-4821 instead of 57DA4E.
--
-- Two different codes exist in this product and they were too easy to confuse: the join code
-- (shared by an admin, says WHICH camp) and the emailed sign-in code (personal, says WHO you
-- are). Both used to be short opaque strings. A word plus four digits can't be mistaken for a
-- pure-numeric one-time code, survives being read aloud across a room at staff orientation,
-- and is far easier to retype from a whiteboard.
--
-- Existing 6-character hex codes keep working: lookups normalise both sides by stripping
-- everything that isn't a letter or digit, so CEDAR-4821, cedar4821 and CEDAR 4821 all match.

CREATE OR REPLACE FUNCTION public.normalize_join_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
$$;

-- Outdoors words, 4–7 letters, all visually distinct from one another when read quickly.
CREATE OR REPLACE FUNCTION public.random_join_code()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  words text[] := ARRAY[
    'PINE','CEDAR','BIRCH','ASPEN','MAPLE','WILLOW','SPRUCE','ALDER',
    'CANOE','KAYAK','TRAIL','RIVER','MEADOW','SUMMIT','RIDGE','HARBOR',
    'LODGE','CABIN','ACORN','HERON','OTTER','FALCON','BADGER','BEAVER',
    'COMPASS','LANTERN','PADDLE','SUNSET','BOULDER','THICKET','JUNIPER','HEMLOCK'
  ];
BEGIN
  RETURN words[1 + floor(random() * array_length(words, 1))::int]
         || '-' || lpad((1000 + floor(random() * 9000))::int::text, 4, '0');
END $$;

-- The staff-group-aware overload the web app actually calls.
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
BEGIN
  IF NOT public.is_camp_admin(p_camp_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_role = 'admin' THEN
    RAISE EXCEPTION 'Join codes cannot grant admin access. Use direct email invitations for admins.';
  END IF;

  LOOP
    v_code := public.random_join_code();
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.camp_join_codes
      WHERE public.normalize_join_code(code) = public.normalize_join_code(v_code)
        AND is_active = true
    );
  END LOOP;

  INSERT INTO public.camp_join_codes
    (camp_id, code, role, department, max_uses, expires_at, staff_group_id, created_by)
  VALUES
    (p_camp_id, v_code, p_role, p_dept, p_max_uses,
     NOW() + (p_days || ' days')::INTERVAL, p_staff_group_id, auth.uid());

  RETURN v_code;
END;
$function$;

-- The older 5-arg overload, kept in step so nothing regresses if it is ever called.
CREATE OR REPLACE FUNCTION public.generate_join_code(
  p_camp_id uuid,
  p_role text DEFAULT 'staff'::text,
  p_dept text DEFAULT NULL::text,
  p_max_uses integer DEFAULT NULL::integer,
  p_days integer DEFAULT 7
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
BEGIN
  IF NOT public.is_camp_admin(p_camp_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_role = 'admin' THEN
    RAISE EXCEPTION 'Join codes cannot grant admin access. Use direct email invitations for admins.';
  END IF;

  LOOP
    v_code := public.random_join_code();
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.camp_join_codes
      WHERE public.normalize_join_code(code) = public.normalize_join_code(v_code)
        AND is_active = true
    );
  END LOOP;

  INSERT INTO public.camp_join_codes
    (camp_id, code, role, department, max_uses, expires_at, created_by)
  VALUES (
    p_camp_id, v_code, p_role, p_dept, p_max_uses,
    CASE WHEN p_days IS NOT NULL THEN now() + (p_days || ' days')::interval ELSE NULL END,
    auth.uid()
  );

  RETURN v_code;
END;
$function$;

-- Redemption and preview must both match on the normalised form, so punctuation and case in
-- whatever the user types are irrelevant.
CREATE OR REPLACE FUNCTION public.join_camp_with_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row public.camp_join_codes%ROWTYPE;
  v_camp_name text;
  v_existing_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT * INTO v_row FROM public.camp_join_codes
  WHERE public.normalize_join_code(code) = public.normalize_join_code(p_code)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_uses IS NULL OR use_count < max_uses);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired join code');
  END IF;

  SELECT name INTO v_camp_name FROM public.camps WHERE id = v_row.camp_id;
  SELECT id INTO v_existing_id FROM public.camp_members
    WHERE camp_id = v_row.camp_id AND user_id = v_user_id;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.camp_members
    SET is_active = true, role = v_row.role, department = v_row.department,
        staff_group_id = v_row.staff_group_id
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.camp_members (camp_id, user_id, role, department, staff_group_id, is_active)
    VALUES (v_row.camp_id, v_user_id, v_row.role, v_row.department, v_row.staff_group_id, true);
  END IF;

  UPDATE public.camp_join_codes SET use_count = use_count + 1 WHERE id = v_row.id;
  RETURN jsonb_build_object('camp_id', v_row.camp_id, 'camp_name', v_camp_name);
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_code_info(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.camp_join_codes%ROWTYPE;
  v_camp_name text;
  v_group_name text;
BEGIN
  SELECT * INTO v_row FROM public.camp_join_codes
  WHERE public.normalize_join_code(code) = public.normalize_join_code(p_code)
    AND is_active = true;

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
REVOKE ALL ON FUNCTION public.normalize_join_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.normalize_join_code(text) TO anon, authenticated;
