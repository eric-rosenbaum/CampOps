-- Realtime subscriptions filter on camp_id. With the default replica identity, a
-- DELETE's old row carries only the primary key, so `camp_id=eq.<id>` never matches
-- and the subscription silently misses every delete — a row deleted in one tab keeps
-- showing in another until a refetch. REPLICA IDENTITY FULL puts the whole old row
-- in the WAL so the filter can match.
--
-- Every other realtime table already has this (20260429003102_set_replica_identity_full).
-- Commissary was created after that migration ran, so it needs its own.
--
-- NOTE: the building_* tables were also created after 20260429003102 and were never
-- given FULL. They carry the same latent bug — deletes of buildings, rooms,
-- components, circuits and seasonal tasks do not propagate over realtime. Fixing that
-- is a one-line change per table, deliberately left out of this commissary migration.
ALTER TABLE public.commissary_sessions    REPLICA IDENTITY FULL;
ALTER TABLE public.commissary_vendors     REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_items        REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_adjustments  REPLICA IDENTITY FULL;
ALTER TABLE public.recipes                REPLICA IDENTITY FULL;
ALTER TABLE public.recipe_ingredients     REPLICA IDENTITY FULL;
ALTER TABLE public.recipe_steps           REPLICA IDENTITY FULL;
ALTER TABLE public.menu_entries           REPLICA IDENTITY FULL;
