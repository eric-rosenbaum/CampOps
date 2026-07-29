-- Phase 0: tenant foundation for the sales-led restructure (orgs, platform_admins,
-- camp lifecycle columns, platform-admin bypass at the RLS choke-points, create_camp lockdown).
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz DEFAULT now()
);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, added_by uuid, added_at timestamptz DEFAULT now()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

CREATE POLICY "platform_admins_self_read" ON platform_admins FOR SELECT USING (is_platform_admin());
CREATE POLICY "platform_admins_manage" ON platform_admins FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "orgs_platform_manage" ON organizations FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

ALTER TABLE camps
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'customer' CHECK (account_type IN ('customer','trial','demo','internal')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','trial_expired')),
  ADD COLUMN IF NOT EXISTS plan text,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provisioned_by uuid,
  ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;

CREATE POLICY "orgs_member_read" ON organizations FOR SELECT USING (
  is_platform_admin() OR EXISTS (SELECT 1 FROM camps c WHERE c.org_id = organizations.id AND is_camp_member(c.id))
);

CREATE OR REPLACE FUNCTION public.is_camp_member(p_camp_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_platform_admin() OR EXISTS (SELECT 1 FROM camp_members WHERE camp_id = p_camp_id AND user_id = auth.uid() AND is_active = true);
$$;
CREATE OR REPLACE FUNCTION public.is_camp_admin(p_camp_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_platform_admin() OR EXISTS (SELECT 1 FROM camp_members WHERE camp_id = p_camp_id AND user_id = auth.uid() AND role = 'admin' AND is_active = true);
$$;
CREATE OR REPLACE FUNCTION public.get_camp_role(p_camp_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN is_platform_admin() THEN 'admin'
    ELSE (SELECT role FROM camp_members WHERE camp_id = p_camp_id AND user_id = auth.uid() AND is_active = true LIMIT 1) END;
$$;
CREATE OR REPLACE FUNCTION public.has_camper_health_access(p_camp_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.camp_members m LEFT JOIN public.staff_groups g ON g.id = m.staff_group_id
    WHERE m.camp_id = p_camp_id AND m.user_id = auth.uid() AND m.is_active = true
      AND (m.role = 'admin' OR COALESCE(g.can_view_camper_health, false)));
$$;

CREATE OR REPLACE FUNCTION public.create_camp(p_name text, p_slug text, p_camp_type text DEFAULT NULL, p_state text DEFAULT NULL, p_modules jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE v_camp_id uuid; v_modules jsonb;
  BEGIN
    IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Only CampCommand platform admins can create camps'; END IF;
    v_modules := COALESCE(p_modules, '{"issues":true,"pool":false,"staff":true,"checklists":true,"safety":true,"kitchen":false,"drills":false,"assets":false}'::jsonb);
    INSERT INTO camps (name, slug, camp_type, state, modules) VALUES (p_name, p_slug, p_camp_type, p_state, v_modules) RETURNING id INTO v_camp_id;
    INSERT INTO camp_members (camp_id, user_id, role) VALUES (v_camp_id, auth.uid(), 'admin');
    RETURN v_camp_id;
  END;
$$;

INSERT INTO platform_admins (user_id)
SELECT id FROM auth.users WHERE email IN ('ericrosenbaum77@gmail.com','prakash@campcommand.app') ON CONFLICT DO NOTHING;
