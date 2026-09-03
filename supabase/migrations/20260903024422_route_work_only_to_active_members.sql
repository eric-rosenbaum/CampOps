-- Routing must never hand work to somebody who has left.
--
-- work_routing holds a default assignee chosen once and then forgotten. When that person is
-- deactivated, every routine occurrence, set-up, strike and turnover generated afterwards was
-- silently assigned to a dormant account: the work order says "assigned", the board cannot
-- resolve a name for it, and it belongs to nobody. Found on the staging pilot camp, where the
-- default pointed at a deactivated founder login.
--
-- Unassigned is a legitimate and visible answer. Assigned-to-a-ghost is not.

create or replace function public.route_work(p_camp_id uuid, p_trade text)
returns uuid language sql stable security definer set search_path = public as $fn$
  select r.default_assignee_id
  from work_routing r
  where r.camp_id = p_camp_id
    and r.trade = p_trade
    and exists (
      select 1 from camp_members m
      where m.camp_id = p_camp_id
        and m.user_id = r.default_assignee_id
        and m.is_active
        and m.role in ('admin', 'staff')   -- a viewer cannot be given work
    );
$fn$;

comment on function public.route_work(uuid, text) is
  'The default owner for a trade''s work, but only while that person is still an active admin or staff member. Returns null otherwise, because unassigned is honest and assigned-to-a-ghost is not.';
