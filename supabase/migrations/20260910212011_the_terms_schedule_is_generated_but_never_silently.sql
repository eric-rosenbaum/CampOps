-- The agreement, filled in.
--
-- A camp keeps one facility-use agreement, drafted with their insurer or their lawyer, and it is
-- the same document for every group. What changes per group is a short list of facts: who they
-- are, when they come, what it costs, what the deposit is, when they can still cancel. Camps fill
-- those in by hand today, or leave them blank and settle it in email.
--
-- So the camp's PDF stays exactly as it is -- untouched, unparsed, still the document their
-- counsel approved -- and the platform generates a terms schedule that goes in FRONT of it. The
-- signature covers both.
--
-- The hard rule this is built around: a director must never discover that the platform filled in
-- an agreement that already went out. Every value is shown before anything sends, every value is
-- editable by hand, a missing one blocks rather than rendering an empty line into a contract, and
-- what was sent is SNAPSHOT -- never re-rendered later from live data, because a rate edited in
-- November must not silently rewrite an agreement signed in June.

create table if not exists public.retreat_terms_schedules (
  id             uuid primary key default gen_random_uuid(),
  camp_id        uuid not null references public.camps(id)    on delete cascade,
  retreat_id     uuid not null references public.retreats(id) on delete cascade,

  -- The frozen terms, as confirmed. Written once when the camp accepts them and never recomputed:
  -- this is the evidence of what the group agreed to.
  terms          jsonb not null default '[]'::jsonb,

  -- Which values the camp typed over rather than took. Shown on the document, so a hand-set
  -- number is visibly a hand-set number.
  overridden     text[] not null default '{}',

  status         text not null default 'draft'
                 check (status in ('draft', 'confirmed', 'void')),

  confirmed_at   timestamptz,
  confirmed_by   uuid references auth.users(id),
  -- The name typed at the moment of confirming. A person, on the record, not just a session.
  confirmed_name text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- One live schedule per retreat. A voided one stays for the record.
  constraint retreat_terms_one_live unique (retreat_id, status) deferrable initially deferred
);

create index if not exists retreat_terms_retreat_idx on public.retreat_terms_schedules (retreat_id);

comment on table public.retreat_terms_schedules is
  'The generated cover page that goes in front of the camp''s own agreement PDF. Confirmed terms are frozen: never re-rendered from live retreat data, so a later price change cannot rewrite a signed agreement.';
comment on column public.retreat_terms_schedules.terms is
  'Array of {key, label, value, source} — source says where the number came from ("accepted proposal", "typed by hand"), which is what makes the review meaningful rather than decorative.';

alter table public.retreat_terms_schedules enable row level security;

drop policy if exists retreat_terms_read on public.retreat_terms_schedules;
create policy retreat_terms_read on public.retreat_terms_schedules
  for select using (is_camp_member(camp_id));

drop policy if exists retreat_terms_write on public.retreat_terms_schedules;
create policy retreat_terms_write on public.retreat_terms_schedules
  for all using (is_camp_member(camp_id)) with check (is_camp_member(camp_id));

grant select, insert, update, delete on public.retreat_terms_schedules to authenticated;

drop trigger if exists trg_retreat_terms_updated_at on public.retreat_terms_schedules;
create trigger trg_retreat_terms_updated_at before update on public.retreat_terms_schedules
  for each row execute function public.update_updated_at();

-- Does the camp want the schedule at all? Some will not, and a camp that says no should never see
-- a generated page appear in front of their document.
alter table public.camps
  add column if not exists agreement_schedule_enabled boolean not null default false;

comment on column public.camps.agreement_schedule_enabled is
  'Off by default. A camp opts IN to the platform generating a terms page in front of their agreement -- nobody gets a machine-filled contract by upgrade.';
