-- Route the reports nobody can assign.
--
-- route_work() was only ever called by the generators — routines and meter services. Work that
-- ARRIVES skipped routing and landed unassigned: a counsellor scanning the sticker on a bathhouse
-- door, a parent using the public form. Those are exactly the cases where routing matters, since
-- the reporter has no assignee picker and no idea who the housekeeping lead is.
--
-- It also made the Crews & checklists card untrue. "Work filed against a trade with no default
-- here waits in the unassigned pile" reads as a promise that work filed against a trade WITH a
-- default does not wait.
--
-- Only the assignment step is added; the rest of the wrapper is unchanged from what is deployed.
-- The camp's own Log work form is deliberately left alone: somebody standing in that form chose
-- "Unassigned" on purpose, and overriding a deliberate choice is worse than the gap.

create or replace function public.submit_public_report_v2(
  p_camp_slug text default null, p_qr_token text default null, p_location_id uuid default null,
  p_title text default null, p_description text default null, p_reporter_name text default null,
  p_reporter_contact text default null, p_photo_url text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_asset    camp_assets;
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
    v_issue := public.submit_public_report(
      null, null, v_asset.location_id,
      coalesce(v_asset.name || ' — ', '') || coalesce(nullif(btrim(p_title), ''), 'Problem reported'),
      p_description, p_reporter_name, p_reporter_contact, p_photo_url);
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
$function$;

grant execute on function public.submit_public_report_v2(
  text, text, uuid, text, text, text, text, text) to anon, authenticated;
