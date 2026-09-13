-- Three functions decided which checklist to attach by matching a NAME: 'Program space reset'
-- for a meeting space, 'Cabin turnover' for a departure. The camp never chose those, could not
-- see the choice, and renaming its own checklist silently switched the automation off. Steps
-- appeared on work orders and the answer to "where did this come from" was a string literal
-- inside a database function.
--
-- The camp picks, per job, from its own checklists. Nothing is matched by name again.
--
-- The six checklists those names referred to were a ONE-TIME backfill into the camps that
-- existed in Sep 2026 (20260903014805). There is no trigger, so no camp created since has ever
-- received them, and none will. They are ordinary rows now: the camps that have them can edit or
-- delete them like anything else they wrote.
create table if not exists camp_work_defaults (
  camp_id     uuid not null references camps(id) on delete cascade,
  -- What the automation is doing, not what the checklist is called.
  purpose     text not null check (purpose in ('space_setup','space_reset','room_turnover')),
  template_id uuid references work_checklist_templates(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (camp_id, purpose)
);

comment on table camp_work_defaults is
  'Which of the camp''s own checklists each automatic work order starts from. No row, or a null template, means no steps are added -- which is a legitimate answer, not a misconfiguration.';

alter table camp_work_defaults enable row level security;
drop policy if exists camp_work_defaults_read on camp_work_defaults;
create policy camp_work_defaults_read on camp_work_defaults
  for select using (is_camp_member(camp_id));
drop policy if exists camp_work_defaults_write on camp_work_defaults;
create policy camp_work_defaults_write on camp_work_defaults
  for all using (is_camp_member(camp_id) and get_camp_role(camp_id) in ('admin','staff'))
  with check (is_camp_member(camp_id) and get_camp_role(camp_id) in ('admin','staff'));

alter table camp_work_defaults replica identity full;

-- Carry the old name-matching forward ONCE, so a camp that was relying on it keeps what it had --
-- but now as a choice it can see and change. A camp whose checklists were never named these
-- exact words gets no row, which is the truth: nothing was being attached.
insert into camp_work_defaults (camp_id, purpose, template_id)
select t.camp_id, p.purpose, t.id
from work_checklist_templates t
cross join (values ('space_setup'), ('space_reset')) as p(purpose)
where t.name = 'Program space reset' and t.is_active
on conflict (camp_id, purpose) do nothing;

insert into camp_work_defaults (camp_id, purpose, template_id)
select t.camp_id, 'room_turnover', t.id
from work_checklist_templates t
where t.name = 'Cabin turnover' and t.is_active
on conflict (camp_id, purpose) do nothing;

/** The camp's answer for one job, or null if it has not given one. */
create or replace function public.work_default(p_camp_id uuid, p_purpose text)
returns uuid language sql stable security definer set search_path = public as $fn$
  select d.template_id
  from camp_work_defaults d
  join work_checklist_templates t on t.id = d.template_id and t.is_active
  where d.camp_id = p_camp_id and d.purpose = p_purpose;
$fn$;

grant execute on function public.work_default(uuid, text) to authenticated;
