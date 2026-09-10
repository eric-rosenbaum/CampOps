-- A phone that changes hands could not re-register.
--
-- device_tokens is unique on the token, and its policy is `user_id = auth.uid()` in both
-- directions. Those two facts together mean the obvious client upsert fails the moment a device
-- already carries somebody else's row: the update path needs the OLD owner's identity, which the
-- new signed-in user does not have. A camp phone passed from the outgoing maintenance lead to the
-- incoming one would have gone on delivering the outgoing one's work orders, silently.
--
-- Holding the APNs token IS the proof of holding the device -- iOS gives it to nobody else and
-- nobody can read another user's row -- so registration goes through a definer function that
-- takes the token away from whoever had it and files it under the caller. The table's policy
-- stays as narrow as it was for everything else.
create or replace function public.register_device_token(
  p_camp_id uuid, p_token text, p_platform text default 'ios', p_environment text default null
) returns void language plpgsql security definer set search_path = public as $fn$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'register_device_token: not signed in' using errcode = '28000';
  end if;
  if coalesce(btrim(p_token), '') = '' then
    return;   -- an empty token is not an error, it is a client with nothing to file yet
  end if;
  -- Only for a camp they actually belong to. Otherwise a token could be filed against a camp
  -- whose work the holder is not entitled to see.
  if not is_camp_member(p_camp_id) then
    raise exception 'register_device_token: not a member of that camp' using errcode = '42501';
  end if;

  delete from device_tokens where token = btrim(p_token) and user_id <> v_user;

  insert into device_tokens (camp_id, user_id, platform, token, environment)
  values (p_camp_id, v_user, coalesce(p_platform, 'ios'), btrim(p_token), p_environment)
  on conflict (token) do update
    set camp_id     = excluded.camp_id,
        platform    = excluded.platform,
        environment = excluded.environment,
        updated_at  = now();
end;
$fn$;

comment on function public.register_device_token(uuid, text, text, text) is
  'Files this device''s push token under the signed-in user, taking it from whoever held it before. Holding the token is the proof of holding the phone.';

revoke execute on function public.register_device_token(uuid, text, text, text) from public, anon;
grant execute on function public.register_device_token(uuid, text, text, text) to authenticated;
