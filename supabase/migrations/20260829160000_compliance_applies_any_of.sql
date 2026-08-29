-- Applicability needs OR.
--
-- Six New York aquatics duties apply to a pool OR a beach. Expressed as {"has_pool":"true"}
-- they silently do not fire for a lakefront-only camp — the camp is shown a clean bill for
-- rules it is actually subject to, which is worse than showing nothing. `any_of` fixes it:
--
--   {"any_of": {"has_pool":"true", "has_waterfront":"true"}}   -- either is enough
--   {"camp_type":"overnight", "any_of": {...}}                 -- combines with normal keys
--
-- Top-level keys keep AND semantics; `any_of` is a reserved key whose members are OR'd.
create or replace function public.compliance_applies(p_answers jsonb, p_applies_when jsonb)
returns boolean
language plpgsql immutable
as $$
declare k text; want text; got text; v_any jsonb; v_hit boolean;
begin
  if p_applies_when is null or p_applies_when = '{}'::jsonb then return true; end if;

  for k in select jsonb_object_keys(p_applies_when) loop
    if k = 'any_of' then continue; end if;   -- handled below
    want := lower(trim(both '"' from (p_applies_when -> k)::text));
    got  := lower(coalesce(p_answers ->> k, ''));
    -- Unanswered means we cannot claim it applies. Fail closed on the requirement; the setup
    -- interview is what resolves this, not a guess.
    if got = '' then return false; end if;
    if want <> got then return false; end if;
  end loop;

  if p_applies_when ? 'any_of' then
    v_any := p_applies_when -> 'any_of';
    v_hit := false;
    for k in select jsonb_object_keys(v_any) loop
      want := lower(trim(both '"' from (v_any -> k)::text));
      got  := lower(coalesce(p_answers ->> k, ''));
      if got <> '' and got = want then v_hit := true; end if;
    end loop;
    if not v_hit then return false; end if;
  end if;

  return true;
end $$;

comment on function public.compliance_applies is
  'True when every top-level key matches (AND) and at least one any_of member matches (OR). Unanswered keys never satisfy.';
