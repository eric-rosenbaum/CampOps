-- The "Scale to" number on a recipe card is a real planning decision ("we cook this for
-- 80, not for the whole session"), so it belongs on the recipe rather than in transient
-- client state where it was lost on every refresh. NULL means "follow the session head
-- count", which is the existing default behaviour.
alter table public.recipes
  add column if not exists scale_to integer;

alter table public.recipes
  drop constraint if exists recipes_scale_to_check;

alter table public.recipes
  add constraint recipes_scale_to_check check (scale_to is null or scale_to > 0);

comment on column public.recipes.scale_to is
  'Portions the recipe card is scaled to. NULL = follow the active session head count.';
