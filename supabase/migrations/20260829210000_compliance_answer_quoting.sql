-- Compare answers with the quotes stripped from both sides.
--
-- `camp_compliance_answers.value` is text, and setup_camp_compliance() strips the JSON quotes
-- before storing, so the normal path is clean. But `applies_when` on the requirement side is
-- jsonb and its values arrive quoted, which is why the WANT side was already being trimmed.
-- Trimming only one side means a value that reaches the table still quoted -- from a direct
-- insert, a data migration, an import -- silently stops matching, and the requirement quietly
-- reads as "does not apply to your camp". That is the failure mode this module cannot have, so
-- the comparison is now symmetric. No legitimate answer value is wrapped in quotes, so nothing
-- correct is changed by this.

create or replace function public.compliance_applicability(p_answers jsonb, p_applies_when jsonb)
returns text
language plpgsql immutable
as $$
declare
  k text; want text; got text;
  v_any_of jsonb;
  v_hit         boolean := false;  -- some any_of member is a definite match
  v_unknown_or  boolean := false;  -- some any_of member is unanswered
  v_unknown_and boolean := false;  -- some top-level (AND'd) key is unanswered
begin
  if p_applies_when is null or p_applies_when = '{}'::jsonb then return 'yes'; end if;

  -- Top-level keys are AND'd. One definite mismatch settles it; an unanswered one leaves the
  -- answer open rather than resolving it against the camp.
  for k in select key from jsonb_object_keys(p_applies_when) as t(key) where t.key <> 'any_of' loop
    want := lower(trim(both '"' from (p_applies_when -> k)::text));
    got  := lower(trim(both '"' from coalesce(p_answers ->> k, '')));
    if got = '' then v_unknown_and := true;
    elsif want <> got then return 'no';
    end if;
  end loop;

  -- The reserved `any_of` key is OR'd: a camp with either a pool or a waterfront gets the
  -- aquatics rules. One definite hit settles the group even if a sibling is unanswered --
  -- knowing they have a pool is enough, whether or not we know about the lake.
  v_any_of := p_applies_when -> 'any_of';
  if v_any_of is not null and v_any_of <> '{}'::jsonb then
    for k in select key from jsonb_object_keys(v_any_of) as t(key) loop
      want := lower(trim(both '"' from (v_any_of -> k)::text));
      got  := lower(trim(both '"' from coalesce(p_answers ->> k, '')));
      if got = '' then v_unknown_or := true;
      elsif want = got then v_hit := true;
      end if;
    end loop;
    if not v_hit then
      if v_unknown_or then return 'unknown'; end if;
      return 'no';
    end if;
  end if;

  if v_unknown_and then return 'unknown'; end if;
  return 'yes';
end $$;

comment on function public.compliance_applicability is
  'yes / no / unknown. Unknown means a deciding question has not been answered, which is not the same as the requirement not applying.';

-- Repair any answers already stored with their JSON quotes intact.
update camp_compliance_answers set value = trim(both '"' from value) where value like '"%"';
