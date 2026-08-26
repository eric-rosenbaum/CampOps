-- The portal quoted the booking estimate, not the number the group confirmed.
--
-- `headcount` is what they guessed when they enquired; `final_headcount` is what their
-- coordinator confirmed through the portal. Once confirmed, that is the real number. A group
-- that grew from 50 to 55 was shown "55 confirmed" on the same page as a balance calculated
-- on 50, which is the worst version of the bug: the contradiction is visible to the customer.
--
-- The ops side reads through billableHeadcount() in components/retreats/retreatUi.tsx for the
-- same reason.
do $do$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_portal_data';

  if position('r.rate_per_person_night,0) * r.headcount * v_nights' in src) = 0 then
    raise exception 'per-person estimate not found in get_portal_data';
  end if;

  src := replace(src,
    'COALESCE(r.rate_per_person_night,0) * r.headcount * v_nights',
    'COALESCE(r.rate_per_person_night,0) * COALESCE(r.final_headcount, r.headcount) * v_nights');

  execute src;
end $do$;
