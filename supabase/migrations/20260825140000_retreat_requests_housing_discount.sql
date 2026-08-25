-- Three additions to the retreats module.
--
-- 1. The group can say "housing is done". Until now the camp had no way to tell a half-built
--    rooming plan from a finished one, so they either chased the coordinator or guessed. This
--    is the group's sign-off, deliberately separate from `retreat_housing.locked`, which stays
--    the camp's approval. The guest says they are finished; the camp still decides.
-- 2. Requests run both ways. The table only ever recorded the group asking the camp for
--    something, so anything going the other way happened by email and left no trace on the
--    booking. `origin` says who started the thread.
-- 3. Invoices can carry a discount, subtracted from the billed total and the balance.

-- ── 1. Housing sign-off ──────────────────────────────────────────────────────
alter table retreats
  add column if not exists housing_submitted_at timestamptz,
  add column if not exists housing_submitted_by text;

comment on column retreats.housing_submitted_at is
  'When the group marked their rooming complete in the portal. Their sign-off, not the camp''s approval, which is retreat_housing.locked.';

-- ── 2. Request direction ─────────────────────────────────────────────────────
alter table retreat_change_requests
  add column if not exists origin text not null default 'guest';

do $$ begin
  alter table retreat_change_requests
    add constraint retreat_change_requests_origin_check check (origin in ('guest', 'camp'));
exception when duplicate_object then null; end $$;

comment on column retreat_change_requests.origin is
  'guest = the group asked the camp. camp = the camp asked the group, answered in the portal.';

-- Everything already on file came from a group, which is what the default records.

-- ── 3. Invoice discount ──────────────────────────────────────────────────────
alter table retreat_invoices
  add column if not exists discount numeric not null default 0,
  add column if not exists discount_note text;

do $$ begin
  alter table retreat_invoices
    add constraint retreat_invoices_discount_check check (discount >= 0);
exception when duplicate_object then null; end $$;

comment on column retreat_invoices.discount is
  'Subtracted from the line-item total. `amount` remains the net payable, so balance maths is unchanged.';
