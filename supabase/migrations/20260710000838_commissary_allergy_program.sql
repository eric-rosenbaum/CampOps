-- Commissary phase 2c: allergy program.
--
-- These are the first people in this system who are not user accounts, and the first
-- rows holding health information about minors (anaphylaxis, EpiPen). Every other
-- table in the app grants all staff full read/write. That is not acceptable here.
--
-- ACCESS MODEL
--   campers / camper_restrictions : admins, and staff whose staff_group has
--                                   can_view_camper_health. Names + severity.
--   camper_restriction_summary    : every camp member. Counts only, no names.
--
-- This is the first MODULE-AWARE policy in the schema. Until now `canAccessModule`
-- was UI-only, which means any staff token could read any table straight through
-- PostgREST regardless of what the sidebar showed. That gap is closed for these two
-- tables and these two only.
--
-- NOTE a deliberate divergence: elsewhere a staff member with NO staff group is
-- treated as legacy-full-access. Here, no group means NO access. Health data fails
-- closed. (Verified against live: kitchen staff read 0 camper rows but can still read
-- the aggregate; admins and health-flagged groups read names.)

ALTER TABLE staff_groups
  ADD COLUMN IF NOT EXISTS can_view_camper_health boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.has_camper_health_access(p_camp_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.camp_members m
    LEFT JOIN public.staff_groups g ON g.id = m.staff_group_id
    WHERE m.camp_id = p_camp_id
      AND m.user_id = auth.uid()
      AND m.is_active = true
      AND (m.role = 'admin' OR COALESCE(g.can_view_camper_health, false))
  );
$function$;

CREATE TABLE campers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  session_id uuid REFERENCES commissary_sessions(id) ON DELETE SET NULL,
  name       text NOT NULL,
  cabin      text,
  notes      text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE campers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_campers_updated_at BEFORE UPDATE ON campers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX campers_camp_id_idx ON campers(camp_id);
CREATE POLICY "health_select_campers" ON campers FOR SELECT
  USING (has_camper_health_access(camp_id));
CREATE POLICY "health_manage_campers" ON campers FOR ALL
  USING (has_camper_health_access(camp_id))
  WITH CHECK (has_camper_health_access(camp_id));

-- `kind` separates a safety hazard from an accommodation. The mock conflated them,
-- listing Vegetarian/Vegan/Kosher alongside Peanut/Anaphylactic in one checkbox list.
-- Severity is only meaningful for allergens.
CREATE TABLE camper_restrictions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id   uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  camper_id uuid NOT NULL REFERENCES campers(id) ON DELETE CASCADE,
  restriction text NOT NULL,
  kind text NOT NULL DEFAULT 'allergen' CHECK (kind IN ('allergen','dietary')),
  severity text CHECK (severity IN ('intolerance','confirmed','anaphylactic')),
  notes      text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (camper_id, restriction),
  CHECK (kind = 'dietary' OR severity IS NOT NULL)
);
ALTER TABLE camper_restrictions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_camper_restrictions_updated_at BEFORE UPDATE ON camper_restrictions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX camper_restrictions_camper_id_idx ON camper_restrictions(camper_id);
CREATE INDEX camper_restrictions_camp_id_idx   ON camper_restrictions(camp_id);
CREATE POLICY "health_select_camper_restrictions" ON camper_restrictions FOR SELECT
  USING (has_camper_health_access(camp_id));
CREATE POLICY "health_manage_camper_restrictions" ON camper_restrictions FOR ALL
  USING (has_camper_health_access(camp_id))
  WITH CHECK (has_camper_health_access(camp_id));

-- The kitchen's view: how many campers have each restriction, and how many of those
-- are anaphylactic. No names, no cabins, no per-camper rows. This is what drives the
-- conflict warning on a menu chip.
--
-- The view runs with the owner's privileges (so it can read past the RLS above); the
-- is_camp_member() predicate is what keeps a member from reading another camp's counts.
CREATE VIEW camper_restriction_summary
WITH (security_barrier = true) AS
  SELECT
    r.camp_id,
    r.restriction,
    r.kind,
    count(*)::int AS camper_count,
    count(*) FILTER (WHERE r.severity = 'anaphylactic')::int AS anaphylactic_count
  FROM public.camper_restrictions r
  WHERE is_camp_member(r.camp_id)
  GROUP BY r.camp_id, r.restriction, r.kind;

GRANT SELECT ON camper_restriction_summary TO authenticated;

-- Realtime respects RLS, so a kitchen-staff client receives no events for these two
-- tables. Their aggregate refreshes on the app's periodic refetch instead.
ALTER PUBLICATION supabase_realtime ADD TABLE campers, camper_restrictions;
ALTER TABLE public.campers             REPLICA IDENTITY FULL;
ALTER TABLE public.camper_restrictions REPLICA IDENTITY FULL;
