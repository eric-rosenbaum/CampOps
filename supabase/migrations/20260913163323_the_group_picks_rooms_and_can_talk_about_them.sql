-- The portal's end of it: pick a room, leave a note, say something.

-- ── Save is now two things: the room, and anything to say about it ───────────
create or replace function public.portal_save_space_request(
  p_token text, p_location_id uuid, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_retreat retreats; v_ok boolean; v_id uuid;
begin
  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then raise exception 'This link is not recognised.' using errcode='22023'; end if;
  if public.portal_link_expired(v_retreat.departure_date) then
    raise exception 'This link has expired.' using errcode='22023';
  end if;

  select l.program_space and l.is_active and l.service_status <> 'out_of_service'
    into v_ok from locations l where l.id = p_location_id and l.camp_id = v_retreat.camp_id;
  if not coalesce(v_ok, false) then
    raise exception 'That space is not available to book.' using errcode='22023';
  end if;

  -- One ask per room per stay. The room is needed for the days the group is here, which is the
  -- only span the question "what do you need set up when you arrive" can mean.
  insert into retreat_space_requests (
    camp_id, retreat_id, location_id, day_date, end_date, setup_notes
  ) values (
    v_retreat.camp_id, v_retreat.id, p_location_id,
    v_retreat.arrival_date, v_retreat.departure_date,
    left(nullif(btrim(coalesce(p_note,'')),''), 2000)
  )
  on conflict (retreat_id, location_id, day_date) do update set
    end_date = excluded.end_date,
    setup_notes = excluded.setup_notes,
    -- A note changed after the camp approved it means the crew's instructions are stale, and
    -- somebody has to look again. Silently keeping "approved" is how a room gets set up wrong.
    status = case
      when retreat_space_requests.status = 'approved'
       and coalesce(retreat_space_requests.setup_notes,'') is distinct from coalesce(excluded.setup_notes,'')
      then 'countered' else retreat_space_requests.status end,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$fn$;

grant execute on function public.portal_save_space_request(text, uuid, text) to anon, authenticated;

-- The eleven-argument form this replaces. Adding a parameter creates a NEW function and the old
-- one keeps answering its callers, so it has to go by full signature. Sixth time.
drop function if exists public.portal_save_space_request(
  text, uuid, date, date, text, text, text, int, text, text, text);

-- ── The thread, read ─────────────────────────────────────────────────────────
create or replace function public.portal_space_messages(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_retreat retreats;
begin
  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then return null; end if;

  return jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'author_kind', m.author_kind,
               'author_name', m.author_name,
               'kind', m.kind,
               'body', m.body,
               'space_name', l.name,
               'created_at', m.created_at)
             order by m.created_at)
      from retreat_space_messages m
      left join locations l on l.id = m.location_id
      where m.retreat_id = v_retreat.id), '[]'::jsonb),
    -- What the GROUP has not read: anything the camp said after they last looked.
    'unread', (
      select count(*)::int from retreat_space_messages m
      where m.retreat_id = v_retreat.id and m.author_kind <> 'group'
        and m.created_at > coalesce(v_retreat.spaces_group_read_at, '-infinity'::timestamptz)),
    'camp_name', (select c.name from camps c where c.id = v_retreat.camp_id)
  );
end;
$fn$;

grant execute on function public.portal_space_messages(text) to anon, authenticated;

-- ── The thread, written ──────────────────────────────────────────────────────
create or replace function public.portal_post_space_message(
  p_token text, p_body text, p_location_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_retreat retreats; v_name text;
begin
  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then raise exception 'This link is not recognised.' using errcode='22023'; end if;
  if public.portal_link_expired(v_retreat.departure_date) then
    raise exception 'This link has expired.' using errcode='22023';
  end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'Write something first.' using errcode='22023';
  end if;

  v_name := coalesce(nullif(btrim(v_retreat.coordinator_name), ''), v_retreat.group_name);

  return public.post_space_message_internal(
    v_retreat.camp_id, v_retreat.id, p_location_id, 'group', v_name, 'message', p_body);
end;
$fn$;

grant execute on function public.portal_post_space_message(text, text, uuid) to anon, authenticated;

-- ── "I have read it" ─────────────────────────────────────────────────────────
create or replace function public.portal_mark_spaces_read(p_token text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  update retreats set spaces_group_read_at = now() where portal_token = p_token;
end;
$fn$;

grant execute on function public.portal_mark_spaces_read(text) to anon, authenticated;
