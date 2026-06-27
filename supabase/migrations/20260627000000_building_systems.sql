-- Building Systems module — electrical & plumbing infrastructure organized by
-- building → room → component, plus panel/breaker schedules and a seasonal
-- (winterization) checklist. All tables are camp-scoped with member RLS.

-- ─── Buildings ────────────────────────────────────────────────────────────────
CREATE TABLE buildings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id                uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  type                   text DEFAULT 'other'
    CHECK (type IN ('cabin','bathhouse','dining_hall','kitchen','infirmary',
                    'office','activity','storage','utility','other')),
  -- Soft link to a camp `locations` string so flagged issues can pre-fill location.
  location_label         text,
  -- Emergency operation reference — surfaced prominently on the building card.
  main_water_shutoff     text,
  main_electrical_panel  text,
  main_gas_shutoff       text,
  year_built             int,
  notes                  text,
  sort_order             int DEFAULT 0,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_buildings_updated_at BEFORE UPDATE ON buildings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_buildings" ON buildings FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_buildings"   ON buildings FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Rooms ────────────────────────────────────────────────────────────────────
CREATE TABLE building_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name        text NOT NULL,
  floor       text,
  notes       text,
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE building_rooms ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_building_rooms_updated_at BEFORE UPDATE ON building_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_building_rooms" ON building_rooms FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_building_rooms"   ON building_rooms FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Components ───────────────────────────────────────────────────────────────
-- `type` is intentionally unconstrained (the app owns the taxonomy, which spans a
-- broad and evolving set of electrical/plumbing fixtures). Type-specific specs
-- (is_gfci, bulb_type, voltage, valve_type, gallons, …) live in `metadata` jsonb.
CREATE TABLE building_components (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id          uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  building_id      uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  room_id          uuid REFERENCES building_rooms(id) ON DELETE SET NULL,
  system           text NOT NULL CHECK (system IN ('electrical','plumbing')),
  type             text NOT NULL,
  label            text NOT NULL,
  location_detail  text,
  status           text DEFAULT 'operational'
    CHECK (status IN ('operational','needs_attention','out_of_service')),
  status_detail    text,
  last_serviced    date,
  next_service_due date,
  photo_url        text,
  metadata         jsonb DEFAULT '{}'::jsonb,
  notes            text,
  sort_order       int DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
ALTER TABLE building_components ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_building_components_updated_at BEFORE UPDATE ON building_components
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX building_components_building_id_idx ON building_components(building_id);
CREATE INDEX building_components_room_id_idx ON building_components(room_id);
CREATE POLICY "members_select_building_components" ON building_components FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_building_components"   ON building_components FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Circuits (panel schedule) ────────────────────────────────────────────────
-- Each row is one breaker on a panel component. `panel_id` points at the
-- breaker_panel/sub_panel component it belongs to.
CREATE TABLE building_circuits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id        uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  panel_id       uuid NOT NULL REFERENCES building_components(id) ON DELETE CASCADE,
  breaker_number text,
  label          text,
  amperage       int,
  controls       text,
  is_on          boolean DEFAULT true,
  sort_order     int DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
ALTER TABLE building_circuits ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_building_circuits_updated_at BEFORE UPDATE ON building_circuits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX building_circuits_panel_id_idx ON building_circuits(panel_id);
CREATE POLICY "members_select_building_circuits" ON building_circuits FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_building_circuits"   ON building_circuits FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- A component can be linked to the circuit that powers it. Added after both
-- tables exist to avoid a circular table-creation dependency.
ALTER TABLE building_components
  ADD COLUMN controlling_circuit_id uuid REFERENCES building_circuits(id) ON DELETE SET NULL;

-- ─── Seasonal / winterization tasks ───────────────────────────────────────────
-- building_id NULL = camp-wide task (e.g. "blow out all water lines").
CREATE TABLE building_seasonal_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id        uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  building_id    uuid REFERENCES buildings(id) ON DELETE CASCADE,
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
ALTER TABLE building_seasonal_tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_building_seasonal_tasks_updated_at BEFORE UPDATE ON building_seasonal_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_building_seasonal" ON building_seasonal_tasks FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_building_seasonal"   ON building_seasonal_tasks FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Realtime ─────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE
  buildings,
  building_rooms,
  building_components,
  building_circuits,
  building_seasonal_tasks;
