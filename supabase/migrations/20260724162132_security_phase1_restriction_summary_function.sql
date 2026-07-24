-- SECURITY PHASE 1 — resolve the advisor's one ERROR (security_definer_view).
-- camper_restriction_summary was a SECURITY DEFINER view whose only tenant guard was an
-- inline is_camp_member() the linter can't see. Replace it with an explicit SECURITY DEFINER
-- function so the tenant check is visible and testable. We keep definer semantics on purpose:
-- the feature requires kitchen staff WITHOUT camper-health access to still see de-identified
-- allergy COUNTS (not names), so flipping to security_invoker would break it. The function
-- returns only aggregates and is scoped to camp members of the requested camp.

create or replace function public.get_restriction_summary(p_camp_id uuid)
returns table (
  camp_id uuid, session_id uuid, restriction text, kind text,
  camper_count int, anaphylactic_count int
)
language sql security definer set search_path = public stable as $$
  select r.camp_id, cs.session_id, r.restriction, r.kind,
         count(*)::int as camper_count,
         count(*) filter (where r.severity = 'anaphylactic')::int as anaphylactic_count
  from public.camper_restrictions r
  left join public.camper_sessions cs on cs.camper_id = r.camper_id
  where r.camp_id = p_camp_id
    and is_camp_member(p_camp_id)   -- load-bearing tenant guard; do not remove
  group by r.camp_id, cs.session_id, r.restriction, r.kind;
$$;

revoke execute on function public.get_restriction_summary(uuid) from public, anon;
grant  execute on function public.get_restriction_summary(uuid) to authenticated;

drop view if exists public.camper_restriction_summary;
