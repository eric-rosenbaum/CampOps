-- Nightly job to expire trials past their window.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('expire-retreat-trials', '0 8 * * *', $$SELECT public.expire_trials();$$);
