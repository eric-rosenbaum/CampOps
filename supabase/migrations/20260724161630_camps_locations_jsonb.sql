-- `camps.locations` is jsonb in production but the migration history only ever creates it as
-- text[]. The conversion was done by hand in the dashboard and never captured, so every later
-- migration that treats the column as jsonb — starting with get_public_camp in phase 1 — fails
-- against a database rebuilt from this repo.
--
-- Found by standing up a staging project from migrations alone: it stopped here with
-- "return type mismatch in function declared to return record".
--
-- Guarded, so it is a no-op against production and the real conversion on a fresh database.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'camps'
      and column_name = 'locations' and data_type = 'ARRAY'
  ) then
    alter table public.camps alter column locations drop default;
    alter table public.camps
      alter column locations type jsonb using to_jsonb(coalesce(locations, '{}'::text[]));
    alter table public.camps alter column locations set default '[]'::jsonb;
  end if;
end $$;
