-- The touchpoint insert used `note` and `kind = 'inbound'`. The column is `summary` (NOT NULL) and
-- `kind` is checked against call / email / meeting / site_visit / note. An enquiry through the
-- website is closest to 'email' -- they wrote to us -- and `by_name` records that it came from the
-- group rather than from somebody at camp.
--
-- This is the live version of submit_camp_enquiry.
create or replace function public.submit_camp_enquiry(
  p_token       text,
  p_group_name  text,
  p_contact_name text,
  p_email       text,
  p_phone       text default null,
  p_group_type  text default 'other',
  p_headcount   int  default null,
  p_arrival     date default null,
  p_departure   date default null,
  p_flexibility text default null,
  p_message     text default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_camp camps; v_id uuid;
begin
  select * into v_camp from camps
   where enquiry_token = p_token and status = 'active' and deleted_at is null;
  if v_camp.id is null then raise exception 'This enquiry link is not recognised.'; end if;

  if coalesce(btrim(p_group_name), '') = '' then
    raise exception 'Tell us the name of your group.' using errcode = '22023';
  end if;
  if p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'That email address does not look right.' using errcode = '22023';
  end if;
  if p_departure is not null and p_arrival is not null and p_departure < p_arrival then
    raise exception 'The departure date is before the arrival date.' using errcode = '22023';
  end if;

  insert into retreats (
    camp_id, group_name, group_type, headcount,
    arrival_date, departure_date, date_flexibility,
    status, lead_stage, lead_source,
    coordinator_name, coordinator_email, coordinator_phone,
    intake_notes, pricing_model, portal_token
  ) values (
    v_camp.id,
    btrim(p_group_name),
    case when p_group_type in ('synagogue','corporate','youth','alumni','family','school','other')
         then p_group_type else 'other' end,
    greatest(coalesce(p_headcount, 0), 0),
    p_arrival, p_departure, nullif(btrim(p_flexibility), ''),
    'inquiry', 'new', 'website',
    nullif(btrim(p_contact_name), ''), lower(btrim(p_email)), nullif(btrim(p_phone), ''),
    nullif(btrim(p_message), ''),
    coalesce(v_camp.default_pricing_model, 'per_person_night'),
    replace(gen_random_uuid()::text, '-', '')
  ) returning id into v_id;

  -- Their own words, kept verbatim as the first touchpoint. The extracted fields are a reading of
  -- what they said; this is what they actually said.
  if coalesce(btrim(p_message), '') <> '' then
    insert into retreat_touchpoints (camp_id, retreat_id, kind, summary, occurred_at, by_name)
    values (v_camp.id, v_id, 'email', btrim(p_message), now(),
            coalesce(nullif(btrim(p_contact_name), ''), btrim(p_group_name)));
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

grant execute on function public.submit_camp_enquiry(
  text, text, text, text, text, text, int, date, date, text, text) to anon, authenticated;
