-- Recovered from the live migration ledger (applied out-of-band, no repo file).
CREATE POLICY "Authenticated users can upload public report photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'public-report-photos');
