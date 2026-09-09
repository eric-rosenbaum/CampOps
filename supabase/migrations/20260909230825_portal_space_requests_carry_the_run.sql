-- The portal has to know a request covers a run, or it renders a four-day booking as its
-- first day and the group cannot tell what they asked for.

create or replace function public.portal_space_requests(p_token text)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'location_id', r.location_id,
           'location_name', l.name, 'day_date', r.day_date, 'end_date', r.end_date,
           'start_label', r.start_label, 'end_label', r.end_label,
           'purpose', r.purpose, 'expected_count', r.expected_count,
           'layout', r.layout, 'layout_other', r.layout_other,
           'setup_notes', r.setup_notes, 'status', r.status,
           'response_message', r.response_message
         ) order by r.day_date, l.name), '[]'::jsonb)
  from retreat_space_requests r
  join locations l on l.id = r.location_id
  where r.retreat_id = (select id from retreats where portal_token = p_token);
$fn$;
