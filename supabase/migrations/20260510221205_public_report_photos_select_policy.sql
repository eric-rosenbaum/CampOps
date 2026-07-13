-- Recovered from the live migration ledger (applied out-of-band, no repo file).
CREATE POLICY "Anyone can view public report photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'public-report-photos');
