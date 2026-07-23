-- A camper can attend several sessions (many camps run multiple 1–2 week sessions and the
-- same kid does more than one). One camper record, tagged to N sessions, so allergy data
-- stays a single source of truth and the kitchen's conflict counts scope per session.
CREATE TABLE IF NOT EXISTS camper_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  camper_id  uuid NOT NULL REFERENCES campers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES commissary_sessions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (camper_id, session_id)
);
ALTER TABLE camper_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS camper_sessions_camp_id_idx ON camper_sessions(camp_id);
CREATE INDEX IF NOT EXISTS camper_sessions_camper_id_idx ON camper_sessions(camper_id);

-- Links a minor to a session → health-gated, same fail-closed rule as campers.
CREATE POLICY "health_select_camper_sessions" ON camper_sessions FOR SELECT
  USING (has_camper_health_access(camp_id));
CREATE POLICY "health_manage_camper_sessions" ON camper_sessions FOR ALL
  USING (has_camper_health_access(camp_id)) WITH CHECK (has_camper_health_access(camp_id));

ALTER PUBLICATION supabase_realtime ADD TABLE camper_sessions;
ALTER TABLE public.camper_sessions REPLICA IDENTITY FULL;

-- Backfill from the legacy single campers.session_id.
INSERT INTO camper_sessions (camp_id, camper_id, session_id)
SELECT camp_id, id, session_id FROM campers WHERE session_id IS NOT NULL
ON CONFLICT (camper_id, session_id) DO NOTHING;

-- Session-aware summary. security_barrier + owned by postgres, so kitchen staff (no health
-- access) still get counts without names; is_camp_member is the only cross-camp guard.
-- session_id NULL = campers not assigned to any session (counted everywhere, fail-safe).
-- Counts are FLAGS, not distinct campers, preserving the prior view's semantics.
DROP VIEW IF EXISTS camper_restriction_summary;
CREATE VIEW camper_restriction_summary WITH (security_barrier = true) AS
  SELECT r.camp_id,
         cs.session_id,
         r.restriction,
         r.kind,
         count(*)::integer AS camper_count,
         count(*) FILTER (WHERE r.severity = 'anaphylactic'::text)::integer AS anaphylactic_count
    FROM camper_restrictions r
    LEFT JOIN camper_sessions cs ON cs.camper_id = r.camper_id
   WHERE is_camp_member(r.camp_id)
   GROUP BY r.camp_id, cs.session_id, r.restriction, r.kind;

GRANT SELECT ON camper_restriction_summary TO authenticated;
