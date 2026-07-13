-- Create issue-photos storage bucket (public for reads, authenticated for writes)
INSERT INTO storage.buckets (id, name, public)
VALUES ('issue-photos', 'issue-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow camp members to upload photos (path must be {campId}/{issueId})
CREATE POLICY "Camp members can upload issue photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'issue-photos'
  AND is_camp_member((storage.foldername(name))[1]::uuid)
);

-- Allow anyone to view photos (bucket is public)
CREATE POLICY "Anyone can view issue photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'issue-photos');

-- Allow camp members to update/replace photos
CREATE POLICY "Camp members can update issue photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'issue-photos'
  AND is_camp_member((storage.foldername(name))[1]::uuid)
);

-- Allow camp members to delete photos
CREATE POLICY "Camp members can delete issue photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'issue-photos'
  AND is_camp_member((storage.foldername(name))[1]::uuid)
);
