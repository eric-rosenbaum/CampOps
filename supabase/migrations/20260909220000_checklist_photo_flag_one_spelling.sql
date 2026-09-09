-- The template editor wrote the step flag as `requiresPhoto` into jsonb, while
-- apply_checklist_template reads `requires_photo`. So a camp could tick "asks for a photo",
-- watch the template save it, and get work orders whose steps asked for nothing -- silently,
-- and only for templates the camp had edited. Seeded ones were written in SQL and were fine.
--
-- The client now writes requires_photo. This rewrites what the old client stored, and makes the
-- RPC read either spelling so a browser still running the old bundle does not reintroduce it.

update work_checklist_templates t
set items = (
  select jsonb_agg(
    case when (e ? 'requiresPhoto')
      then (e - 'requiresPhoto') || jsonb_build_object('requires_photo', (e->>'requiresPhoto')::boolean)
      else e
    end
    order by ord)
  from jsonb_array_elements(t.items) with ordinality as x(e, ord)
)
where exists (
  select 1 from jsonb_array_elements(t.items) e where e ? 'requiresPhoto'
);

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
         coalesce((it->>'requires_photo')::boolean, (it->>'requiresPhoto')::boolean, false),
         p_template_id
  from jsonb_array_elements(v_items) with ordinality as t(it, ord)
  where coalesce(it->>'text','') <> '';

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;
