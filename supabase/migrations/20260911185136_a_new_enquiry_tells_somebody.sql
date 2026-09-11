-- An enquiry that lands in the pipeline and tells nobody is a lead the camp finds next week.
--
-- Two ways of being told, because they fail differently: an email reaches whoever is not looking
-- at the app, and a banner reaches whoever is. The banner needs to know what has already been
-- looked at, hence the seen marker -- a notice that never clears stops being read.
alter table public.retreats
  add column if not exists enquiry_seen_at timestamptz;

comment on column public.retreats.enquiry_seen_at is
  'When somebody at camp acknowledged this enquiry. Null on an enquiry that arrived through the public link and has not been opened; always null for retreats the camp typed in themselves.';

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
declare v_camp camps; v_id uuid; m record; v_when text; v_body text;
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

  -- ── Tell the people who asked to be told ──
  v_when := case
    when p_arrival is not null and p_departure is not null
      then to_char(p_arrival, 'FMDD FMMon YYYY') || ' to ' || to_char(p_departure, 'FMDD FMMon YYYY')
    when nullif(btrim(p_flexibility), '') is not null then btrim(p_flexibility)
    else 'no dates yet' end;

  v_body := public.msg_wrap(
    btrim(p_group_name) || ' has enquired',
    '<strong>' || coalesce(nullif(btrim(p_contact_name), ''), 'They') || '</strong> got in touch through your enquiry link.'
    || '<br><br>'
    || 'When: ' || v_when || '<br>'
    || 'How many: ' || coalesce(nullif(p_headcount, 0)::text, 'not said') || '<br>'
    || 'Email: ' || lower(btrim(p_email))
    || coalesce('<br>Phone: ' || nullif(btrim(p_phone), ''), '')
    || case when coalesce(btrim(p_message), '') <> ''
            then '<br><br>In their words:<br><em>' || btrim(p_message) || '</em>' else '' end
    || '<br><br>It is in your pipeline as a new enquiry.',
    v_camp.name);

  for m in
    select u.email
      from camp_members cm
      join auth.users u on u.id = cm.user_id
     where cm.camp_id = v_camp.id and cm.is_active and cm.notify_retreats
       and coalesce(btrim(u.email), '') <> ''
  loop
    -- Per recipient, so one person unsubscribing does not take the rest with them. rule_key
    -- carries the retreat id, so the outbox's one-per-subject-per-rule uniqueness still holds.
    perform public.queue_message(
      v_camp.id, 'retreat', v_id, 'new_enquiry:' || m.email, 'camp',
      m.email, v_camp.name, lower(btrim(p_email)), now(),
      'New enquiry: ' || btrim(p_group_name), v_body);
  end loop;

  return jsonb_build_object('ok', true);
end;
$fn$;

grant execute on function public.submit_camp_enquiry(
  text, text, text, text, text, text, int, date, date, text, text) to anon, authenticated;

/** Somebody at camp has looked at this enquiry, so the banner can stop saying it is new. */
create or replace function public.mark_enquiry_seen(p_retreat_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_camp uuid;
begin
  select camp_id into v_camp from retreats where id = p_retreat_id;
  if v_camp is null then return; end if;
  if not is_camp_member(v_camp) then raise exception 'Forbidden'; end if;
  update retreats set enquiry_seen_at = now() where id = p_retreat_id and enquiry_seen_at is null;
end;
$fn$;

grant execute on function public.mark_enquiry_seen(uuid) to authenticated;
