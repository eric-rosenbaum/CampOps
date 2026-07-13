-- Recovered from the live migration ledger (applied out-of-band, no repo file).
CREATE OR REPLACE FUNCTION public.update_camp(
  p_camp_id uuid,
  p_name text DEFAULT NULL,
  p_camp_type text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_modules jsonb DEFAULT NULL,
  p_locations jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_camp_admin(p_camp_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE camps SET
    name        = COALESCE(p_name, name),
    camp_type   = COALESCE(p_camp_type, camp_type),
    state       = COALESCE(p_state, state),
    modules     = COALESCE(p_modules, modules),
    locations   = COALESCE(p_locations, locations)
  WHERE id = p_camp_id;
END;
$$;
