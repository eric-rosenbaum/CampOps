-- The deposit chase has to be planned by the nightly run like every other rule, or it is a
-- function nobody calls.

create or replace function public.plan_all_messages()
returns int language sql security definer set search_path = public as $fn$
  select coalesce(public.plan_retreat_messages(null), 0)
       + coalesce(public.plan_work_messages(null), 0)
       + coalesce(public.plan_deposit_chase(null), 0);
$fn$;
