-- Retreat Manager: external group rentals of the facility. Core booking + housing.
CREATE TABLE IF NOT EXISTS retreats (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id                uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  group_name             text NOT NULL,
  group_type             text NOT NULL DEFAULT 'other',
  arrival_date           date NOT NULL,
  departure_date         date NOT NULL,
  headcount              integer NOT NULL DEFAULT 0,
  rate_per_person_night  numeric,
  deposit_required       numeric,
  deposit_received       numeric,
  coordinator_name       text,
  coordinator_email      text,
  coordinator_phone      text,
  status                 text NOT NULL DEFAULT 'inquiry', -- inquiry|confirmed|ready|active|complete|cancelled
  housing_deadline       date,
  headcount_cutoff       date,
  dietary_flags          jsonb,
  notes                  text,
  portal_token           text NOT NULL DEFAULT replace(gen_random_uuid()::text,'-','') UNIQUE,
  menu_published         boolean NOT NULL DEFAULT false,
  change_requests_enabled boolean NOT NULL DEFAULT true,
  feedback_opens         date,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);
ALTER TABLE retreats ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_retreats_updated_at BEFORE UPDATE ON retreats FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS retreats_camp_id_idx ON retreats(camp_id);
CREATE INDEX IF NOT EXISTS retreats_portal_token_idx ON retreats(portal_token);
CREATE POLICY "members_select_retreats" ON retreats FOR SELECT USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_retreats" ON retreats FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));
ALTER PUBLICATION supabase_realtime ADD TABLE retreats;
ALTER TABLE public.retreats REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS retreat_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name text NOT NULL, bed_capacity integer NOT NULL DEFAULT 0,
  accessible boolean NOT NULL DEFAULT false, notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE retreat_spaces ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_retreat_spaces_updated_at BEFORE UPDATE ON retreat_spaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS retreat_spaces_camp_id_idx ON retreat_spaces(camp_id);
CREATE POLICY "members_select_retreat_spaces" ON retreat_spaces FOR SELECT USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_retreat_spaces" ON retreat_spaces FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));
ALTER PUBLICATION supabase_realtime ADD TABLE retreat_spaces;
ALTER TABLE public.retreat_spaces REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS retreat_housing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  space_id uuid REFERENCES retreat_spaces(id) ON DELETE SET NULL,
  space_name text, subgroup_name text, people_count integer NOT NULL DEFAULT 0,
  notes text, locked boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE retreat_housing ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_retreat_housing_updated_at BEFORE UPDATE ON retreat_housing FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS retreat_housing_camp_id_idx ON retreat_housing(camp_id);
CREATE INDEX IF NOT EXISTS retreat_housing_retreat_id_idx ON retreat_housing(retreat_id);
CREATE POLICY "members_select_retreat_housing" ON retreat_housing FOR SELECT USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_retreat_housing" ON retreat_housing FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));
ALTER PUBLICATION supabase_realtime ADD TABLE retreat_housing;
ALTER TABLE public.retreat_housing REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS retreat_housing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1, label text, summary text, created_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE retreat_housing_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS retreat_housing_versions_retreat_id_idx ON retreat_housing_versions(retreat_id);
CREATE POLICY "members_select_retreat_housing_versions" ON retreat_housing_versions FOR SELECT USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_retreat_housing_versions" ON retreat_housing_versions FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));
ALTER PUBLICATION supabase_realtime ADD TABLE retreat_housing_versions;
ALTER TABLE public.retreat_housing_versions REPLICA IDENTITY FULL;
