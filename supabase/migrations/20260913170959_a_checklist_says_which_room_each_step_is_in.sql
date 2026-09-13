-- A work order for the Barn said "Program space reset" and listed six steps, and nothing on it
-- mentioned that the Barn is a main room AND a bathroom. The rooms were in the location tree the
-- whole time; the program-space path never read them. A crew could tick the list complete having
-- set up half the building.
--
-- Steps now carry the room they are in, as a heading rather than a prefix. "Bathhouse · Scrub
-- the showers" repeated down a list is how the building-turnover path did it, and on a seven-step
-- list across two rooms it says the room name fourteen times; a heading says it twice and reads
-- as what it is — two rooms, both of which have to be done.
alter table issue_checklist_items add column if not exists section text;

comment on column issue_checklist_items.section is
  'The room these steps are in, when the job covers a building with more than one. Null on a single-room job, where the checklist''s own name is the heading.';

/**
 * Build the checklist for a job covering one bookable space.
 *
 * One room -> the fallback checklist, flat, exactly as before.
 * More than one -> a section per room, each taking the room's own checklist if the camp gave it
 * one and the fallback otherwise, so a camp that has said "the Barn's bathroom gets the bathhouse
 * list" gets that, and a camp that has said nothing still gets a list per room rather than one
 * list for a building.
 */
create or replace function public.append_space_steps(
  p_issue_id uuid, p_location_id uuid, p_fallback_template_id uuid
) returns int language plpgsql security definer set search_path = public as $fn$
declare
  v_camp uuid; v_next int; v_n int := 0; v_rooms int;
  rm record; it jsonb; v_tmpl uuid;
begin
  select camp_id into v_camp from issues where id = p_issue_id;
  if v_camp is null then return 0; end if;

  select coalesce(max(position) + 1, 0) into v_next
    from issue_checklist_items where issue_id = p_issue_id;

  select count(*) into v_rooms from locations l
   where l.parent_id = p_location_id and l.is_active;

  -- A space with nothing inside it is one room, and its checklist keeps its own name as the
  -- heading. Sectioning a single room would add a heading that says what the title already says.
  if v_rooms = 0 then
    if p_fallback_template_id is null then return 0; end if;
    return public.apply_checklist_template(p_issue_id, p_fallback_template_id);
  end if;

  for rm in
    select l.id, l.name, l.checklist_template_id
    from locations l
    where l.parent_id = p_location_id and l.is_active
    order by l.sort_order, l.name
  loop
    v_tmpl := coalesce(rm.checklist_template_id, p_fallback_template_id);

    if v_tmpl is null then
      -- No list anywhere, but somebody still has to tick that this room got done.
      insert into issue_checklist_items (camp_id, issue_id, position, text, section, template_id)
      values (v_camp, p_issue_id, v_next + v_n, 'Set up ' || rm.name, rm.name, null);
      v_n := v_n + 1;
    else
      for it in
        select e from work_checklist_templates t, jsonb_array_elements(t.items) e
        where t.id = v_tmpl and t.camp_id = v_camp
      loop
        if coalesce(it->>'text','') <> '' then
          insert into issue_checklist_items
            (camp_id, issue_id, position, text, note, requires_photo, section, template_id)
          values (v_camp, p_issue_id, v_next + v_n, it->>'text', nullif(it->>'note',''),
                  coalesce((it->>'requires_photo')::boolean, (it->>'requiresPhoto')::boolean, false),
                  rm.name, v_tmpl);
          v_n := v_n + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_n;
end;
$fn$;

grant execute on function public.append_space_steps(uuid, uuid, uuid) to authenticated;

-- The building-turnover path gets the same treatment. It invented the room-prefix idea, and the
-- heading is simply the better version of it.
create or replace function public.append_room_steps(p_issue_id uuid, p_location_id uuid)
returns int language plpgsql security definer set search_path = public as $fn$
declare v_camp uuid; v_next int; v_n int := 0; rm record; it jsonb;
begin
  select camp_id into v_camp from issues where id = p_issue_id;
  if v_camp is null then return 0; end if;

  select coalesce(max(position) + 1, 0) into v_next
    from issue_checklist_items where issue_id = p_issue_id;

  for rm in
    select l.id, l.name, l.checklist_template_id
    from locations l
    where l.parent_id = p_location_id and l.is_active
    order by l.sort_order, l.name
  loop
    if rm.checklist_template_id is not null then
      for it in
        select e from work_checklist_templates t, jsonb_array_elements(t.items) e
        where t.id = rm.checklist_template_id
      loop
        if coalesce(it->>'text','') <> '' then
          insert into issue_checklist_items
            (camp_id, issue_id, position, text, note, requires_photo, section, template_id)
          values (v_camp, p_issue_id, v_next + v_n, it->>'text', nullif(it->>'note',''),
                  coalesce((it->>'requires_photo')::boolean, (it->>'requiresPhoto')::boolean, false),
                  rm.name, rm.checklist_template_id);
          v_n := v_n + 1;
        end if;
      end loop;
    else
      insert into issue_checklist_items (camp_id, issue_id, position, text, section)
      values (v_camp, p_issue_id, v_next + v_n, 'Turn over ' || rm.name, rm.name);
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end;
$fn$;

-- apply_checklist_template stamps the template it came from, so the panel can head a flat list
-- with the checklist's own name. It was already doing this for the column; being explicit here
-- keeps the two paths writing the same shape.
create or replace function public.apply_checklist_template(p_issue_id uuid, p_template_id uuid)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_camp uuid; v_items jsonb; v_n int := 0; v_next int;
begin
  select camp_id into v_camp from issues where id = p_issue_id;
  if v_camp is null then raise exception 'No such work order.'; end if;
  if not is_camp_member(v_camp) then raise exception 'Forbidden'; end if;

  select items into v_items from work_checklist_templates
   where id = p_template_id and camp_id = v_camp;
  if v_items is null then raise exception 'No such checklist for this camp.'; end if;

  -- Applying the same checklist twice would duplicate every step. Other checklists are welcome:
  -- the panel offers the ones not yet on the job, and refusing them all because the job already
  -- had one is what stopped a camp adding a second list to a job that needed it.
  if exists (select 1 from issue_checklist_items
             where issue_id = p_issue_id and template_id = p_template_id) then
    return 0;
  end if;

  select coalesce(max(position) + 1, 0) into v_next
    from issue_checklist_items where issue_id = p_issue_id;

  insert into issue_checklist_items
    (camp_id, issue_id, position, text, note, requires_photo, template_id)
  select v_camp, p_issue_id, v_next + (ord - 1)::int,
         it->>'text', nullif(it->>'note',''), coalesce((it->>'requires_photo')::boolean, false),
         p_template_id
  from jsonb_array_elements(v_items) with ordinality as t(it, ord)
  where coalesce(it->>'text','') <> '';

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;
