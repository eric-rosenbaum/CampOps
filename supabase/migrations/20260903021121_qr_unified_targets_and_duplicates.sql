-- One sticker mechanism, two kinds of subject, and the duplicate check that makes open
-- reporting survivable.
--
-- get_qr_report_target() only knew about locations. Assets carry the same 12-character token
-- now, and a camp cannot manage two sticker systems — so one resolver answers both, and the
-- caller does not have to know which kind of thing it scanned before it scans it.

create or replace function public.get_qr_target(p_token text)
returns table (
  camp_id     uuid,
  camp_name   text,
  camp_slug   text,
  logo_url    text,
  kind        text,
  target_id   uuid,
  target_name text,
  target_path text
)
language sql security definer set search_path = public stable as $fn$
  with recursive loc as (
    select l.id, l.camp_id, l.name, l.parent_id
    from public.locations l
    where l.qr_token = p_token and l.is_active
    limit 1
  ),
  ancestry as (
    select t.id, t.parent_id, t.name, 0 as depth from loc t
    union all
    select p.id, p.parent_id, p.name, a.depth + 1
    from public.locations p join ancestry a on a.parent_id = p.id
  )
  select c.id, c.name, c.slug, c.logo_url, 'location'::text, t.id, t.name,
         (select string_agg(a.name, ' › ' order by a.depth desc) from ancestry a)
  from loc t join public.camps c on c.id = t.camp_id

  union all

  select c.id, c.name, c.slug, c.logo_url, 'asset'::text, a.id, a.name,
         nullif(a.storage_location, '')
  from public.camp_assets a
  join public.camps c on c.id = a.camp_id
  where a.qr_token = p_token and coalesce(a.is_active, true);
$fn$;

revoke execute on function public.get_qr_target(text) from public;
grant execute on function public.get_qr_target(text) to anon, authenticated;

comment on function public.get_qr_target(text) is
  'Resolve any scanned sticker — location or asset — to what it names. Anon-callable by design; returns display fields only, never an id the scanner did not already hold a token for.';

-- Reissue a token ---------------------------------------------------------------
-- For a sticker that gets abused or peeled off and stuck somewhere else. Every printed copy of
-- the old code stops resolving, which is the point.
create or replace function public.rotate_qr_token(p_kind text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_camp uuid; v_new text;
begin
  if p_kind = 'asset' then
    select camp_id into v_camp from camp_assets where id = p_id;
  else
    select camp_id into v_camp from locations where id = p_id;
  end if;
  if v_camp is null then raise exception 'No such thing to re-sticker.'; end if;
  if not is_camp_admin(v_camp) then raise exception 'Forbidden'; end if;

  v_new := public.gen_qr_token();
  if p_kind = 'asset' then
    update camp_assets set qr_token = v_new where id = p_id;
  else
    update locations set qr_token = v_new where id = p_id;
  end if;
  return v_new;
end;
$fn$;

grant execute on function public.rotate_qr_token(text, uuid) to authenticated;

-- Duplicate detection -----------------------------------------------------------
-- The number one failure of open reporting is the same broken door reported eleven times. With
-- the location known from the sticker this is a plain query, not an AI problem — and it belongs
-- in front of the person BEFORE they type, not in a triage queue afterwards.
--
-- Anon-callable, so it returns the least it can: what is already reported here, how old, and
-- nothing else. No assignee, no cost, no reporter, no id.
create or replace function public.open_reports_at(p_token text)
returns jsonb language sql security definer stable set search_path = public as $fn$
  with target as (
    select l.id as location_id, l.camp_id from public.locations l
     where l.qr_token = p_token and l.is_active
    union all
    select a.location_id, a.camp_id from public.camp_assets a
     where a.qr_token = p_token and a.location_id is not null
    limit 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'title', i.title,
           'reported_days_ago', greatest(0, (current_date - i.created_at::date)),
           'status', case when i.status = 'unassigned' then 'not started yet' else 'being worked on' end
         ) order by i.created_at desc), '[]'::jsonb)
  from public.issues i, target t
  where i.camp_id = t.camp_id
    and t.location_id = any(i.location_ids)
    and i.status <> 'resolved'
    and i.created_at > now() - interval '90 days';
$fn$;

revoke execute on function public.open_reports_at(text) from public;
grant execute on function public.open_reports_at(text) to anon, authenticated;

-- Let a sticker on an ASSET file a public report too -----------------------------
-- Somebody standing in front of a broken mower should not have to find the shed in a dropdown.
-- The report lands against the asset's home location, and names the asset in the title.
create or replace function public.submit_public_report_v2(
  p_camp_slug        text default null,
  p_qr_token         text default null,
  p_location_id      uuid default null,
  p_title            text default null,
  p_description      text default null,
  p_reporter_name    text default null,
  p_reporter_contact text default null,
  p_photo_url        text default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_asset  camp_assets;
  v_issue  uuid;
  v_token  text;
begin
  -- An asset token resolves to its home location and then reuses the existing, already
  -- rate-limited entry point rather than opening a second door into `issues`.
  if p_qr_token is not null then
    select * into v_asset from camp_assets where qr_token = p_qr_token;
  end if;

  if v_asset.id is not null then
    v_issue := public.submit_public_report(
      null, null, v_asset.location_id,
      coalesce(v_asset.name || ' — ', '') || coalesce(nullif(btrim(p_title), ''), 'Problem reported'),
      p_description, p_reporter_name, p_reporter_contact, p_photo_url);
    -- The camp_slug arm of submit_public_report needs a camp when there is no location; if the
    -- asset has no home location recorded, fall back to naming the camp directly.
    if v_asset.location_id is null then
      update issues set camp_id = v_asset.camp_id, asset_id = v_asset.id where id = v_issue;
    else
      update issues set asset_id = v_asset.id where id = v_issue;
    end if;
  else
    v_issue := public.submit_public_report(
      p_camp_slug, p_qr_token, p_location_id, p_title, p_description,
      p_reporter_name, p_reporter_contact, p_photo_url);
  end if;

  -- Hand back a receipt so the person who reported it can find out what happened. A counselor
  -- who files through a sticker and never hears anything is the loudest complaint about every
  -- open-reporting system there is.
  update issues set source = 'qr' where id = v_issue and p_qr_token is not null;
  select reporter_token into v_token from issues where id = v_issue;

  return jsonb_build_object('id', v_issue, 'receipt_token', v_token);
end;
$fn$;

revoke execute on function public.submit_public_report_v2(text, text, uuid, text, text, text, text, text) from public;
grant execute on function public.submit_public_report_v2(text, text, uuid, text, text, text, text, text) to anon, authenticated;
