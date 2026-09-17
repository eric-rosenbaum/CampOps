-- A sticker on a trailer with no home still takes a report.
--
-- Scanning an asset sticker and describing a problem raised "This camp is not recognised" and
-- left the guest with nothing. The wrapper handed the shared entry point three nulls — no camp
-- slug, no location token, and (for an asset that lives nowhere in particular: a trailer, a mower
-- that is in the shop, a generator that moves) no location id either. That entry point identifies
-- the camp by slug or by a LOCATION token, and an asset token is neither, so it threw before the
-- line below that would have corrected the camp could ever run.
--
-- The camp is never actually in doubt: the token belongs to the asset and the asset belongs to a
-- camp. So the wrapper now says which camp, by slug, and the report files against that camp with
-- no location rather than failing.
--
-- The asset's home is also only passed on when it is a location that still exists and is still
-- active. An asset whose home was archived was the same dead end by another route.
--
-- Body edited from pg_get_functiondef of the deployed function; the signature is unchanged, so
-- there is no old overload to drop.

create or replace function public.submit_public_report_v2(
  p_camp_slug text default null, p_qr_token text default null, p_location_id uuid default null,
  p_title text default null, p_description text default null, p_reporter_name text default null,
  p_reporter_contact text default null, p_photo_url text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_asset    camp_assets;
  v_slug     text;
  v_location uuid;
  v_issue    uuid;
  v_token    text;
  v_assignee uuid;
begin
  -- An asset token resolves to its home location and then reuses the existing, already
  -- rate-limited entry point rather than opening a second door into `issues`.
  if p_qr_token is not null then
    select * into v_asset from camp_assets where qr_token = p_qr_token;
  end if;

  if v_asset.id is not null then
    -- Name the camp. The sticker already knows it, and it is the only thing the entry point
    -- cannot work out for itself from an asset token.
    select c.slug into v_slug from camps c where c.id = v_asset.camp_id;

    -- Only a home that still exists and is still active. Anything else files with no location,
    -- which is the truth about where the thing is anyway.
    select l.id into v_location
      from public.locations l
     where l.id = v_asset.location_id and l.camp_id = v_asset.camp_id and l.is_active;

    v_issue := public.submit_public_report(
      v_slug, null, v_location,
      coalesce(v_asset.name || ' — ', '') || coalesce(nullif(btrim(p_title), ''), 'Problem reported'),
      p_description, p_reporter_name, p_reporter_contact, p_photo_url);
    update issues set asset_id = v_asset.id where id = v_issue;
  else
    v_issue := public.submit_public_report(
      p_camp_slug, p_qr_token, p_location_id, p_title, p_description,
      p_reporter_name, p_reporter_contact, p_photo_url);
  end if;

  update issues set source = 'qr' where id = v_issue and p_qr_token is not null;

  -- Send it to whoever owns that trade. Only when nobody has it already, so this can never
  -- take a report off a person it was deliberately given to.
  select public.route_work(i.camp_id, i.trade) into v_assignee
    from issues i where i.id = v_issue and i.assignee_id is null;
  if v_assignee is not null then
    update issues set assignee_id = v_assignee, status = 'assigned'
     where id = v_issue and assignee_id is null;
  end if;

  select reporter_token into v_token from issues where id = v_issue;
  return jsonb_build_object('id', v_issue, 'receipt_token', v_token);
end;
$fn$;

grant execute on function public.submit_public_report_v2(
  text, text, uuid, text, text, text, text, text) to anon, authenticated;
