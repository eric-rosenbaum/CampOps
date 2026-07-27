-- The location-category seed functions are internal (trigger + migration only); they should
-- not be part of the exposed API. Revoke execute (matches the Phase 1 function-hardening posture).
revoke execute on function public.seed_camp_locations_trg() from public, anon, authenticated;
revoke execute on function public.seed_location_categories(uuid) from public, anon, authenticated;
