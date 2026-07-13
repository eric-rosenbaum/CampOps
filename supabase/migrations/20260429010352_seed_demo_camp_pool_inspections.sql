-- Recovered from the live migration ledger (applied out-of-band, no repo file).
--
-- This is a DATA migration that seeds a default inspection schedule for one specific
-- camp's two specific pools. The original hardcoded those UUIDs unguarded, which means
-- replaying it against a fresh database would fail on the pool_id foreign key.
--
-- Wrapped in an existence check so it stays a faithful record of what ran against
-- production while being a clean no-op anywhere those rows do not exist.
DO $$
DECLARE
  v_camp       uuid := '7f295077-b1f0-429e-ae2b-82293be781e6';  -- Demo Camp
  v_main_pool  uuid := '7e3be6f8-bdf7-47ce-b173-17265cb82b5a';
  v_waterfront uuid := 'ac38a33b-db31-4bfb-a491-13dc05fecb95';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pools WHERE id IN (v_main_pool, v_waterfront)) THEN
    RAISE NOTICE 'Demo Camp pools not present — skipping seed';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pool_inspections WHERE pool_id IN (v_main_pool, v_waterfront)) THEN
    RAISE NOTICE 'Inspections already seeded — skipping';
    RETURN;
  END IF;

  INSERT INTO pool_inspections
    (id, camp_id, pool_id, name, frequency, authority, standard, status, last_completed, next_due, history, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_camp, v_main_pool,
     'Health dept. water quality inspection', 'Every 30 days', 'County Health Department', 'State law required',
     'due', NULL, now()::date, '[]', now(), now()),
    (gen_random_uuid(), v_camp, v_main_pool,
     'Pool equipment monthly service check', 'Monthly', NULL, NULL,
     'due', NULL, now()::date, '[]', now(), now()),
    (gen_random_uuid(), v_camp, v_main_pool,
     'Lifeguard certification verification', 'Before each session', 'ACA & Red Cross', NULL,
     'due', NULL, now()::date, '[]', now(), now()),
    (gen_random_uuid(), v_camp, v_main_pool,
     'Pre-season pool opening inspection', 'Annual', NULL, NULL,
     'due', NULL, now()::date, '[]', now(), now()),
    (gen_random_uuid(), v_camp, v_waterfront,
     'ACA waterfront safety inspection', 'Weekly during session', 'Internal', 'ACA Standard WS-4',
     'due', NULL, now()::date, '[]', now(), now()),
    (gen_random_uuid(), v_camp, v_waterfront,
     'Lifeguard certification verification', 'Before each session', 'ACA & Red Cross', NULL,
     'due', NULL, now()::date, '[]', now(), now()),
    (gen_random_uuid(), v_camp, v_waterfront,
     'Pre-season opening inspection', 'Annual', NULL, NULL,
     'due', NULL, now()::date, '[]', now(), now());
END $$;
