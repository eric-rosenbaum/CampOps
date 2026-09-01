-- Somewhere to keep the camp's answers to the state's safety plan template.
--
-- The plan builder used to write against DOH-2040, which is the reviewer's checklist -- the thing
-- a sanitarian ticks off while reading a plan. The document a camp actually fills in is the
-- Children's Camp Safety Plan template: ninety-two numbered questions in six sections, mostly
-- checkboxes, with real skip logic. Asking a camp to compose prose under ninety-six checklist
-- headings, and then hand-label a table of contents, was asking for the wrong document.
--
-- The question catalog itself lives in src/lib/compliance/planTemplate.ts (see the next
-- migration, which drops the table this one creates). What belongs in Postgres is the answers.
--
-- The eleven activity addenda are separate state documents, each required only when the camp runs
-- that activity, gated on the same setup answers everything else uses.

create table if not exists compliance_plan_questions (
  question_key   text primary key,
  number         integer not null unique,
  category       text not null,
  prompt         text not null,
  answer_kind    text not null check (answer_kind in
                   ('yes_no','select','multi_select','long_text','table','attest')),
  choices        jsonb not null default '[]'::jsonb,
  columns        jsonb not null default '[]'::jsonb,
  depends_on     text references compliance_plan_questions(question_key),
  free_text      boolean not null default false,
  sort_order     integer not null default 0
);

create table if not exists camp_plan_answers (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid not null references camps(id) on delete cascade,
  season_id    uuid references seasons(id) on delete cascade,
  question_key text not null,
  value        jsonb not null default 'null'::jsonb,
  updated_by   text,
  updated_at   timestamptz not null default now(),
  unique (camp_id, season_id, question_key)
);
create index if not exists camp_plan_answers_camp_idx on camp_plan_answers (camp_id, season_id);

create table if not exists compliance_plan_addenda (
  code           text primary key,
  title          text not null,
  applies_when   jsonb not null default '{}'::jsonb,
  source_url     text,
  archived_path  text,
  sort_order     integer not null default 0
);

alter table camp_plan_answers enable row level security;
drop policy if exists camp_plan_answers_rw on camp_plan_answers;
create policy camp_plan_answers_rw on camp_plan_answers
  for all using (is_camp_member(camp_id)) with check (is_camp_member(camp_id));

alter table compliance_plan_questions enable row level security;
drop policy if exists compliance_plan_questions_read on compliance_plan_questions;
create policy compliance_plan_questions_read on compliance_plan_questions
  for select to authenticated using (true);

alter table compliance_plan_addenda enable row level security;
drop policy if exists compliance_plan_addenda_read on compliance_plan_addenda;
create policy compliance_plan_addenda_read on compliance_plan_addenda
  for select to authenticated using (true);
