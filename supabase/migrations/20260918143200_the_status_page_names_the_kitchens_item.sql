-- The status page names the kitchen's item.
--
-- A counselor who asked for "3 bags of Big marshmallows" was approved "2 bags" of the kitchen's
-- Mini marshmallows, and their status page still said "Big marshmallows 2 bags": what they will
-- actually be handed was only on the kitchen's screens. Each line now carries the linked item's
-- name, so the page can say what is on the shelf for them. Names only, as the form already shows.
--
-- Body read from pg_get_functiondef on staging and edited by one join and one key.

CREATE OR REPLACE FUNCTION public.get_food_request_status(p_status_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare r record;
begin
  select q.*, c.name as camp_name, c.logo_url, p.name as program_name, s.pickup_location
    into r
    from public.food_requests q
    join public.camps c on c.id = q.camp_id
    left join public.food_programs p on p.id = q.program_id
    left join public.food_request_settings s on s.camp_id = q.camp_id
   where q.status_token = p_status_token and c.deleted_at is null;
  if r.id is null then return null; end if;

  return jsonb_build_object(
    'camp', jsonb_build_object('name', r.camp_name, 'logo_url', r.logo_url),
    'program_name', r.program_name,
    'ref', r.id,
    'requester_name', r.requester_name,
    'purpose', r.purpose, 'headcount', r.headcount,
    'pickup_date', r.pickup_date, 'pickup_time', r.pickup_time,
    'pickup_location', r.pickup_location,
    'status', r.status, 'is_late', r.is_late, 'notice_hours', r.notice_hours, 'cutoff_hours', r.cutoff_hours,
    'kitchen_note', r.kitchen_note, 'changed_by_kitchen', r.changed_by_kitchen,
    'created_at', r.created_at, 'decided_at', r.decided_at, 'ready_at', r.ready_at,
    'picked_up_at', r.picked_up_at, 'missed_at', r.missed_at, 'cancelled_at', r.cancelled_at,
    'can_cancel', r.status in ('submitted','approved'),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                'label', l.label, 'qty_requested', l.qty_requested, 'unit_label', l.unit_label,
                'qty_approved', l.qty_approved, 'approved_unit_label', l.approved_unit_label,
                'line_state', l.line_state, 'note', l.note, 'item_name', i.name) order by l.sort_order)
              from public.food_request_lines l
              left join public.inventory_items i on i.id = l.item_id
             where l.request_id = r.id), '[]'::jsonb)
  );
end;
$fn$;

revoke execute on function public.get_food_request_status(text) from public, anon, authenticated;
grant execute on function public.get_food_request_status(text) to anon, authenticated, service_role;
