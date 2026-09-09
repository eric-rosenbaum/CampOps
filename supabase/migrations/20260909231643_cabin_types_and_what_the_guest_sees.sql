-- Two things about what a group sees when it picks a cabin.
--
-- First: they were being shown rooms that are out of service, greyed out, with the reason and
-- the date it is expected back. That is the camp's business, not a guest's -- "the septic line
-- is dug up" is not something a church group needs to read while choosing bunks, and a room
-- they cannot have is noise on the list. A room is either available or it is not there.
--
-- Second: they were choosing between "Cabin 1" and "Cabin 7" with nothing to tell them apart.
-- A cabin type is a description the camp writes once -- what a Standard Cabin is, what a Lodge
-- Room is -- and points however many cabins at. Editing the type updates every cabin using it,
-- which is the whole point of writing it once. A cabin can also carry its own note on top for
-- the thing that is true of that one cabin only.

create table if not exists camp_cabin_types (
  id          uuid primary key default gen_random_uuid(),
  camp_id     uuid not null references camps(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (camp_id, name)
);

alter table camp_cabin_types enable row level security;

create policy cabin_types_read on camp_cabin_types for select
  using (is_camp_member(camp_id));
create policy cabin_types_write on camp_cabin_types for all
  using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

alter table locations add column if not exists cabin_type_id uuid
  references camp_cabin_types(id) on delete set null;

comment on column locations.notes is
  'Shown to the group in the portal alongside its cabin type. Anything the camp does not want a guest reading belongs on the work order, not here.';

alter publication supabase_realtime add table camp_cabin_types;
alter table camp_cabin_types replica identity full;
