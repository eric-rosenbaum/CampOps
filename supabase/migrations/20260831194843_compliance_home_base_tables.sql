-- The five records the module was missing.
--
-- Measured against every obligation a Westchester camp carries (docs/compliance/
-- westchester-obligation-map.md), the platform was strong where the EVIDENCE lives — inspections,
-- drills, temperature logs, pool chemistry, certifications — and empty where the PAPERWORK lives.
-- Sixty-seven of 155 requirements resolved to "upload a document" because there was nothing to
-- compute from. These are the five tables that close most of that, in the order they hurt.
--
-- One rule runs through all of them, and it is the reason a camp should trust this module with
-- compliance at all: **we record that a thing was done and when, never the personal result**. The
-- registry response, the criminal-history statement, the household on LDSS-3370 and the named
-- medical log stay in the camp's own files. What an inspector actually asks is "when did you run
-- it", and that is what we hold.

-- ── 1. Incidents ─────────────────────────────────────────────────────────────
--
-- The largest single gap. 10 NYCRR 7-2.8(d) gives a camp 24 hours to report a list of specific
-- injuries and illnesses, there are eight forms it is reported on, and the platform had no
-- incident record of any kind. `issues` is a maintenance tracker with no person-harmed field.
--
-- NO NAMES. The medical log with camper and staff names is the health director's and stays in the
-- health office; this table exists to prove a reportable incident was reported on the clock.

create table if not exists compliance_incidents (
  id             uuid primary key default gen_random_uuid(),
  camp_id        uuid not null references camps(id) on delete cascade,
  season_id      uuid references seasons(id) on delete set null,
  occurred_at    timestamptz,
  -- The clock runs from when the camp KNEW, not from when it happened, which is the only reading
  -- that works for an illness noticed days later.
  discovered_at  timestamptz not null default now(),
  kind           text not null check (kind in (
                   'injury','illness_outbreak','abuse_allegation','fire','multiple_victim',
                   'rabies_exposure','epinephrine','vaccine_preventable','water_contamination',
                   'amusement_device','other')),
  subject        text check (subject in ('camper','staff','volunteer','visitor','multiple','none')),
  severity       text[] not null default '{}',
  form_code      text,
  reportable     boolean not null default false,
  -- 'immediate' for rabies, vaccine-preventable disease and Justice Center incidents; otherwise
  -- discovered_at + 24 hours.
  report_due_at  timestamptz,
  reported_at    timestamptz,
  reported_to    text,
  report_method  text,
  reported_by    text,
  narrative      text,
  location_id    uuid references locations(id) on delete set null,
  follow_up      text,
  closed_at      timestamptz,
  -- Justice Center clocks, 7-2.25(b): investigate within 5 business days, written report within
  -- 45 days, corrective plan within 45, implemented within 90. Only ever populated for a camp
  -- with 20%+ enrolment of campers with a developmental disability.
  investigation_started_at  timestamptz,
  written_report_at         timestamptz,
  corrective_plan_at        timestamptz,
  corrective_implemented_at timestamptz,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists compliance_incidents_camp_season on compliance_incidents (camp_id, season_id);
create index if not exists compliance_incidents_open on compliance_incidents (camp_id) where reported_at is null;

comment on table compliance_incidents is
  'Reportable incidents and the clock they were reported on. Deliberately holds no camper or staff '
  'name — the named medical log stays with the health director.';

-- The severity list is 7-2.8(d) verbatim, kept as data so the reportability test and the UI read
-- the same set.
create table if not exists compliance_incident_criteria (
  code        text primary key,
  label       text not null,
  applies_to  text not null default 'any' check (applies_to in ('any','camper','staff')),
  sort_order  integer not null default 0
);

insert into compliance_incident_criteria (code, label, applies_to, sort_order) values
  ('death',            'Resulted in death',                                             'any',    10),
  ('resuscitation',    'Required resuscitation',                                        'any',    20),
  ('hospital_admission','Required admission to a hospital (an ER visit is not admission)','any',   30),
  ('epinephrine',      'Required administration of epinephrine',                         'any',    40),
  ('head_neck_spine',  'Eye, head, neck or spine injury referred to a hospital',         'camper', 50),
  ('fracture',         'Bone fracture or dislocation',                                   'camper', 60),
  ('laceration',       'Laceration requiring sutures, staples or medical glue',          'camper', 70),
  ('burn_5pct',        'Second or third degree burns to 5% or more of the body',         'camper', 80),
  ('rabies_exposure',  'Exposure to an animal potentially infected with rabies',         'any',    90),
  ('abuse_allegation', 'Allegation of physical or sexual abuse',                         'any',   100),
  ('suspected_illness','Suspected water-, food- or air-borne illness',                   'any',   110)
on conflict (code) do nothing;

-- ── 2. Screenings ────────────────────────────────────────────────────────────
--
-- 7-2.5(l) and PHL art. 13-B: every employee and volunteer checked against the DCJS registry
-- before their first day and annually thereafter before arrival, regardless of job title or
-- full/part-time status. Westchester asks for more — the federal NSOPW search, and anyone who
-- frequents the camp. Chapter 873 §873.1804 adds two written non-relative references before
-- employment begins.
--
-- `cleared` is the operator's own attestation. The DCJS letter is not stored here and must not be.

create table if not exists compliance_screenings (
  id            uuid primary key default gen_random_uuid(),
  camp_id       uuid not null references camps(id) on delete cascade,
  season_id     uuid references seasons(id) on delete set null,
  staff_id      uuid references safety_staff(id) on delete cascade,
  -- A screening can attach to somebody who is not on the roster: "persons who frequent the camp"
  -- under the county rule, and the director's own household check.
  subject_label text,
  kind          text not null check (kind in (
                  'dcjs_sor','nsopw','scr_ldss3370','justice_center_sel','reference_check',
                  'employment_certificate')),
  performed_on  date not null,
  method        text check (method in ('fax','mail','email','cd','telephone','portal','in_person')),
  -- DCJS gives a screener ID on telephone screenings, and the fact sheet requires it be recorded.
  reference_id  text,
  cleared       boolean,
  expires_on    date,
  note          text,
  recorded_by   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists compliance_screenings_staff on compliance_screenings (camp_id, staff_id, kind);
create index if not exists compliance_screenings_season on compliance_screenings (camp_id, season_id, kind);

comment on table compliance_screenings is
  'That a background check was run, when, by what method — never its result. The registry response '
  'letter stays in the camp''s files, which is where the regulation puts it.';

-- ── 3. Training and orientation attendance ───────────────────────────────────
--
-- DOH-2040 lists "Training Attendance Documentation" and "Orientation Attendance Documentation"
-- as plan components in their own right, and 7-2.25(b) requires the Justice Center code of
-- conduct issued at hire and annually with a documented acknowledgment. Nothing tracked either.

create table if not exists compliance_trainings (
  id             uuid primary key default gen_random_uuid(),
  camp_id        uuid not null references camps(id) on delete cascade,
  season_id      uuid references seasons(id) on delete set null,
  staff_id       uuid references safety_staff(id) on delete cascade,
  kind           text not null check (kind in (
                   'staff_orientation','camper_orientation','mandated_reporter','code_of_conduct',
                   'activity_specific','skills_verification','other')),
  title          text,
  delivered_on   date not null,
  delivered_by   text,
  minutes        integer,
  -- The code of conduct is acknowledged, not merely attended.
  acknowledged_on date,
  note           text,
  recorded_by    text,
  created_at     timestamptz not null default now()
);
create index if not exists compliance_trainings_staff on compliance_trainings (camp_id, staff_id, kind);
create index if not exists compliance_trainings_season on compliance_trainings (camp_id, season_id, kind);

-- ── 4. Insurance ─────────────────────────────────────────────────────────────
--
-- Two obligations need it and neither was tracked: workers' compensation and disability proof
-- with the permit application (ACORD certificates are explicitly refused), and liability of not
-- less than $1,000,000 per occurrence for amusement devices, proved to the local health
-- department annually before use.

create table if not exists compliance_insurance (
  id                 uuid primary key default gen_random_uuid(),
  camp_id            uuid not null references camps(id) on delete cascade,
  season_id          uuid references seasons(id) on delete set null,
  kind               text not null check (kind in (
                       'workers_comp','disability','amusement_device_liability','general_liability',
                       'vehicle','other')),
  carrier            text,
  policy_number      text,
  -- C-105.2, U-26.3, SI-12, GSI-105.2, CE-200, DB-120.1, DB-155.
  form_code          text,
  per_occurrence_cents bigint,
  aggregate_cents      bigint,
  effective_on       date,
  expires_on         date,
  document_id        uuid references compliance_documents(id) on delete set null,
  filed_with         text,
  filed_on           date,
  note               text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists compliance_insurance_camp on compliance_insurance (camp_id, kind);

-- ── 5. Source versions ───────────────────────────────────────────────────────
--
-- What makes "what changed this year" computable rather than remembered. Every requirement,
-- form and fee in this module comes from a document somewhere, and those documents move: the
-- county reissues its packet each season, the sanitary code was amended in August 2025, form
-- revisions span 1993 to 2025. Nothing in the product would have noticed any of it.
--
-- Global catalog, not per camp: the source is the same for every camp in the jurisdiction. What
-- differs per camp is whether the change touches them, which `affects` answers.

create table if not exists compliance_sources (
  id             uuid primary key default gen_random_uuid(),
  source_key     text not null unique,
  title          text not null,
  issuer         text,
  kind           text not null check (kind in ('regulation','form','packet','guidance','code','factsheet')),
  url            text,
  -- False when the URL carries a date or revision in it and will break — the county sanitary code
  -- is published as "CHAPTER 873 FINAL VERSION APPROVED 8-5-25.pdf". For those the archived copy
  -- is the durable artefact and the UI links to it.
  url_stable     boolean not null default true,
  archived_path  text,
  jurisdiction_code text,
  watch          boolean not null default true,
  sort_order     integer not null default 0
);

create table if not exists compliance_source_versions (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references compliance_sources(id) on delete cascade,
  sha256         text,
  retrieved_at   timestamptz not null default now(),
  effective_date date,
  revision_label text,
  change_summary text,
  -- Which requirements this version touches, and the setup answers that decide whether a given
  -- camp cares: {"req_codes":["WC-14"],"applies_when":{"any_of":{"has_pool":"true"}}}
  affects        jsonb not null default '{}'::jsonb,
  is_current     boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists compliance_source_versions_source on compliance_source_versions (source_id, is_current);

alter table compliance_sources         enable row level security;
alter table compliance_source_versions enable row level security;
alter table compliance_incident_criteria enable row level security;
alter table compliance_incidents  enable row level security;
alter table compliance_screenings enable row level security;
alter table compliance_trainings  enable row level security;
alter table compliance_insurance  enable row level security;

-- Catalog: everyone reads, platform admins write.
drop policy if exists compliance_sources_read on compliance_sources;
create policy compliance_sources_read on compliance_sources for select to authenticated using (true);
drop policy if exists compliance_sources_admin on compliance_sources;
create policy compliance_sources_admin on compliance_sources
  for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists compliance_source_versions_read on compliance_source_versions;
create policy compliance_source_versions_read on compliance_source_versions for select to authenticated using (true);
drop policy if exists compliance_source_versions_admin on compliance_source_versions;
create policy compliance_source_versions_admin on compliance_source_versions
  for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists compliance_incident_criteria_read on compliance_incident_criteria;
create policy compliance_incident_criteria_read on compliance_incident_criteria for select to authenticated using (true);

-- Incidents: any camp member reads, admin and staff write. A health director filing at 2am is
-- staff, not an admin.
drop policy if exists compliance_incidents_select on compliance_incidents;
create policy compliance_incidents_select on compliance_incidents
  for select using (is_camp_member(camp_id));
drop policy if exists compliance_incidents_write on compliance_incidents;
create policy compliance_incidents_write on compliance_incidents
  for all using (get_camp_role(camp_id) = any (array['admin','staff']))
  with check (get_camp_role(camp_id) = any (array['admin','staff']));

-- Screenings and trainings attach to a named person, so they follow safety_staff: admin only.
drop policy if exists compliance_screenings_select on compliance_screenings;
create policy compliance_screenings_select on compliance_screenings
  for select using (is_camp_admin(camp_id));
drop policy if exists compliance_screenings_write on compliance_screenings;
create policy compliance_screenings_write on compliance_screenings
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

drop policy if exists compliance_trainings_select on compliance_trainings;
create policy compliance_trainings_select on compliance_trainings
  for select using (is_camp_admin(camp_id));
drop policy if exists compliance_trainings_write on compliance_trainings;
create policy compliance_trainings_write on compliance_trainings
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

drop policy if exists compliance_insurance_select on compliance_insurance;
create policy compliance_insurance_select on compliance_insurance
  for select using (is_camp_member(camp_id));
drop policy if exists compliance_insurance_write on compliance_insurance;
create policy compliance_insurance_write on compliance_insurance
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

-- ── 6. Columns on what already exists ────────────────────────────────────────

-- Provenance. No claim ships without a source a camp can open and a date we last read it.
alter table compliance_requirements
  add column if not exists source_checked_on date,
  add column if not exists source_id uuid references compliance_sources(id) on delete set null;

alter table compliance_authority_forms
  add column if not exists url_stable boolean not null default true,
  add column if not exists source_checked_on date,
  -- An incident form is not part of the permit packet: it is filed in season, on a clock.
  add column if not exists is_incident_form boolean not null default false;

-- The copy an inspector asks for. "Copies of all required certifications must be maintained on
-- file at the camp" — we held the index and not the card.
alter table staff_certifications
  add column if not exists document_id uuid references compliance_documents(id) on delete set null,
  add column if not exists verified_on date,
  add column if not exists verified_by text;

-- Working papers, and the dates the per-hire clocks run from.
alter table safety_staff
  add column if not exists hired_on date,
  add column if not exists first_day_on date,
  add column if not exists is_volunteer boolean not null default false;

-- The two notions of staff were unlinked: camp_members is login accounts, safety_staff is the
-- compliance roster, and nothing joined them. Anything that wants "who did this" needs the join.
alter table camp_members
  add column if not exists safety_staff_id uuid references safety_staff(id) on delete set null;

-- The permit register. safety_licenses already had the right shape and was simply not wired to
-- compliance; extending it beats a second table that would drift from it.
alter table safety_licenses
  add column if not exists authority_id uuid references compliance_authorities(id) on delete set null,
  add column if not exists requirement_code text,
  add column if not exists posted_location text,
  add column if not exists renewal_due_on date,
  add column if not exists fee_cents integer,
  add column if not exists fee_paid_on date;

comment on column safety_licenses.renewal_due_on is
  'Westchester wants a renewal application 60 days before the permit EXPIRES — a different clock '
  'from 7-2.4''s 60 days before you open.';

-- The new personal columns on safety_staff follow the existing revoke-and-RPC pattern rather than
-- widening what `authenticated` can read.
revoke select on public.safety_staff from authenticated;
revoke select on public.safety_staff from anon;
grant select (id, camp_id, name, title, is_active, is_volunteer, hired_on, first_day_on,
              created_at, updated_at)
  on public.safety_staff to authenticated;
