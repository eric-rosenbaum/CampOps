-- Staff groups — BACKFILL of schema that was applied directly to the production
-- database and never captured in a migration. Until now `supabase db push` against
-- a fresh project produced a database this app could not run on: campStore.ts
-- queries `staff_groups`, and update_member_role/generate_join_code are called with
-- a p_staff_group_id argument that no migration ever declared.
--
-- Everything below is written IF NOT EXISTS / CREATE OR REPLACE / exception-guarded
-- so it is a safe no-op against the live database and reproduces the schema exactly
-- on a fresh one. Function bodies are transcribed from the live definitions.
--
-- Three intentional differences from live:
--   1. The `modules` default gains building_systems + commissary (live predates both).
--   2. An updated_at trigger is added; live has the column but never maintained it.
--   3. SECURITY FIX. 20260426000000 added a guard to generate_join_code refusing to
--      mint admin-granting join codes ("admins must be invited by email", so that a
--      leaked 6-character code can never escalate to admin). When the 6-arg
--      p_staff_group_id overload was created out-of-band in the dashboard, that guard
--      was not carried over -- and the app calls the 6-arg overload (campStore.ts:370
--      passes p_staff_group_id). The guard is restored below. Verified missing on
--      live 2026-07-09: the 5-arg version has it, the 6-arg version does not.

-- ─── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_groups (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id                uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  modules                jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues_see_unassigned  boolean NOT NULL DEFAULT false,
  prepost_see_unassigned boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Realign the default with the full module set. The app always writes a complete
-- object, so this only affects rows inserted outside the app.
ALTER TABLE staff_groups ALTER COLUMN modules SET DEFAULT '{
  "issues_repairs": false,
  "pre_post": false,
  "pool": false,
  "safety": false,
  "assets": false,
  "building_systems": false,
  "commissary": false
}'::jsonb;

ALTER TABLE staff_groups ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS staff_groups_camp_id_idx ON staff_groups(camp_id);

DO $$ BEGIN
  CREATE TRIGGER trg_staff_groups_updated_at BEFORE UPDATE ON staff_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Policies ─────────────────────────────────────────────────────────────────
-- Transcribed from live. These predate the is_camp_member()/get_camp_role()
-- helpers and inline the membership check directly; kept as-is so this migration
-- reproduces the live database rather than silently changing its authorization.
DO $$ BEGIN
  CREATE POLICY "staff_groups_select" ON staff_groups FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM camp_members
      WHERE camp_members.camp_id = staff_groups.camp_id
        AND camp_members.user_id = auth.uid()
        AND camp_members.is_active = true
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "staff_groups_admin_write" ON staff_groups FOR ALL
    USING (EXISTS (
      SELECT 1 FROM camp_members
      WHERE camp_members.camp_id = staff_groups.camp_id
        AND camp_members.user_id = auth.uid()
        AND camp_members.role = 'admin'
        AND camp_members.is_active = true
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── staff_group_id columns ───────────────────────────────────────────────────
-- The group is baked into a membership, a join code, and an email invitation.
ALTER TABLE camp_members
  ADD COLUMN IF NOT EXISTS staff_group_id uuid REFERENCES staff_groups(id) ON DELETE SET NULL;
ALTER TABLE camp_join_codes
  ADD COLUMN IF NOT EXISTS staff_group_id uuid REFERENCES staff_groups(id) ON DELETE SET NULL;
ALTER TABLE camp_invitations
  ADD COLUMN IF NOT EXISTS staff_group_id uuid REFERENCES staff_groups(id) ON DELETE SET NULL;

-- ─── RPC overloads that carry staff_group_id ──────────────────────────────────
-- NOTE: these are OVERLOADS. The original 3-arg update_member_role and 5-arg
-- generate_join_code from 20260423000000 still exist. PostgREST resolves by the
-- named-argument set the client sends, so both survive. Do not drop the originals.

CREATE OR REPLACE FUNCTION public.update_member_role(
  p_member_id uuid,
  p_role text,
  p_department text DEFAULT NULL::text,
  p_staff_group_id uuid DEFAULT NULL::uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_camp_id uuid;
BEGIN
  SELECT camp_id INTO v_camp_id FROM public.camp_members WHERE id = p_member_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.camp_members
    WHERE camp_id = v_camp_id AND user_id = auth.uid()
      AND role = 'admin' AND is_active = true
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

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

CREATE OR REPLACE FUNCTION public.generate_join_code(
  p_camp_id uuid,
  p_role text,
  p_dept text DEFAULT NULL::text,
  p_max_uses integer DEFAULT NULL::integer,
  p_days integer DEFAULT 30,
  p_staff_group_id uuid DEFAULT NULL::uuid
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.camp_members
    WHERE camp_id = p_camp_id AND user_id = auth.uid()
      AND role = 'admin' AND is_active = true
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  -- Join codes may never grant admin; admins must be invited by email.
  IF p_role = 'admin' THEN
    RAISE EXCEPTION 'Join codes cannot grant admin access';
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

-- Both of these already propagate staff_group_id from the code / invitation row
-- onto the new membership. Re-declared here so a fresh database matches live.
CREATE OR REPLACE FUNCTION public.join_camp_with_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
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
  WHERE UPPER(code) = UPPER(p_code) AND is_active = true
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

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_inv public.camp_invitations%ROWTYPE;
  v_user_email text;
  v_existing_id uuid;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_inv FROM public.camp_invitations
    WHERE token = p_token AND accepted_at IS NULL AND expires_at > NOW();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation');
  END IF;

  -- The invitation is bound to the address it was sent to.
  IF v_inv.email IS NOT NULL AND LOWER(v_inv.email) != LOWER(v_user_email) THEN
    RETURN jsonb_build_object('error', 'This invitation was sent to a different email address');
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
