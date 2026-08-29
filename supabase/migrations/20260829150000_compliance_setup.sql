-- Provisioning: turn a camp's setup answers into a live compliance picture.
--
-- One call does the whole front door — record the answers, switch on the profiles the answers
-- imply, lay down the plan sections that apply, and compute where the camp stands. It is
-- re-runnable: answering the interview again re-derives everything without losing the camp's
-- own work (section bodies, page refs, and not-applicable decisions all survive).

create or replace function public.setup_camp_compliance(
  p_camp_id   uuid,
  p_season_id uuid,
  p_answers   jsonb,
  p_actor     text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  k            text;
  v_state      text;
  v_county     text;
  v_sections   integer := 0;
  v_profiles   integer := 0;
  v_computed   integer;
begin
  if not is_camp_admin(p_camp_id) then
    raise exception 'Only a camp administrator can set up compliance';
  end if;

  -- 1 · Record the answers. Re-running replaces an answer rather than duplicating it.
  for k in select jsonb_object_keys(p_answers) loop
    insert into camp_compliance_answers (camp_id, season_id, key, value, answered_by)
    values (p_camp_id, p_season_id, k,
            trim(both '"' from (p_answers -> k)::text), p_actor)
    on conflict (camp_id, season_id, key) do update
      set value = excluded.value, answered_by = excluded.answered_by, answered_at = now();
  end loop;

  v_state  := p_answers ->> 'state';
  v_county := p_answers ->> 'county';

  -- 2 · Switch on the profiles those answers imply. State first, then the county's additions.
  insert into camp_compliance_profiles (camp_id, season_id, profile_id, enabled_by)
  select p_camp_id, p_season_id, pr.id, p_actor
    from compliance_profiles pr
   where pr.is_active
     and (
       (pr.jurisdiction_level = 'state'  and pr.jurisdiction_code = v_state)
       or (pr.jurisdiction_level = 'county' and pr.jurisdiction_code = v_state || '-' || upper(coalesce(v_county,'')))
     )
  on conflict do nothing;
  get diagnostics v_profiles = row_count;

  -- 3 · Lay down the plan sections that apply to this camp.
  insert into compliance_plan_sections
    (camp_id, season_id, section_code, category, title, sort_order, updated_by)
  select p_camp_id, p_season_id, t.code, t.category, t.title, t.sort_order, p_actor
    from compliance_plan_templates t
   where compliance_applies(p_answers, t.applies_when)
  on conflict (camp_id, season_id, section_code) do update
    -- Refresh the label and ordering, never the camp's own writing.
    set category = excluded.category, title = excluded.title, sort_order = excluded.sort_order;
  get diagnostics v_sections = row_count;

  -- A section that no longer applies (the camp dropped archery) is retired rather than
  -- deleted, so the text they wrote is still there if they add the activity back.
  update compliance_plan_sections s
     set status = 'not_applicable',
         na_reason = 'Does not apply based on your camp setup'
    from compliance_plan_templates t
   where s.camp_id = p_camp_id and s.season_id = p_season_id
     and t.code = s.section_code
     and not compliance_applies(p_answers, t.applies_when)
     and s.status <> 'not_applicable';

  -- 4 · Compute where they stand.
  v_computed := compute_camp_compliance(p_camp_id, p_season_id);

  return jsonb_build_object(
    'profiles_enabled', v_profiles,
    'plan_sections',    v_sections,
    'requirements',     v_computed
  );
end $$;

comment on function public.setup_camp_compliance is
  'Front door: records setup answers, enables matching profiles, lays down applicable plan sections, computes status. Re-runnable.';

revoke execute on function public.setup_camp_compliance(uuid, uuid, jsonb, text) from public;
grant execute on function public.setup_camp_compliance(uuid, uuid, jsonb, text) to authenticated;
