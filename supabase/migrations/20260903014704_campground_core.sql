-- Campground: one queue, two crews, five ways in.
--
-- "Issues & Repairs" became the wrong name the moment housekeeping, retreat set-ups, turnovers
-- and routines started landing in the same list. The module is renamed in the UI only: this
-- table stays `issues`, the staff-group module key stays `issues_repairs`, and /issues stays a
-- route. Renaming a table that thirteen surfaces and an iOS app read from is pure risk for zero
-- user-visible gain.
--
-- What actually changes here is the shape of a work order:
--
--   trade        which crew. A column, not a module -- housekeeping is "the same as maintenance
--                just colored differently", which is an enum. A separate table would double the
--                activity trail, assignment, photos, realtime, iOS list and analytics to gain
--                nothing.
--   asset_id     work against a *thing*. This is the central idea of a CMMS and the reason the
--                season review can say "the Gator cost $2,340 across nine work orders" -- a
--                replace-it argument rather than a maintenance report.
--   vendor_id    camps do not fix the commercial dishwasher themselves. The septic pumper, the
--                well contractor and the elevator inspector are the other half of the
--                maintenance department and had nowhere to live.
--   assigned_at  } response times. Deriving these from the free-text activity log is not
--   resolved_at  } analysis, it is guessing, and the season review is a document a director
--                  forwards to a board.

-- Trade -----------------------------------------------------------------------
alter table issues add column if not exists trade text not null default 'maintenance';

alter table issues drop constraint if exists issues_trade_check;
alter table issues add constraint issues_trade_check
  check (trade in ('maintenance','housekeeping','grounds','kitchen','it'));

comment on column issues.trade is
  'Which crew owns this. A filter default and a color, never a permission -- gating work by trade would rebuild the staff-visibility trap that hid a reporter''s own issue from them.';

create index if not exists issues_camp_trade_idx on issues (camp_id, trade, status);

-- Status: two honest waiting states -------------------------------------------
-- "Waiting on the septic guy since June" currently renders as in_progress, which is how a queue
-- stops meaning anything. Both new states are open (not resolved) but explicitly not being
-- worked, which is the truth about roughly a third of a camp's open list.
alter table issues drop constraint if exists issues_status_check;
alter table issues add constraint issues_status_check
  check (status in ('unassigned','assigned','in_progress','waiting_on_vendor','waiting_on_part','resolved'));

-- Source: work now arrives five ways ------------------------------------------
alter table issues drop constraint if exists issues_source_check;
alter table issues add constraint issues_source_check
  check (source is null or source in ('web','ios','public','qr','routine','retreat','session','module'));

comment on column issues.source is
  'How this work arrived. Null means unknown (rows predating the column), not web. The season review counts by this, which is what proves the sticker programme worked -- or that it did not.';

-- Links out -------------------------------------------------------------------
alter table issues add column if not exists asset_id uuid references camp_assets(id) on delete set null;
alter table issues add column if not exists vendor_id uuid;
alter table issues add column if not exists schedule_id uuid;
alter table issues add column if not exists retreat_space_request_id uuid;
alter table issues add column if not exists retreat_id uuid references retreats(id) on delete set null;
alter table issues add column if not exists minutes_spent integer;

comment on column issues.minutes_spent is
  'Optional, off by default. A salaried summer crew does not clock in -- but a camp arguing for a fourth hire wants the number, so it is available rather than mandatory.';

create index if not exists issues_asset_idx   on issues (asset_id)   where asset_id is not null;
create index if not exists issues_retreat_idx on issues (retreat_id) where retreat_id is not null;

-- Timing ----------------------------------------------------------------------
alter table issues add column if not exists assigned_at timestamptz;
alter table issues add column if not exists resolved_at timestamptz;

create or replace function public.issues_stamp_timing()
returns trigger language plpgsql as $fn$
begin
  -- First assignment only. A reassignment three weeks later is not the moment somebody picked
  -- this up, and time-to-assign is meant to measure the queue, not the churn.
  if new.assignee_id is not null and old.assignee_id is null and new.assigned_at is null then
    new.assigned_at := now();
  end if;

  if new.status = 'resolved' and coalesce(old.status,'') <> 'resolved' then
    new.resolved_at := coalesce(new.resolved_at, now());
  elsif new.status <> 'resolved' and old.status = 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists issues_stamp_timing_trg on issues;
create trigger issues_stamp_timing_trg before update on issues
  for each row execute function public.issues_stamp_timing();

-- Backfill only what the activity log actually attests to. Rows with no resolution entry keep a
-- null resolved_at and are excluded from timing rather than assigned a plausible-looking date --
-- an invented median is worse than a smaller sample.
update issues i set resolved_at = a.at
from (
  select issue_id, max(created_at) as at
  from issue_activity
  where action ilike '%resolved%' or action ilike '%closed%'
  group by issue_id
) a
where a.issue_id = i.id and i.status = 'resolved' and i.resolved_at is null;

update issues i set assigned_at = a.at
from (
  select issue_id, min(created_at) as at
  from issue_activity
  where action ilike '%assigned%'
  group by issue_id
) a
where a.issue_id = i.id and i.assignee_id is not null and i.assigned_at is null;

-- Cost estimates are retired --------------------------------------------------
comment on column issues.estimated_cost_display is 'DEPRECATED 2026-09-02. Not written, not shown. actual_cost is the only real money figure in this module.';
comment on column issues.estimated_cost_value  is 'DEPRECATED 2026-09-02. See estimated_cost_display.';
comment on column issues.is_recurring          is 'DEPRECATED 2026-09-02. Never generated anything. Recurrence now lives in work_schedules; these rows were migrated there.';
comment on column issues.recurring_interval    is 'DEPRECATED 2026-09-02. See is_recurring.';

-- Service vendors -------------------------------------------------------------
-- Deliberately not commissary_vendors. A food supplier and a septic contractor share a phone
-- number and nothing else: one has order cutoffs and delivery days, the other has a certificate
-- of insurance that Compliance asks about.
create table if not exists service_vendors (
  id               uuid primary key default gen_random_uuid(),
  camp_id          uuid not null references camps(id) on delete cascade,
  name             text not null,
  trade            text,
  contact_name     text,
  phone            text,
  email            text,
  website          text,
  account_number   text,
  insurance_expiry date,
  notes            text,
  last_used_on     date,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists service_vendors_camp_idx on service_vendors (camp_id, is_active);

comment on table service_vendors is
  'Contractors the camp dispatches work to. Compliance reads insurance_expiry -- several obligations are satisfied by a third party''s annual visit.';

alter table issues drop constraint if exists issues_vendor_id_fkey;
alter table issues add constraint issues_vendor_id_fkey
  foreign key (vendor_id) references service_vendors(id) on delete set null;

alter table service_vendors enable row level security;
drop policy if exists service_vendors_rw on service_vendors;
create policy service_vendors_rw on service_vendors
  for all using (is_camp_member(camp_id)) with check (is_camp_member(camp_id));

alter table service_vendors replica identity full;

-- Routing: so nobody triages --------------------------------------------------
-- The single highest-value row in this migration. An untriaged queue is why CMMS rollouts die:
-- a housekeeping report that sits unassigned until an admin notices it is a report nobody acts
-- on. One row per trade says where its work lands by default.
create table if not exists work_routing (
  camp_id                uuid not null references camps(id) on delete cascade,
  trade                  text not null,
  default_staff_group_id uuid references staff_groups(id) on delete set null,
  default_assignee_id    uuid,
  updated_at             timestamptz not null default now(),
  primary key (camp_id, trade)
);

alter table work_routing enable row level security;
drop policy if exists work_routing_read  on work_routing;
create policy work_routing_read on work_routing for select using (is_camp_member(camp_id));
drop policy if exists work_routing_write on work_routing;
create policy work_routing_write on work_routing
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

alter table work_routing replica identity full;

-- Assign a new work order from the routing table. Returns the assignee, or null when the camp
-- has not set one -- unassigned is a legitimate answer, and guessing an owner is worse.
create or replace function public.route_work(p_camp_id uuid, p_trade text)
returns uuid language sql stable security definer set search_path = public as $fn$
  select default_assignee_id from work_routing where camp_id = p_camp_id and trade = p_trade;
$fn$;

-- Locations go out of service -------------------------------------------------
-- The second seam. Assets already had a status; locations did not, which means a rental
-- coordinator can put twelve guests in a cabin that has been out of service since June because
-- the rooming board has no way to know.
alter table locations add column if not exists service_status text not null default 'in_service';
alter table locations drop constraint if exists locations_service_status_check;
alter table locations add constraint locations_service_status_check
  check (service_status in ('in_service','out_of_service','limited'));

alter table locations add column if not exists out_of_service_reason text;
alter table locations add column if not exists out_of_service_since  date;
alter table locations add column if not exists expected_back         date;

comment on column locations.service_status is
  'Read by rental availability and the rooming board, not just displayed. limited = usable with a caveat (no hot water), out_of_service = do not book.';

-- Program spaces live on the one tree -----------------------------------------
-- Beside is_dorm rather than overloading retreat_available, which already means "rentable to
-- groups". A room's program capacity is not its bed capacity: the Lodge sleeps nobody and seats
-- eighty.
alter table locations add column if not exists program_space   boolean not null default false;
alter table locations add column if not exists capacity_seated integer;

create index if not exists locations_program_idx on locations (camp_id) where program_space;

-- Asset QR --------------------------------------------------------------------
-- The same 12-character token scheme the locations already carry, so one sticker mechanism and
-- one print sheet cover both. Scan the Gator, get its history and its open work.
alter table camp_assets add column if not exists qr_token text;
update camp_assets set qr_token = public.gen_qr_token() where qr_token is null;
alter table camp_assets alter column qr_token set default public.gen_qr_token();
alter table camp_assets alter column qr_token set not null;
create unique index if not exists camp_assets_qr_token_key on camp_assets(qr_token);

comment on column camp_assets.qr_token is
  'Opaque token printed on this asset''s sticker. Same scheme and same non-secret posture as locations.qr_token.';
