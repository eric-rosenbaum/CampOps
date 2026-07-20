-- Commissary allergy program: source-document locker.
--
-- Instead of an in-app roster parser, staff drop the source file (a parents' allergy
-- spreadsheet, a nurse's PDF) here and it is stored; rosters are entered manually.
-- These documents contain health information about minors, so BOTH the metadata table
-- and the storage objects are gated to has_camper_health_access — the same fail-closed
-- rule as campers/camper_restrictions. Kitchen staff without health access cannot read
-- or upload them.

CREATE TABLE IF NOT EXISTS commissary_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id      uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES commissary_sessions(id) ON DELETE SET NULL,
  name         text NOT NULL,
  -- Path within the private 'commissary-files' storage bucket.
  path         text NOT NULL,
  size_bytes   bigint,
  content_type text,
  uploaded_by  text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE commissary_files ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS commissary_files_camp_id_idx ON commissary_files(camp_id);
CREATE POLICY "health_select_commissary_files" ON commissary_files FOR SELECT
  USING (has_camper_health_access(camp_id));
CREATE POLICY "health_manage_commissary_files" ON commissary_files FOR ALL
  USING (has_camper_health_access(camp_id))
  WITH CHECK (has_camper_health_access(camp_id));

ALTER PUBLICATION supabase_realtime ADD TABLE commissary_files;
ALTER TABLE public.commissary_files REPLICA IDENTITY FULL;

-- Private bucket. Files are served via short-lived signed URLs, never public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('commissary-files', 'commissary-files', false)
ON CONFLICT (id) DO NOTHING;

-- Objects live under a per-camp folder: "<camp_id>/<file>". The first path segment is
-- the camp id, which drives the health-access check.
CREATE POLICY "commissary_files_health_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'commissary-files'
         AND public.has_camper_health_access(((storage.foldername(name))[1])::uuid));
CREATE POLICY "commissary_files_health_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'commissary-files'
              AND public.has_camper_health_access(((storage.foldername(name))[1])::uuid));
CREATE POLICY "commissary_files_health_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'commissary-files'
         AND public.has_camper_health_access(((storage.foldername(name))[1])::uuid));
