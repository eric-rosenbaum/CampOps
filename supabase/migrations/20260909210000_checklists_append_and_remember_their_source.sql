-- Two things made checklists feel broken.
--
-- apply_checklist_template refused, silently returning 0, if the work order had ANY steps on it.
-- So a job with one hand-typed step could never take a checklist again, and nothing said why --
-- the steps simply did not appear. It now appends, and refuses only a template that has already
-- been applied to that work order, which is the case the guard was actually for.
--
-- And nothing recorded where a step came from, so a work order could not say "these seven are
-- Cabin closing". The column does that.

alter table issue_checklist_items
  add column if not exists template_id uuid references work_checklist_templates(id) on delete set null;

create index if not exists issue_checklist_items_template_idx
  on issue_checklist_items(issue_id, template_id);

create or replace function apply_checklist_template(p_issue_id uuid, p_template_id uuid)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_camp uuid; v_items jsonb; v_n int := 0; v_next int;
begin
  select camp_id into v_camp from issues where id = p_issue_id;
  if v_camp is null then raise exception 'No such work order.'; end if;
  if not is_camp_member(v_camp) then raise exception 'Forbidden'; end if;

  -- The same checklist twice would duplicate every step. Anything else appends.
  if exists (select 1 from issue_checklist_items
             where issue_id = p_issue_id and template_id = p_template_id) then
    return 0;
  end if;

  select items into v_items from work_checklist_templates
   where id = p_template_id and camp_id = v_camp;
  if v_items is null then raise exception 'No such checklist for this camp.'; end if;

  select coalesce(max(position) + 1, 0) into v_next
    from issue_checklist_items where issue_id = p_issue_id;

  insert into issue_checklist_items
    (camp_id, issue_id, position, text, note, requires_photo, template_id)
  select v_camp, p_issue_id, v_next + (ord - 1)::int,
         it->>'text', nullif(it->>'note',''),
         coalesce((it->>'requires_photo')::boolean, false), p_template_id
  from jsonb_array_elements(v_items) with ordinality as t(it, ord)
  where coalesce(it->>'text','') <> '';

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;
