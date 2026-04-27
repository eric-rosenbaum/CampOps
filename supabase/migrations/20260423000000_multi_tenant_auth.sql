-- =============================================================================
-- CampOps: Multi-tenant auth migration
-- Drops all demo-only tables and recreates them with proper UUIDs,
-- camp_id tenant isolation, Supabase Auth integration, and RLS.
-- =============================================================================

-- ─── Drop existing demo tables (cascade handles FK order) ────────────────────
DROP TABLE IF EXISTS asset_maintenance_tasks  CASCADE;
DROP TABLE IF EXISTS asset_service_records    CASCADE;
DROP TABLE IF EXISTS asset_checkouts          CASCADE;
DROP TABLE IF EXISTS camp_assets              CASCADE;
DROP TABLE IF EXISTS safety_licenses          CASCADE;
DROP TABLE IF EXISTS safety_temp_logs         CASCADE;
DROP TABLE IF EXISTS staff_certifications     CASCADE;
DROP TABLE IF EXISTS safety_staff             CASCADE;
DROP TABLE IF EXISTS safety_drills            CASCADE;
DROP TABLE IF EXISTS safety_inspection_log    CASCADE;
DROP TABLE IF EXISTS safety_items             CASCADE;
DROP TABLE IF EXISTS pool_seasonal_tasks      CASCADE;
DROP TABLE IF EXISTS pool_inspection_log      CASCADE;
DROP TABLE IF EXISTS pool_inspections         CASCADE;
DROP TABLE IF EXISTS pool_service_log         CASCADE;
DROP TABLE IF EXISTS pool_equipment           CASCADE;
DROP TABLE IF EXISTS pool_chemical_readings   CASCADE;
DROP TABLE IF EXISTS pools                    CASCADE;
DROP TABLE IF EXISTS checklist_activity       CASCADE;
DROP TABLE IF EXISTS checklist_tasks          CASCADE;
DROP TABLE IF EXISTS issue_activity           CASCADE;
DROP TABLE IF EXISTS issues                   CASCADE;
DROP TABLE IF EXISTS seasons                  CASCADE;
DROP TABLE IF EXISTS users                    CASCADE;

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =============================================================================
-- AUTH TABLES
-- =============================================================================

-- ─── PROFILES ────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── CAMPS ───────────────────────────────────────────────────────────────────
CREATE TABLE camps (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  slug                 text UNIQUE NOT NULL,
  logo_url             text,
  address_line1        text,
  city                 text,
  state                text,
  country              text DEFAULT 'US',
  camp_type            text CHECK (camp_type IN ('Day Camp','Overnight Camp')),
  approximate_capacity int,
  modules              jsonb NOT NULL DEFAULT '{
    "issues":true,"pool":false,"staff":true,
    "checklists":true,"safety":true,"kitchen":false,
    "drills":false,"assets":false
  }'::jsonb,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);
ALTER TABLE camps ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_camps_updated_at BEFORE UPDATE ON camps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── CAMP MEMBERS ─────────────────────────────────────────────────────────────
CREATE TABLE camp_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id      uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('admin','staff','viewer')),
  department   text CHECK (department IN (
    'waterfront','maintenance','kitchen','administration','health','program','other'
  )),
  display_name text,
  is_active    boolean DEFAULT true,
  invited_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now(),
  UNIQUE(camp_id, user_id)
);
ALTER TABLE camp_members ENABLE ROW LEVEL SECURITY;

-- ─── CAMP INVITATIONS ─────────────────────────────────────────────────────────
CREATE TABLE camp_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin','staff','viewer')),
  department  text,
  token       text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  invited_by  uuid NOT NULL REFERENCES auth.users(id),
  accepted_at timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(camp_id, email)
);
ALTER TABLE camp_invitations ENABLE ROW LEVEL SECURITY;

-- ─── CAMP JOIN CODES ──────────────────────────────────────────────────────────
CREATE TABLE camp_join_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  code        text UNIQUE NOT NULL,
  role        text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff','viewer')),
  department  text,
  max_uses    int,
  use_count   int NOT NULL DEFAULT 0,
  expires_at  timestamptz,
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE camp_join_codes ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION is_camp_member(p_camp_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM camp_members
    WHERE camp_id = p_camp_id AND user_id = auth.uid() AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION get_camp_role(p_camp_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM camp_members
  WHERE camp_id = p_camp_id AND user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_camp_admin(p_camp_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM camp_members
    WHERE camp_id = p_camp_id AND user_id = auth.uid()
      AND role = 'admin' AND is_active = true
  );
$$;

-- =============================================================================
-- RLS POLICIES — AUTH TABLES
-- =============================================================================

-- profiles
CREATE POLICY "own_profile_select" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "own_profile_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- camps: members can view; admins can update; creation via RPC only
CREATE POLICY "members_view_camp"   ON camps FOR SELECT USING (is_camp_member(id));
CREATE POLICY "admins_update_camp"  ON camps FOR UPDATE USING (is_camp_admin(id));

-- camp_members: members can view roster; admins manage; users see own rows
CREATE POLICY "members_view_roster"     ON camp_members FOR SELECT
  USING (is_camp_member(camp_id) OR user_id = auth.uid());
CREATE POLICY "admins_manage_members"   ON camp_members FOR INSERT
  WITH CHECK (is_camp_admin(camp_id));
CREATE POLICY "admins_update_members"   ON camp_members FOR UPDATE
  USING (is_camp_admin(camp_id));
CREATE POLICY "admins_delete_members"   ON camp_members FOR DELETE
  USING (is_camp_admin(camp_id));

-- camp_invitations: admins manage; anyone can read by token (security is the token)
CREATE POLICY "admins_manage_invitations" ON camp_invitations FOR ALL
  USING (is_camp_admin(camp_id));
CREATE POLICY "public_read_invitation"    ON camp_invitations FOR SELECT
  USING (true);

-- camp_join_codes: admins manage; active codes readable by all (for joining)
CREATE POLICY "admins_manage_codes" ON camp_join_codes FOR ALL
  USING (is_camp_admin(camp_id));
CREATE POLICY "public_read_active_codes" ON camp_join_codes FOR SELECT
  USING (is_active = true);

-- =============================================================================
-- OPERATIONAL TABLES (all scoped to camp_id)
-- =============================================================================

-- ─── SEASONS ──────────────────────────────────────────────────────────────────
CREATE TABLE seasons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id      uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name         text NOT NULL,
  opening_date date,
  closing_date date,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_seasons" ON seasons FOR SELECT USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_seasons"   ON seasons FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── ISSUES ───────────────────────────────────────────────────────────────────
CREATE TABLE issues (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id                uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  title                  text NOT NULL,
  description            text,
  locations              text[] DEFAULT '{}',
  priority               text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent','high','normal')),
  status                 text NOT NULL DEFAULT 'unassigned'
    CHECK (status IN ('unassigned','assigned','in_progress','resolved')),
  assignee_id            uuid REFERENCES auth.users(id),
  reported_by_id         uuid REFERENCES auth.users(id),
  estimated_cost_display text,
  estimated_cost_value   numeric,
  actual_cost            numeric,
  photo_url              text,
  due_date               date,
  is_recurring           boolean DEFAULT false,
  recurring_interval     text,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_issues_updated_at BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_issues" ON issues FOR SELECT USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_issues"   ON issues FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE issue_activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  issue_id   uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id),
  user_name  text NOT NULL,
  action     text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE issue_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_issue_activity" ON issue_activity FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_insert_issue_activity"   ON issue_activity FOR INSERT
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── CHECKLISTS ───────────────────────────────────────────────────────────────
CREATE TABLE checklist_tasks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id                  uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  title                    text NOT NULL,
  description              text,
  locations                text[] DEFAULT '{}',
  priority                 text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent','high','normal')),
  status                   text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','complete')),
  assignee_id              uuid REFERENCES auth.users(id),
  phase                    text NOT NULL CHECK (phase IN ('pre','post')),
  days_relative_to_opening int,
  due_date                 date,
  is_recurring             boolean DEFAULT false,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
ALTER TABLE checklist_tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_checklist_tasks_updated_at BEFORE UPDATE ON checklist_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_tasks" ON checklist_tasks FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_tasks"   ON checklist_tasks FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE checklist_activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  task_id    uuid NOT NULL REFERENCES checklist_tasks(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id),
  user_name  text NOT NULL,
  action     text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE checklist_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_task_activity" ON checklist_activity FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_insert_task_activity"   ON checklist_activity FOR INSERT
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── POOLS ────────────────────────────────────────────────────────────────────
CREATE TABLE pools (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name       text NOT NULL,
  type       text NOT NULL DEFAULT 'pool',
  is_active  boolean DEFAULT true,
  notes      text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE pools ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pools_updated_at BEFORE UPDATE ON pools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_pools" ON pools FOR SELECT USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_pools"   ON pools FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE pool_chemical_readings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id           uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  pool_id           uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  free_chlorine     numeric,
  ph                numeric,
  alkalinity        numeric,
  cyanuric_acid     numeric,
  water_temp        numeric,
  calcium_hardness  numeric,
  reading_time      timestamptz NOT NULL DEFAULT now(),
  logged_by_id      uuid REFERENCES auth.users(id),
  logged_by_name    text,
  corrective_action text,
  pool_status       text CHECK (pool_status IN (
    'open_all_clear','open_monitoring','closed_corrective','closed_retest'
  )),
  created_at        timestamptz DEFAULT now()
);
ALTER TABLE pool_chemical_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_readings" ON pool_chemical_readings FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_readings"   ON pool_chemical_readings FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE pool_equipment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id          uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  pool_id          uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  name             text NOT NULL,
  type             text CHECK (type IN ('pump','filter','heater','chlorinator','safety','other')),
  status           text DEFAULT 'ok' CHECK (status IN ('ok','warn','alert')),
  status_detail    text,
  last_serviced    date,
  next_service_due date,
  vendor           text,
  specs            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
ALTER TABLE pool_equipment ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pool_equipment_updated_at BEFORE UPDATE ON pool_equipment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_equipment" ON pool_equipment FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_equipment"   ON pool_equipment FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE pool_service_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id          uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  pool_id          uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  equipment_id     uuid NOT NULL REFERENCES pool_equipment(id) ON DELETE CASCADE,
  service_type     text,
  date_performed   date,
  performed_by     text,
  notes            text,
  cost             numeric,
  next_service_due date,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE pool_service_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_svc_log" ON pool_service_log FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_svc_log"   ON pool_service_log FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE pool_inspections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id        uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  pool_id        uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  name           text NOT NULL,
  frequency      text,
  authority      text,
  standard       text,
  status         text,
  last_completed date,
  next_due       date,
  history        jsonb DEFAULT '[]'::jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
ALTER TABLE pool_inspections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pool_inspections_updated_at BEFORE UPDATE ON pool_inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_pool_inspections" ON pool_inspections FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_pool_inspections"   ON pool_inspections FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE pool_inspection_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id         uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  pool_id         uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  inspection_id   uuid NOT NULL REFERENCES pool_inspections(id) ON DELETE CASCADE,
  inspection_date date,
  conducted_by    text,
  result          text,
  notes           text,
  next_due        date,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE pool_inspection_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_pool_insp_log" ON pool_inspection_log FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_pool_insp_log"   ON pool_inspection_log FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE pool_seasonal_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id        uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  pool_id        uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  title          text NOT NULL,
  detail         text,
  phase          text CHECK (phase IN ('opening','in_season','closing')),
  is_complete    boolean DEFAULT false,
  completed_by   text,
  completed_date date,
  assignees      text[],
  sort_order     int DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
ALTER TABLE pool_seasonal_tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pool_seasonal_tasks_updated_at BEFORE UPDATE ON pool_seasonal_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_seasonal" ON pool_seasonal_tasks FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_seasonal"   ON pool_seasonal_tasks FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── SAFETY ───────────────────────────────────────────────────────────────────
CREATE TABLE safety_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id        uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name           text NOT NULL,
  category       text CHECK (category IN ('fire','water','kitchen','other')),
  type           text,
  location       text,
  unit_count     int DEFAULT 1,
  frequency      text,
  frequency_days int,
  last_inspected date,
  next_due       date,
  vendor         text,
  notes          text,
  metadata       jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
ALTER TABLE safety_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_safety_items_updated_at BEFORE UPDATE ON safety_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_safety_items" ON safety_items FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_safety_items"   ON safety_items FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE safety_inspection_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id         uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  item_id         uuid REFERENCES safety_items(id) ON DELETE SET NULL,
  category        text,
  location_note   text,
  inspection_date date,
  completed_by    text,
  result          text,
  notes           text,
  cost            numeric,
  next_due        date,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE safety_inspection_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_safety_log" ON safety_inspection_log FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_safety_log"   ON safety_inspection_log FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE safety_drills (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id           uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  drill_type        text,
  drill_name        text,
  status            text,
  scheduled_date    date,
  completed_date    date,
  lead              text,
  participant_count int,
  response_time     int,
  all_accounted     boolean,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
ALTER TABLE safety_drills ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_safety_drills_updated_at BEFORE UPDATE ON safety_drills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_drills" ON safety_drills FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_drills"   ON safety_drills FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE safety_staff (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name       text NOT NULL,
  title      text,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE safety_staff ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_safety_staff_updated_at BEFORE UPDATE ON safety_staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_safety_staff" ON safety_staff FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_safety_staff"   ON safety_staff FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE staff_certifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES safety_staff(id) ON DELETE CASCADE,
  cert_type   text NOT NULL,
  cert_name   text NOT NULL,
  issued_date date,
  expiry_date date,
  provider    text,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE staff_certifications ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_staff_certs_updated_at BEFORE UPDATE ON staff_certifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_certs" ON staff_certifications FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_certs"   ON staff_certifications FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE safety_temp_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES safety_items(id) ON DELETE CASCADE,
  log_date    date,
  session     text CHECK (session IN ('am','pm')),
  temperature numeric,
  in_range    boolean,
  logged_by   text,
  notes       text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE safety_temp_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_temp_logs" ON safety_temp_logs FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_temp_logs"   ON safety_temp_logs FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE safety_licenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id           uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name              text NOT NULL,
  license_type      text,
  issuing_authority text,
  license_number    text,
  issued_date       date,
  expiry_date       date,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
ALTER TABLE safety_licenses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_safety_licenses_updated_at BEFORE UPDATE ON safety_licenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_licenses" ON safety_licenses FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_licenses"   ON safety_licenses FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── ASSETS & VEHICLES ────────────────────────────────────────────────────────
CREATE TABLE camp_assets (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id                  uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name                     text NOT NULL,
  category                 text,
  subtype                  text,
  make                     text,
  model                    text,
  year                     int,
  serial_number            text,
  license_plate            text,
  registration_expiry      date,
  storage_location         text,
  status                   text DEFAULT 'available',
  current_odometer         numeric,
  current_hours            numeric,
  tracks_odometer          boolean DEFAULT false,
  tracks_hours             boolean DEFAULT false,
  notes                    text,
  is_active                boolean DEFAULT true,
  hull_id                  text,
  uscg_registration        text,
  uscg_registration_expiry date,
  capacity                 int,
  motor_type               text,
  has_lifejackets          boolean,
  lifejacket_count         int,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
ALTER TABLE camp_assets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_camp_assets_updated_at BEFORE UPDATE ON camp_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_assets" ON camp_assets FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_assets"   ON camp_assets FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE asset_checkouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id            uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  asset_id           uuid NOT NULL REFERENCES camp_assets(id) ON DELETE CASCADE,
  checked_out_by     text,
  purpose            text,
  checked_out_at     timestamptz,
  expected_return_at timestamptz,
  returned_at        timestamptz,
  start_odometer     numeric,
  end_odometer       numeric,
  start_hours        numeric,
  end_hours          numeric,
  fuel_level_out     text,
  fuel_level_in      text,
  checkout_notes     text,
  return_notes       text,
  return_condition   text,
  created_issue_id   uuid REFERENCES issues(id) ON DELETE SET NULL,
  logged_by          text,
  created_at         timestamptz DEFAULT now()
);
ALTER TABLE asset_checkouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_checkouts" ON asset_checkouts FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_checkouts"   ON asset_checkouts FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE asset_service_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id               uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  asset_id              uuid NOT NULL REFERENCES camp_assets(id) ON DELETE CASCADE,
  service_type          text,
  date_performed        date,
  performed_by          text,
  vendor                text,
  description           text,
  odometer_at_service   numeric,
  hours_at_service      numeric,
  cost                  numeric,
  next_service_date     date,
  next_service_odometer numeric,
  next_service_hours    numeric,
  is_inspection         boolean DEFAULT false,
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE asset_service_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_svc_records" ON asset_service_records FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_svc_records"   ON asset_service_records FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE asset_maintenance_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id        uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  asset_id       uuid NOT NULL REFERENCES camp_assets(id) ON DELETE CASCADE,
  phase          text,
  title          text NOT NULL,
  detail         text,
  is_complete    boolean DEFAULT false,
  completed_by   text,
  completed_date date,
  sort_order     int DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
ALTER TABLE asset_maintenance_tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_asset_maint_updated_at BEFORE UPDATE ON asset_maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_maint_tasks" ON asset_maintenance_tasks FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_maint_tasks"   ON asset_maintenance_tasks FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- =============================================================================
-- STORED PROCEDURES
-- =============================================================================

-- Create a camp and automatically add the creator as admin (single transaction)
CREATE OR REPLACE FUNCTION create_camp(
  p_name text,
  p_slug text,
  p_camp_type text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_modules jsonb DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_camp_id uuid;
  v_modules jsonb;
BEGIN
  v_modules := COALESCE(p_modules, '{
    "issues":true,"pool":false,"staff":true,
    "checklists":true,"safety":true,"kitchen":false,
    "drills":false,"assets":false
  }'::jsonb);

  INSERT INTO camps (name, slug, camp_type, state, modules)
  VALUES (p_name, p_slug, p_camp_type, p_state, v_modules)
  RETURNING id INTO v_camp_id;

  INSERT INTO camp_members (camp_id, user_id, role)
  VALUES (v_camp_id, auth.uid(), 'admin');

  RETURN v_camp_id;
END;
$$;

-- Join a camp using a join code
CREATE OR REPLACE FUNCTION join_camp_with_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code camp_join_codes;
BEGIN
  SELECT * INTO v_code FROM camp_join_codes
  WHERE code = upper(trim(p_code))
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR use_count < max_uses);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired join code.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM camp_members
    WHERE camp_id = v_code.camp_id AND user_id = auth.uid() AND is_active = true
  ) THEN
    RETURN jsonb_build_object('error', 'You are already a member of this camp.');
  END IF;

  INSERT INTO camp_members (camp_id, user_id, role, department)
  VALUES (v_code.camp_id, auth.uid(), v_code.role, v_code.department);

  UPDATE camp_join_codes SET use_count = use_count + 1 WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'camp_id', v_code.camp_id,
    'camp_name', (SELECT name FROM camps WHERE id = v_code.camp_id)
  );
END;
$$;

-- Accept an invitation by token
CREATE OR REPLACE FUNCTION accept_invitation(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv camp_invitations;
BEGIN
  SELECT * INTO v_inv FROM camp_invitations
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation.');
  END IF;

  INSERT INTO camp_members (camp_id, user_id, role, department, invited_by)
  VALUES (v_inv.camp_id, auth.uid(), v_inv.role, v_inv.department, v_inv.invited_by)
  ON CONFLICT (camp_id, user_id) DO NOTHING;

  UPDATE camp_invitations SET accepted_at = now() WHERE id = v_inv.id;

  RETURN jsonb_build_object('camp_id', v_inv.camp_id);
END;
$$;

-- Generate a join code (admin only)
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
