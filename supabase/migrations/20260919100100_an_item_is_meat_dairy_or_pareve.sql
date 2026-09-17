-- A kosher kitchen needs to know which items are meat, dairy or pareve before it can see a dairy
-- dessert planned after a meat dinner. A kitchen manager at a kosher camp found the menu builder
-- had no idea.
--
-- Null means "work it out": the app derives meat from the item's "contains meat" flag or a protein
-- category, dairy from the dairy allergen or a dairy category (eggs excepted), and pareve otherwise.
-- The kitchen sets it explicitly when the derivation is wrong (fish in the protein category, say).
alter table public.inventory_items add column if not exists kosher_type text;
alter table public.inventory_items drop constraint if exists inventory_items_kosher_type_check;
alter table public.inventory_items add constraint inventory_items_kosher_type_check
  check (kosher_type is null or kosher_type in ('meat','dairy','pareve'));
comment on column public.inventory_items.kosher_type is
  'meat | dairy | pareve as set by the kitchen; null = derived in the app from category and flags.';
