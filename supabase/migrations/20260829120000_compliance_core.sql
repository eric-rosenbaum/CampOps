-- Compliance & Evidence — core schema.
--
-- The module answers one question for a camp: "what does my jurisdiction require of me, and
-- where do I stand on each of it." Requirements are DATA, not code — a jurisdiction is a set of
-- rows, so adding a county or a state is a seed, never a migration.
--
-- Two decisions worth stating, because both differ from the original spec:
--
-- 1. Status is computed in Postgres, not in the browser. The client loads thirteen stores
--    asynchronously and partially; a completeness score derived from whatever happened to be
--    hydrated is a number nobody should file a permit on. `compute_camp_compliance()` reads the
--    evidence tables directly and writes camp_requirement_status.
--
-- 2. There is no polymorphic evidence table. The spec proposed (evidence_table, evidence_id)
--    with no foreign key, which rots silently: delete a drill and the link dangles while the
--    score still counts it. Instead, automatic evidence is READ LIVE by the engine from the
--    real tables (nothing to dangle), and the only stored links are documents, which have a
--    real FK.

-- ─── Jurisdiction profiles ───────────────────────────────────────────────────
create table if not exists compliance_profiles (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,          -- 'NY-STATE', 'NY-WESTCHESTER'
  name               text not null,
  jurisdiction_level text not null check (jurisdiction_level in
                       ('state','county','city','accreditor','insurer','grant')),
  jurisdiction_code  text,                          -- 'NY', 'NY-WESTCHESTER'
  reader             text not null check (reader in ('lhd','aca','insurer','grant','internal')),
  description        text,
  source_url         text,
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);
comment on table compliance_profiles is
  'A jurisdiction or external reader expressed as a set of requirements. Shared reference data curated by us, not camp data.';

-- ─── Requirements ────────────────────────────────────────────────────────────
create table if not exists compliance_requirements (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references compliance_profiles(id) on delete cascade,
  req_code      text not null,
  label         text not null,
  summary       text,
  category      text not null,
  -- How the engine decides whether this is satisfied. See compute_camp_compliance().
  evidence_type text not null check (evidence_type in (
                  'document','certification','screening','training','inspection','drill',
                  'temp_log','pool_log','water_sample','asset_expiry','plan_section',
                  'attestation','roster','manual')),
  evidence_rule jsonb not null default '{}'::jsonb,
  evidence_hint text,
  frequency     text check (frequency in
                  ('once','annual','seasonal','monthly','weekly','daily','per_session','ongoing','on_event')),
  -- {"type":"relative_to_opening","days":-60} | {"type":"fixed","month":5,"day":1}
  deadline_rule jsonb,
  -- {} = always applies. Otherwise every key must match the camp's answers.
  applies_when  jsonb not null default '{}'::jsonb,
  citation      text,
  citation_url  text,
  -- The product never presents unverified regulatory text as fact.
  verify_status text not null default 'needs_verification'
                  check (verify_status in ('verified','needs_verification')),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (profile_id, req_code)
);
create index if not exists idx_requirements_profile on compliance_requirements(profile_id, sort_order);

-- ─── What a camp answered, and which profiles that turns on ──────────────────
create table if not exists camp_compliance_answers (
  camp_id     uuid not null references camps(id) on delete cascade,
  season_id   uuid not null references seasons(id) on delete cascade,
  key         text not null,
  value       text not null,
  answered_by text,
  answered_at timestamptz not null default now(),
  primary key (camp_id, season_id, key)
);
comment on table camp_compliance_answers is
  'The applicability interview. Keys match compliance_requirements.applies_when, e.g. camp_type=overnight, has_pool=true.';

create table if not exists camp_compliance_profiles (
  camp_id    uuid not null references camps(id) on delete cascade,
  season_id  uuid not null references seasons(id) on delete cascade,
  profile_id uuid not null references compliance_profiles(id) on delete cascade,
  enabled_by text,
  enabled_at timestamptz not null default now(),
  primary key (camp_id, season_id, profile_id)
);

-- ─── Computed status, one row per applicable requirement ─────────────────────
create table if not exists camp_requirement_status (
  camp_id        uuid not null references camps(id) on delete cascade,
  season_id      uuid not null references seasons(id) on delete cascade,
  requirement_id uuid not null references compliance_requirements(id) on delete cascade,
  status         text not null check (status in
                   ('satisfied','partial','expiring','missing','not_applicable')),
  -- What the evaluator actually found: counts, names, dates. Drives the "why" in the UI so a
  -- camp is never told 'missing' without being told missing what.
  detail         jsonb not null default '{}'::jsonb,
  due_on         date,
  assigned_to    text,
  -- A camp may declare a requirement not applicable; the reason is required and logged.
  na_reason      text,
  na_by          text,
  na_at          timestamptz,
  computed_at    timestamptz not null default now(),
  primary key (camp_id, season_id, requirement_id)
);
create index if not exists idx_req_status_camp on camp_requirement_status(camp_id, season_id, status);

-- ─── Documents ───────────────────────────────────────────────────────────────
create table if not exists compliance_documents (
  id            uuid primary key default gen_random_uuid(),
  camp_id       uuid not null references camps(id) on delete cascade,
  season_id     uuid references seasons(id) on delete set null,
  title         text not null,
  doc_type      text,
  bucket_path   text not null,
  mime          text,
  size_bytes    bigint,
  expires_on    date,
  superseded_by uuid references compliance_documents(id) on delete set null,
  uploaded_by   text,
  uploader_name text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_compliance_docs_camp on compliance_documents(camp_id, season_id);
create index if not exists idx_compliance_docs_expiry on compliance_documents(camp_id, expires_on)
  where expires_on is not null;

-- One document can satisfy several requirements; a real FK either way, so nothing dangles.
create table if not exists requirement_documents (
  camp_id        uuid not null references camps(id) on delete cascade,
  requirement_id uuid not null references compliance_requirements(id) on delete cascade,
  document_id    uuid not null references compliance_documents(id) on delete cascade,
  season_id      uuid not null references seasons(id) on delete cascade,
  linked_by      text,
  linked_at      timestamptz not null default now(),
  primary key (requirement_id, document_id, season_id)
);

-- ─── The written safety plan, section by section ─────────────────────────────
-- Structure comes from DOH-2040, the state's own Written Plan Checklist, so the section list
-- is not our invention and does not vary by county.
create table if not exists compliance_plan_sections (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid not null references camps(id) on delete cascade,
  season_id    uuid not null references seasons(id) on delete cascade,
  section_code text not null,
  category     text not null,
  title        text not null,
  body         text,
  -- DOH-2040 asks the camp to state which page of its plan covers each component.
  page_ref     text,
  status       text not null default 'not_started'
                 check (status in ('not_started','drafted','complete','not_applicable')),
  na_reason    text,
  sort_order   integer not null default 0,
  updated_by   text,
  updated_at   timestamptz not null default now(),
  unique (camp_id, season_id, section_code)
);
create index if not exists idx_plan_sections_camp on compliance_plan_sections(camp_id, season_id, sort_order);

-- ─── Export log ──────────────────────────────────────────────────────────────
-- Generated packages are DERIVED artifacts and expire on a fixed clock; the source records
-- follow the camp. A generated LHD package contains staff names and screening results, so it
-- must not sit in a bucket forever.
create table if not exists compliance_exports (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid not null references camps(id) on delete cascade,
  season_id    uuid references seasons(id) on delete set null,
  package_code text not null,
  reader       text,
  bucket_path  text,
  generated_by text,
  generated_at timestamptz not null default now(),
  purge_after  date not null default (current_date + interval '90 days')
);
create index if not exists idx_compliance_exports_purge on compliance_exports(purge_after);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Shared reference data (profiles, requirements) is readable by any signed-in user and written
-- only by us. Everything camp-scoped follows the platform's existing helpers.
alter table compliance_profiles       enable row level security;
alter table compliance_requirements   enable row level security;
alter table camp_compliance_answers   enable row level security;
alter table camp_compliance_profiles  enable row level security;
alter table camp_requirement_status   enable row level security;
alter table compliance_documents      enable row level security;
alter table requirement_documents     enable row level security;
alter table compliance_plan_sections  enable row level security;
alter table compliance_exports        enable row level security;

drop policy if exists compliance_profiles_read on compliance_profiles;
create policy compliance_profiles_read on compliance_profiles
  for select to authenticated using (true);
drop policy if exists compliance_profiles_admin on compliance_profiles;
create policy compliance_profiles_admin on compliance_profiles
  for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists compliance_requirements_read on compliance_requirements;
create policy compliance_requirements_read on compliance_requirements
  for select to authenticated using (true);
drop policy if exists compliance_requirements_admin on compliance_requirements;
create policy compliance_requirements_admin on compliance_requirements
  for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists camp_answers_select on camp_compliance_answers;
create policy camp_answers_select on camp_compliance_answers
  for select using (is_camp_member(camp_id));
drop policy if exists camp_answers_write on camp_compliance_answers;
create policy camp_answers_write on camp_compliance_answers
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

drop policy if exists camp_profiles_select on camp_compliance_profiles;
create policy camp_profiles_select on camp_compliance_profiles
  for select using (is_camp_member(camp_id));
drop policy if exists camp_profiles_write on camp_compliance_profiles;
create policy camp_profiles_write on camp_compliance_profiles
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

drop policy if exists req_status_select on camp_requirement_status;
create policy req_status_select on camp_requirement_status
  for select using (is_camp_member(camp_id));
drop policy if exists req_status_write on camp_requirement_status;
create policy req_status_write on camp_requirement_status
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

drop policy if exists compliance_docs_select on compliance_documents;
create policy compliance_docs_select on compliance_documents
  for select using (is_camp_member(camp_id));
drop policy if exists compliance_docs_write on compliance_documents;
create policy compliance_docs_write on compliance_documents
  for all using (get_camp_role(camp_id) = any (array['admin','staff']))
  with check (get_camp_role(camp_id) = any (array['admin','staff']));

drop policy if exists req_docs_select on requirement_documents;
create policy req_docs_select on requirement_documents
  for select using (is_camp_member(camp_id));
drop policy if exists req_docs_write on requirement_documents;
create policy req_docs_write on requirement_documents
  for all using (get_camp_role(camp_id) = any (array['admin','staff']))
  with check (get_camp_role(camp_id) = any (array['admin','staff']));

drop policy if exists plan_sections_select on compliance_plan_sections;
create policy plan_sections_select on compliance_plan_sections
  for select using (is_camp_member(camp_id));
drop policy if exists plan_sections_write on compliance_plan_sections;
create policy plan_sections_write on compliance_plan_sections
  for all using (get_camp_role(camp_id) = any (array['admin','staff']))
  with check (get_camp_role(camp_id) = any (array['admin','staff']));

drop policy if exists compliance_exports_select on compliance_exports;
create policy compliance_exports_select on compliance_exports
  for select using (is_camp_member(camp_id));
drop policy if exists compliance_exports_write on compliance_exports;
create policy compliance_exports_write on compliance_exports
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

-- ─── Storage ─────────────────────────────────────────────────────────────────
-- Two buckets with opposite intents: the camp's own evidence is private; the blank official
-- state forms are public reference material the browser fetches to draw onto.
insert into storage.buckets (id, name, public, file_size_limit)
values ('compliance-files', 'compliance-files', false, 26214400),
       ('compliance-forms', 'compliance-forms', true,  26214400)
on conflict (id) do nothing;

do $$ begin
  create policy "compliance_files_member_read" on storage.objects
    for select using (bucket_id = 'compliance-files'
      and is_camp_member((storage.foldername(name))[1]::uuid));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "compliance_files_staff_write" on storage.objects
    for insert to authenticated with check (bucket_id = 'compliance-files'
      and get_camp_role((storage.foldername(name))[1]::uuid) = any (array['admin','staff']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "compliance_files_staff_update" on storage.objects
    for update using (bucket_id = 'compliance-files'
      and get_camp_role((storage.foldername(name))[1]::uuid) = any (array['admin','staff']))
    with check (bucket_id = 'compliance-files'
      and get_camp_role((storage.foldername(name))[1]::uuid) = any (array['admin','staff']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "compliance_files_admin_delete" on storage.objects
    for delete using (bucket_id = 'compliance-files'
      and is_camp_admin((storage.foldername(name))[1]::uuid));
exception when duplicate_object then null; end $$;

-- Blank official forms: readable by anyone (they are public government documents and the
-- overlay renderer fetches them in the browser), writable only by us.
do $$ begin
  create policy "compliance_forms_public_read" on storage.objects
    for select using (bucket_id = 'compliance-forms');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "compliance_forms_admin_write" on storage.objects
    for all using (bucket_id = 'compliance-forms' and is_platform_admin())
    with check (bucket_id = 'compliance-forms' and is_platform_admin());
exception when duplicate_object then null; end $$;
