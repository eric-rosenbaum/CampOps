-- Add-ons are removed.
--
-- The whole feature: a camp-level catalog of extras (linens, boats, AV, firewood), a step in the
-- guest portal offering them, an Extras tab to maintain them, and a card on the season review.
-- It was the product's only upsell surface and nobody asked for it; a step called "Anything else
-- you need?" appeared in any portal whose camp had a guest-selectable catalog row, which on a
-- seeded demo is every camp.
--
-- Nothing is lost: zero charges were ever linked to a catalog row on staging, and production
-- never had the table. retreat_charges keeps every charge it holds -- only the link to the
-- catalog goes, with the guest-requested flag that nothing but the add-on flow ever set.
--
-- Order matters: the two functions that READ the catalog are rewritten before it is dropped.
drop function if exists public.portal_addons(text);
drop function if exists public.portal_request_addon(text, uuid, numeric, boolean);

-- Transcribed from pg_get_functiondef with the `has_addons` key deleted and nothing else touched.
create or replace function public.get_portal_data_v2_inner(p_token text, p_session text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_base     jsonb;
  v_retreat  retreats;
  v_has_two  boolean;
  v_spaces   jsonb;
begin
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_portal_data'
      and pg_get_function_identity_arguments(p.oid) = 'p_token text, p_session text'
  ) into v_has_two;

  if v_has_two then
    execute 'select public.get_portal_data($1, $2)' into v_base using p_token, p_session;
  else
    execute 'select public.get_portal_data($1)' into v_base using p_token;
  end if;

  if v_base is null then return null; end if;

  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then return v_base; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', l.name,
           'building_id', l.parent_id,
           'building', (select p.name from locations p where p.id = l.parent_id),
           -- What the building as a whole is like. Written once on the building, shown above its
           -- rooms, so a group reads the village before picking a cabin in it.
           'building_description', (
             select nullif(btrim(p.notes), '') from locations p where p.id = l.parent_id),
           'bed_capacity', coalesce(l.bed_capacity, 0),
           'accessible', l.accessible,
           -- What this cabin is like: the type the camp wrote once, plus anything true of
           -- this one alone.
           'cabin_type', (select t.name from camp_cabin_types t where t.id = l.cabin_type_id),
           'description', nullif(btrim(concat_ws(
             E'\n',
             (select nullif(btrim(t.description), '') from camp_cabin_types t where t.id = l.cabin_type_id),
             nullif(btrim(l.notes), ''))), '')
         ) order by l.sort_order, l.name), '[]'::jsonb)
    into v_spaces
    from locations l
   where l.camp_id = v_retreat.camp_id and l.is_dorm and l.retreat_available and l.is_active
     -- Available, or not on the list.
     and coalesce(l.service_status, 'in_service') <> 'out_of_service'
     and not exists (
       select 1 from locations c
       where c.parent_id = l.id and c.is_dorm and c.retreat_available and c.is_active
         and coalesce(c.service_status, 'in_service') <> 'out_of_service');

  return v_base || jsonb_build_object(
    'spaces', v_spaces,

    -- Messages about meeting spaces the group has not read. Drives the banner and the dot; the
    -- messages themselves are fetched by the section that draws the thread.
    'spaces_unread', (
      select count(*)::int from retreat_space_messages m
      where m.retreat_id = v_retreat.id and m.author_kind <> 'group'
        and m.created_at > coalesce(v_retreat.spaces_group_read_at, '-infinity'::timestamptz)),

    'proposal', (
      select jsonb_build_object(
               'id', p.id, 'version', p.version, 'total', p.total,
               'valid_until', p.valid_until, 'status', p.status,
               'sent_at', p.sent_at,
               'accepted_at', p.accepted_at)
      from retreat_proposals p
      where p.retreat_id = v_retreat.id and p.status in ('sent','viewed','accepted','declined')
      order by p.version desc limit 1),

    'has_program_spaces', exists (
      select 1 from locations l
      where l.camp_id = v_retreat.camp_id and l.program_space and l.is_active
        and l.service_status <> 'out_of_service'),

    'space_request_count', (
      select count(*)::int from retreat_space_requests q where q.retreat_id = v_retreat.id),

    'payment_note', (select c.retreat_payment_note from camps c where c.id = v_retreat.camp_id),
    'payments_enabled', (select coalesce(c.stripe_charges_enabled, false)
                         from camps c where c.id = v_retreat.camp_id)
  );
end;
$function$;

-- The season review's add-on breakdown counted charges by the catalog row that made them. With
-- no catalog there is nothing to group by, and the card that read it is gone from the page.
create or replace function public.rentals_review(p_camp_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v jsonb; v_beds int; v_nights int;
begin
  if not is_camp_member(p_camp_id) then raise exception 'Forbidden'; end if;

  select coalesce(sum(bed_capacity), 0) into v_beds
    from locations where camp_id = p_camp_id and is_dorm and retreat_available and is_active;
  v_nights := greatest((p_to - p_from), 1);

  with scoped as (
    select r.* from retreats r
    where r.camp_id = p_camp_id
      and r.arrival_date is not null
      and r.arrival_date between p_from and p_to
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,

    'occupancy', jsonb_build_object(
      'beds_available', v_beds,
      'nights', v_nights,
      'bed_nights_available', v_beds * v_nights,
      'bed_nights_sold', coalesce((select sum(coalesce(final_headcount, headcount, 0)
                                              * greatest(departure_date - arrival_date, 1))
                                   from scoped where status not in ('cancelled','inquiry')), 0),
      'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'bed_nights', bn) order by m)
        from (select to_char(arrival_date, 'YYYY-MM') as m,
                     sum(coalesce(final_headcount, headcount, 0) * greatest(departure_date - arrival_date, 1)) as bn
              from scoped where status not in ('cancelled','inquiry') group by 1) t), '[]'::jsonb),
      'out_of_service_beds', coalesce((select sum(bed_capacity) from locations
         where camp_id = p_camp_id and is_dorm and service_status = 'out_of_service'), 0)),

    'revenue', jsonb_build_object(
      'invoiced', coalesce((select sum(i.amount) from retreat_invoices i
                            join scoped s on s.id = i.retreat_id), 0),
      'collected', coalesce((select sum(p.amount) from retreat_payments p
                             join scoped s on s.id = p.retreat_id), 0),
      'outstanding', coalesce((select sum(i.amount - coalesce(i.amount_paid,0))
                               from retreat_invoices i join scoped s on s.id = i.retreat_id
                               where i.status <> 'paid'), 0),
      'by_group', coalesce((select jsonb_agg(jsonb_build_object(
                              'group', s.group_name, 'invoiced', coalesce(inv.total, 0),
                              'people', coalesce(s.final_headcount, s.headcount, 0))
                            order by coalesce(inv.total,0) desc)
                            from scoped s
                            left join lateral (select sum(amount) as total from retreat_invoices
                                               where retreat_id = s.id) inv on true), '[]'::jsonb)),

    'pipeline', jsonb_build_object(
      'inquiries', (select count(*) from retreats where camp_id = p_camp_id
                     and created_at::date between p_from and p_to),
      'proposals_sent', (select count(*) from retreat_proposals
                          where camp_id = p_camp_id and sent_at::date between p_from and p_to),
      'won',  (select count(*) from retreats where camp_id = p_camp_id and lead_stage = 'won'
                and created_at::date between p_from and p_to),
      'lost', (select count(*) from retreats where camp_id = p_camp_id and lead_stage = 'lost'
                and created_at::date between p_from and p_to),
      'median_days_to_win', (select round(percentile_cont(0.5) within group (
            order by extract(epoch from (p.accepted_at - r.created_at))/86400.0)::numeric, 1)
          from retreat_proposals p join retreats r on r.id = p.retreat_id
          where r.camp_id = p_camp_id and p.accepted_at is not null),
      'lost_reasons', coalesce((select jsonb_object_agg(coalesce(lost_reason,'not recorded'), n) from (
          select lost_reason, count(*) as n from retreats
          where camp_id = p_camp_id and lead_stage = 'lost' group by 1) t), '{}'::jsonb)),

    'where_groups_come_from', jsonb_build_object(
      'by_source', coalesce((select jsonb_object_agg(coalesce(lead_source,'not recorded'), n) from (
          select lead_source, count(*) as n from scoped group by 1) t), '{}'::jsonb),
      'returning', (select count(*) from scoped s
                     where exists (select 1 from retreats o where o.camp_id = p_camp_id
                                     and o.group_name = s.group_name and o.id <> s.id
                                     and o.arrival_date < s.arrival_date)),
      'total', (select count(*) from scoped)),

    'cost_to_host', coalesce((select jsonb_agg(jsonb_build_object(
        'group', s.group_name,
        'budgeted', coalesce(cst.budgeted, 0),
        'actual', coalesce(cst.actual, 0),
        'work_orders', coalesce(wo.n, 0),
        'work_minutes', coalesce(wo.mins, 0),
        'work_cost', coalesce(wo.cost, 0)) order by s.arrival_date)
      from scoped s
      left join lateral (select sum(budgeted) as budgeted, sum(actual) as actual
                         from retreat_costs where retreat_id = s.id) cst on true
      left join lateral (select count(*) as n, sum(minutes_spent) as mins, sum(actual_cost) as cost
                         from issues where retreat_id = s.id) wo on true), '[]'::jsonb),

    'feedback', jsonb_build_object(
      'average_overall', (select round(avg(overall)::numeric, 2) from retreat_feedback f
                           join scoped s on s.id = f.retreat_id),
      'responses', (select count(*) from retreat_feedback f join scoped s on s.id = f.retreat_id),
      'would_not_return', coalesce((select jsonb_agg(jsonb_build_object(
            'group', s.group_name, 'comment', f.comment, 'overall', f.overall))
          from retreat_feedback f join scoped s on s.id = f.retreat_id
          where f.returning_status is not null and f.returning_status ilike '%no%'), '[]'::jsonb))
  ) into v;

  return v;
end;
$function$;

alter table if exists public.retreat_charges drop column if exists addon_id;
alter table if exists public.retreat_charges drop column if exists requested_by_guest;

drop table if exists public.retreat_addon_catalog;
