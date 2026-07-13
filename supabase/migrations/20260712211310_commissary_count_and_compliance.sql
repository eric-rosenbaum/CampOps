-- Commissary phase 3d: physical-count sessions + storage→safety-temp linkage.

-- Groups the adjustments produced by one physical count, for history. Optional to
-- the count flow (each count still posts count_correction adjustments regardless).
CREATE TABLE commissary_count_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  date       date NOT NULL,
  counted_by text,
  note       text,
  item_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE commissary_count_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX commissary_count_sessions_camp_idx ON commissary_count_sessions(camp_id, date DESC);
CREATE POLICY "members_select_count_sessions" ON commissary_count_sessions FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_count_sessions" ON commissary_count_sessions FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- Links an inventory storage location to the Safety module's temp-logged unit, so an
-- out-of-range walk-in (logged in Safety) can flag the inventory held in it.
CREATE TABLE commissary_storage_map (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id          uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  storage_location text NOT NULL
    CHECK (storage_location IN ('walk_in_refrigerator','walk_in_freezer',
                                'dry_storage','reach_in_refrigerator','other')),
  safety_item_id   uuid REFERENCES safety_items(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (camp_id, storage_location)
);
ALTER TABLE commissary_storage_map ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_commissary_storage_map_updated_at BEFORE UPDATE ON commissary_storage_map
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_storage_map" ON commissary_storage_map FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_storage_map" ON commissary_storage_map FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

ALTER PUBLICATION supabase_realtime ADD TABLE commissary_count_sessions, commissary_storage_map;
ALTER TABLE public.commissary_count_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.commissary_storage_map    REPLICA IDENTITY FULL;
