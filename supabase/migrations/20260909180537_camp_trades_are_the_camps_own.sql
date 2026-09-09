-- Trades were five hard-coded strings in a CHECK constraint. Camps do not agree on five:
-- a camp with no IT person does not want an empty Tech lane, and a camp with a waterfront
-- crew or a horse barn has nowhere to put that work. So the list becomes the camp's own,
-- seeded with the five defaults so nothing changes until somebody changes it.

create table if not exists camp_trades (
  id          uuid primary key default gen_random_uuid(),
  camp_id     uuid not null references camps(id) on delete cascade,
  -- Stable across renames: `trade` columns store this, so a camp calling Grounds "Property"
  -- renames the label without rewriting a season of work orders.
  key         text not null check (key ~ '^[a-z][a-z0-9_]{0,30}$'),
  label       text not null check (length(trim(label)) between 1 and 40),
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (camp_id, key)
);

alter table camp_trades enable row level security;

create policy camp_trades_read on camp_trades for select
  using (camp_id in (select camp_id from camp_members where user_id = auth.uid()));

create policy camp_trades_write on camp_trades for all
  using (camp_id in (
    select camp_id from camp_members
    where user_id = auth.uid() and role in ('admin','manager')))
  with check (camp_id in (
    select camp_id from camp_members
    where user_id = auth.uid() and role in ('admin','manager')));

-- Seed every existing camp with the five that were hard-coded.
insert into camp_trades (camp_id, key, label, sort_order)
select c.id, d.key, d.label, d.ord
from camps c
cross join (values
  ('maintenance', 'Maintenance', 1),
  ('housekeeping','Housekeeping',2),
  ('grounds',     'Grounds',     3),
  ('kitchen',     'Kitchen',     4),
  ('it',          'Tech',        5)
) as d(key, label, ord)
on conflict (camp_id, key) do nothing;

-- New camps get the same five.
create or replace function seed_camp_trades() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into camp_trades (camp_id, key, label, sort_order)
  values (new.id, 'maintenance','Maintenance',1),
         (new.id, 'housekeeping','Housekeeping',2),
         (new.id, 'grounds','Grounds',3),
         (new.id, 'kitchen','Kitchen',4),
         (new.id, 'it','Tech',5)
  on conflict (camp_id, key) do nothing;
  return new;
end $$;

drop trigger if exists trg_seed_camp_trades on camps;
create trigger trg_seed_camp_trades after insert on camps
  for each row execute function seed_camp_trades();

-- The CHECK constraints go, replaced by "must be one of this camp's trades". Same integrity,
-- no global vocabulary. Retired trades still validate so historical work orders stay readable.
alter table issues          drop constraint if exists issues_trade_check;
alter table work_schedules  drop constraint if exists work_schedules_trade_check;

create or replace function assert_trade_belongs_to_camp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trade is null then return new; end if;
  if not exists (select 1 from camp_trades t
                 where t.camp_id = new.camp_id and t.key = new.trade) then
    raise exception 'trade % is not one of this camp''s trades', new.trade
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_issues_trade on issues;
create trigger trg_issues_trade before insert or update of trade, camp_id on issues
  for each row execute function assert_trade_belongs_to_camp();

drop trigger if exists trg_schedules_trade on work_schedules;
create trigger trg_schedules_trade before insert or update of trade, camp_id on work_schedules
  for each row execute function assert_trade_belongs_to_camp();

create index if not exists camp_trades_camp_idx on camp_trades(camp_id, sort_order);
