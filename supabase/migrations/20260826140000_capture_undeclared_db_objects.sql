-- Objects that exist in production but were never written into a migration.
--
-- Found by building the staging project from this repo and diffing it against production: three
-- functions and one trigger were missing. They were applied directly against production during
-- development, so nothing here could rebuild them.
--
-- Definitions are copied verbatim from production (`pg_get_functiondef`), so this is a no-op
-- there and the real thing on any new database.

-- ── Guest-portal access sessions ─────────────────────────────────────────────
-- Verifying the emailed code mints a session; every gated read checks it. Without these two the
-- private half of the portal cannot be unlocked at all.
create or replace function public.portal_verify_access_code(p_token text, p_code text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare
  r retreats; c retreat_access_codes; v_session text; v_hours int := 12;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid portal link.'); end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;

  select * into c from retreat_access_codes
   where retreat_id = r.id and consumed_at is null and expires_at > now()
   order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'That code has expired. Request a new one.');
  end if;
  if c.attempts >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Too many attempts. Request a new code.');
  end if;
  if c.code_hash <> encode(digest(coalesce(p_code, ''), 'sha256'), 'hex') then
    update retreat_access_codes set attempts = attempts + 1 where id = c.id;
    return jsonb_build_object('ok', false, 'error', 'That code is not correct.');
  end if;

  update retreat_access_codes set consumed_at = now() where id = c.id;

  v_session := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into retreat_portal_sessions (retreat_id, token_at_issue, session_hash, verified_email, expires_at)
  values (r.id, p_token, encode(digest(v_session, 'sha256'), 'hex'), c.sent_to,
          now() + make_interval(hours => v_hours));

  return jsonb_build_object('ok', true, 'session', v_session, 'hours', v_hours);
end $function$;

create or replace function public.portal_session_valid(p_token text, p_session text)
returns boolean language plpgsql stable security definer set search_path to 'public', 'extensions'
as $function$
declare v_ok boolean;
begin
  if p_session is null or btrim(p_session) = '' then return false; end if;
  select true into v_ok
  from retreat_portal_sessions s
  join retreats r on r.id = s.retreat_id
  where r.portal_token = p_token
    and s.token_at_issue = p_token          -- link regenerated since issue: session is dead
    and s.session_hash = encode(digest(p_session, 'sha256'), 'hex')
    and s.expires_at > now()
  limit 1;
  return coalesce(v_ok, false);
end $function$;

-- ── Roster → housing sync ────────────────────────────────────────────────────
-- Keeps room occupancy counts in step as guests are named, placed and removed.
create or replace function public.trg_retreat_guests_sync()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform sync_retreat_housing_from_roster(coalesce(new.retreat_id, old.retreat_id));
  return null;
end $function$;

drop trigger if exists trg_retreat_guests_sync_housing on public.retreat_guests;
create trigger trg_retreat_guests_sync_housing
  after insert or delete or update of location_id on public.retreat_guests
  for each row execute function trg_retreat_guests_sync();

-- ── A policy production dropped by hand ──────────────────────────────────────
-- `own_profile_select` (id = auth.uid()) is a strict subset of `profile_select`, which has
-- included that clause since the platform-admin read migration. Production dropped the
-- redundant one directly; the repo never did, so a rebuilt database carried an extra
-- permissive SELECT policy on profiles that production does not have.
drop policy if exists "own_profile_select" on public.profiles;
