-- QR codes on cabin doors: scan the sticker, report the problem that is in front of you.
--
-- The public report form already existed, but it asked the reporter to find their own location
-- in a dropdown of the whole camp. A counselor standing in front of a broken screen door knows
-- what is broken and does not reliably know whether that building is called "Cabin 7", "Cabin
-- Seven" or "Boys 7" in our tree. The sticker answers that question for them, so the location on
-- the issue is right by construction rather than by the reporter guessing well.
--
-- Two things follow from putting a URL on a physical object in a public place:
--
-- 1. The URL is not a secret and cannot be one. Anyone who can photograph a cabin door has it.
--    So it must carry authority to do exactly one thing (file a report against this location at
--    this camp) and nothing else. It is an opaque per-location token, never the location's uuid,
--    because a uuid in a URL invites walking the table and tells the holder we have a table to
--    walk. Resolving the token is a security-definer function that returns a camp name, a
--    location name and nothing more.
--
-- 2. Discoverable means abusable. Until now `anon insert public reports` let any holder of the
--    anon key -- which ships in the JS bundle, so: anyone -- write unlimited rows into `issues`
--    as long as they set is_public_report. That was survivable while the form was an unadvertised
--    URL. It is not survivable once we print the address on a sign. This migration replaces that
--    policy with a single security-definer entry point that validates its own inputs and rate
--    limits by client IP, and then drops the blanket policy so the front door is the only door.

-- ─── Tokens ───────────────────────────────────────────────────────────────────
-- 9 random bytes -> 12 URL-safe characters. Short enough that the QR stays coarse and scans from
-- across a room in bad light, long enough (72 bits) that guessing one is not a strategy.

create or replace function public.gen_qr_token()
returns text
language sql volatile
set search_path = public
as $$
  -- pgcrypto lives in the extensions schema on Supabase, and this function's search_path is
  -- pinned to public, so the call has to be schema-qualified or it resolves to nothing.
  select translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_');
$$;

comment on function public.gen_qr_token() is
  'A 12-character URL-safe token for a location QR code. Volatile so a set-returning UPDATE gives every row its own.';

alter table public.locations add column if not exists qr_token text;

-- Volatile function in an UPDATE is evaluated per row, so this is one token each, not one shared.
update public.locations set qr_token = public.gen_qr_token() where qr_token is null;

alter table public.locations alter column qr_token set default public.gen_qr_token();
alter table public.locations alter column qr_token set not null;

create unique index if not exists locations_qr_token_key on public.locations(qr_token);

comment on column public.locations.qr_token is
  'Opaque token printed into this location''s QR sticker. Not a secret (it is on a door) and not a credential: it authorises filing a public report against this location and nothing else.';

-- ─── Resolving a scan ─────────────────────────────────────────────────────────
-- Everything an unauthenticated scanner is allowed to learn from a sticker: which camp, which
-- location, and how to render the page in the camp's own colours so it reads as legitimate.

create or replace function public.get_qr_report_target(p_token text)
returns table (
  camp_id       uuid,
  camp_name     text,
  camp_slug     text,
  logo_url      text,
  location_id   uuid,
  location_name text,
  location_path text
)
language sql security definer set search_path = public stable
as $$
  -- `recursive` is required by the ancestry CTE below, which walks parent_id up to the root.
  with recursive target as (
    select l.id, l.camp_id, l.name, l.parent_id
    from public.locations l
    where l.qr_token = p_token and l.is_active
    limit 1
  ),
  ancestry as (
    select t.id, t.parent_id, t.name, 0 as depth from target t
    union all
    select p.id, p.parent_id, p.name, a.depth + 1
    from public.locations p
    join ancestry a on a.parent_id = p.id
  )
  select
    c.id,
    c.name,
    c.slug,
    c.logo_url,
    t.id,
    t.name,
    (select string_agg(a.name, ' › ' order by a.depth desc) from ancestry a)
  from target t
  join public.camps c on c.id = t.camp_id;
$$;

revoke execute on function public.get_qr_report_target(text) from public;
grant  execute on function public.get_qr_report_target(text) to anon, authenticated;

comment on function public.get_qr_report_target(text) is
  'Resolve a scanned QR token to the camp and location it names. Anon-callable by design; returns display fields only, never ids of anything the scanner did not already hold a token for.';

-- ─── Rate limiting ────────────────────────────────────────────────────────────
-- Per camp, per client IP, per rolling hour. No RLS policies on purpose: nothing outside the
-- security-definer function below is meant to read or write this, and no policies means no access.

create table if not exists public.public_report_throttle (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

alter table public.public_report_throttle enable row level security;

comment on table public.public_report_throttle is
  'Rolling-hour submission counts for the public report form, keyed camp:ip. Written only by submit_public_report(); deliberately has no RLS policies.';

-- ─── The one way in ───────────────────────────────────────────────────────────
-- Accepts either a QR token (sticker on a door) or a camp slug plus an optional location (the
-- older /report/:camp form). The token wins when both are supplied, because the token is the
-- thing the reporter physically stood in front of.

create or replace function public.submit_public_report(
  p_camp_slug        text default null,
  p_qr_token         text default null,
  p_location_id      uuid default null,
  p_title            text default null,
  p_description      text default null,
  p_reporter_name    text default null,
  p_reporter_contact text default null,
  p_photo_url        text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_camp_id       uuid;
  v_location_id   uuid;
  v_location_name text;
  v_ip            text;
  v_bucket        text;
  v_count         integer;
  v_issue_id      uuid;
  v_photo         text;
begin
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'A short description of the problem is required.' using errcode = '22023';
  end if;

  if p_qr_token is not null then
    select l.camp_id, l.id, l.name
      into v_camp_id, v_location_id, v_location_name
      from public.locations l
     where l.qr_token = p_qr_token and l.is_active
     limit 1;
    if v_camp_id is null then
      raise exception 'This code is not recognised.' using errcode = '22023';
    end if;
  else
    select c.id into v_camp_id from public.camps c where c.slug = p_camp_slug limit 1;
    if v_camp_id is null then
      raise exception 'This camp is not recognised.' using errcode = '22023';
    end if;
    -- A location is optional here, but if one is named it must belong to this camp. Otherwise the
    -- slug form becomes a way to file reports against any camp's locations.
    if p_location_id is not null then
      select l.id, l.name into v_location_id, v_location_name
        from public.locations l
       where l.id = p_location_id and l.camp_id = v_camp_id and l.is_active;
      if v_location_id is null then
        raise exception 'This location is not recognised.' using errcode = '22023';
      end if;
    end if;
  end if;

  -- x-forwarded-for is set by the Supabase edge, not the caller, so it is a usable key. If the
  -- header is missing we fall back to one shared bucket rather than to no limit at all.
  begin
    v_ip := btrim(split_part(
      coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-forwarded-for', ',', 1));
  exception when others then
    v_ip := null;
  end;
  v_ip := coalesce(nullif(v_ip, ''), 'unknown');
  v_bucket := v_camp_id::text || ':' || v_ip;

  insert into public.public_report_throttle as t (bucket, window_start, count)
  values (v_bucket, now(), 1)
  on conflict (bucket) do update
    set count        = case when t.window_start < now() - interval '1 hour' then 1    else t.count + 1 end,
        window_start = case when t.window_start < now() - interval '1 hour' then now() else t.window_start end
  returning t.count into v_count;

  if v_count > 12 then
    raise exception 'Too many reports from this device in the last hour. Please try again later, or call the camp office.'
      using errcode = '54000';
  end if;

  -- Occasional cheap sweep so the table stays small without needing a scheduled job.
  if random() < 0.01 then
    delete from public.public_report_throttle where window_start < now() - interval '1 day';
  end if;

  -- The photo URL comes from the client, which means it is a claim, not a fact. Only accept one
  -- that points into our own public bucket; anything else would let a report embed an arbitrary
  -- image that staff then render in the admin UI.
  v_photo := nullif(btrim(coalesce(p_photo_url, '')), '');
  if v_photo is not null and position('/storage/v1/object/public/public-report-photos/' in v_photo) = 0 then
    v_photo := null;
  end if;

  insert into public.issues (
    camp_id, title, description, locations, location_ids,
    priority, status, assignee_id, reported_by_id,
    is_public_report, source, reporter_name, reporter_contact, photo_url
  ) values (
    v_camp_id,
    left(btrim(p_title), 200),
    left(nullif(btrim(coalesce(p_description, '')), ''), 4000),
    case when v_location_name is null then '{}'::text[] else array[v_location_name] end,
    case when v_location_id   is null then '{}'::uuid[] else array[v_location_id]   end,
    'normal', 'unassigned', null, null,
    true, 'public',
    left(nullif(btrim(coalesce(p_reporter_name, '')), ''), 120),
    left(nullif(btrim(coalesce(p_reporter_contact, '')), ''), 160),
    v_photo
  )
  returning id into v_issue_id;

  return v_issue_id;
end;
$$;

revoke execute on function public.submit_public_report(text, text, uuid, text, text, text, text, text) from public;
grant  execute on function public.submit_public_report(text, text, uuid, text, text, text, text, text) to anon, authenticated;

comment on function public.submit_public_report(text, text, uuid, text, text, text, text, text) is
  'The only way an unauthenticated reporter can create an issue. Validates the camp/location pairing, rate limits per camp per IP per hour, clamps field lengths and refuses photo URLs outside our own bucket.';

-- With a validated entry point in place, the blanket anon INSERT is now the weakest link rather
-- than the mechanism. Drop it: after this, setting is_public_report = true buys an attacker
-- nothing, because anon can no longer insert into issues at all.
drop policy if exists "anon insert public reports" on public.issues;
