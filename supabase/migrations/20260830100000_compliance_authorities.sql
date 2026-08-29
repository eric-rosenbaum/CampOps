-- Who reviews this camp, and what each of them wants.
--
-- Until now the module was organised the way the regulation is organised: by rule. That answers
-- "what does the law say" but not the question a camp director actually asks in April, which is
-- "who is going to turn up, when, and what will they want from me."
--
-- Those are different groupings of the same 91 requirements, so nothing about the engine, the
-- evidence rules or applicability changes here. This adds the missing dimension.
--
-- A note on the word "inspection": most of these parties never set foot on the property. The
-- county health department inspects; the fire department receives a plan; the State Central
-- Register receives clearance requests. Modelling them all as inspectors would misrepresent
-- five of the six, so `visits_site` is a real field and the UI reads it.

create table if not exists compliance_authorities (
  id                uuid primary key default gen_random_uuid(),
  -- Scoped to the package that introduced it, so adding a county adds its authorities with it.
  profile_id        uuid not null references compliance_profiles(id) on delete cascade,
  code              text not null,                    -- 'WESTCHESTER-DOH', 'FIRE-DEPT'
  name              text not null,
  short_name        text,                             -- what fits on a card: 'County Health'
  level             text not null check (level in
                      ('federal','state','county','municipal','accreditor','insurer','internal')),
  -- Does anyone from here come to the camp? Drives whether we talk about visits or filings.
  visits_site       boolean not null default false,
  /**
   * What this party does and when, as prose a camp director can act on. Free text rather than a
   * schedule the engine computes, because "before opening and at least once during operation"
   * is what the regulation actually says and inventing a date from it would be a fabrication.
   */
  visit_schedule    text,
  -- What they are looking at, in one sentence.
  scope             text,
  -- How a camp reaches them. Left null rather than guessed; the UI says "not on file".
  contact_note      text,
  source_url        text,
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (profile_id, code)
);

-- The official documents a party issues or expects, whether or not we hold a copy.
--
-- `bundled_path` is a file under public/forms/ny that ships with the app. When it is null the
-- form is real but we do not have it, and the UI says where to get it instead of pretending the
-- list is complete. That distinction is the whole point of the table.
create table if not exists compliance_authority_forms (
  id             uuid primary key default gen_random_uuid(),
  authority_id   uuid not null references compliance_authorities(id) on delete cascade,
  designation    text,                                -- 'DOH-367', 'LDSS-3370', null if unnamed
  title          text not null,
  revision       text,                                -- '(1/12)' as printed on the form
  bundled_path   text,                                -- '/forms/ny/doh-367.pdf', or null
  source_url     text,
  -- Where to get it when we do not bundle it. Null when bundled_path is set.
  obtain_note    text,
  -- Can the platform fill this one from camp data, or is it hand-and-pen only?
  fillable       boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists compliance_authority_forms_authority_idx
  on compliance_authority_forms (authority_id);

-- Which party receives or checks each requirement. Nullable: a requirement with no authority
-- yet still works exactly as before and simply does not appear under a party heading.
alter table compliance_requirements
  add column if not exists authority_id uuid references compliance_authorities(id) on delete set null;

create index if not exists compliance_requirements_authority_idx
  on compliance_requirements (authority_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Both tables are the shared regulatory catalog, not camp data: the same rows are true for
-- every camp in the jurisdiction. Readable by any signed-in user, writable by nobody through
-- the API. They change by migration.
alter table compliance_authorities       enable row level security;
alter table compliance_authority_forms   enable row level security;

drop policy if exists compliance_authorities_read on compliance_authorities;
create policy compliance_authorities_read on compliance_authorities
  for select to authenticated using (true);

drop policy if exists compliance_authority_forms_read on compliance_authority_forms;
create policy compliance_authority_forms_read on compliance_authority_forms
  for select to authenticated using (true);

comment on table compliance_authorities is
  'Who reviews a camp in a given jurisdiction. Shared catalog, not camp data.';
comment on column compliance_authorities.visits_site is
  'True only for parties that physically attend. Most receive filings and never visit.';
comment on column compliance_authority_forms.bundled_path is
  'Path to a blank official PDF shipped with the app, or null when we do not hold the form.';
