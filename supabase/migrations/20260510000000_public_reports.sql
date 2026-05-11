-- Add public-report fields to issues
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS is_public_report boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reporter_name     text,
  ADD COLUMN IF NOT EXISTS reporter_contact  text;

-- Allow reported_by_id to be NULL (anonymous submitters have no user ID)
ALTER TABLE issues ALTER COLUMN reported_by_id DROP NOT NULL;

-- Let the anon key read a camp by its slug (for the public report landing page)
CREATE POLICY IF NOT EXISTS "anon read camp by slug"
  ON camps
  FOR SELECT
  TO anon
  USING (true);

-- Let the anon key submit public issue reports
CREATE POLICY IF NOT EXISTS "anon insert public reports"
  ON issues
  FOR INSERT
  TO anon
  WITH CHECK (is_public_report = true);

-- ─── Storage ──────────────────────────────────────────────────────────────────
-- Create the public-report-photos bucket manually in Supabase:
--   Dashboard → Storage → New bucket
--   Name: public-report-photos
--   Public: ✓  (so uploaded images can be displayed without a signed URL)
--
-- Then add a storage INSERT policy for the bucket:
--   Allowed for role: anon
--   Path pattern: *
