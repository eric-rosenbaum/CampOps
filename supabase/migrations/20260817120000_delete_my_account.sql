-- In-app account deletion.
--
-- Required by App Store Guideline 5.1.1(v): any app that lets a user create an account must
-- let them delete it from inside the app. Neither client had one, which is a rejection.
--
-- What deletion means here needs stating, because a camp is a shared workspace and not all of
-- the data is the user's to remove. Their identity goes: the auth user, the profile, and every
-- camp membership. Their work stays, because it is the camp's operating record, an inspector
-- asking for a year of pool readings should not find a hole where someone's summer was. What
-- stays is detached and attributed by the name snapshot already stored on each row, so the
-- record reads "Sam Reyes" without pointing at a user that no longer exists.

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_name    text;
  v_blocker text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'You must be signed in to delete your account.');
  end if;

  -- A camp with no administrator cannot invite anyone, change anyone's role, or be recovered
  -- by its own staff, so leaving one behind is worse than refusing the deletion. Naming the
  -- camp gives the user the one action that unblocks them.
  select c.name into v_blocker
  from camp_members m
  join camps c on c.id = m.camp_id
  where m.user_id = v_uid
    and m.role = 'admin'
    and m.is_active
    and c.deleted_at is null
    and not exists (
      select 1 from camp_members peer
      where peer.camp_id = m.camp_id
        and peer.user_id <> v_uid
        and peer.role = 'admin'
        and peer.is_active
    )
  limit 1;

  if v_blocker is not null then
    return jsonb_build_object('ok', false, 'error', format(
      'You are the only administrator of %s. Make someone else an administrator there first, then delete your account.',
      v_blocker));
  end if;

  -- Same argument one level up: the last platform admin cannot delete the console out from
  -- under the company.
  if exists (select 1 from platform_admins where user_id = v_uid)
     and (select count(*) from platform_admins) <= 1 then
    return jsonb_build_object('ok', false, 'error',
      'You are the only platform administrator. Add another one before deleting your account.');
  end if;

  select email into v_email from auth.users where id = v_uid;
  select full_name into v_name from profiles where id = v_uid;
  v_name := coalesce(nullif(btrim(v_name), ''), split_part(coalesce(v_email, ''), '@', 1), 'Deleted user');

  -- Backfill the name snapshot before dropping the id, so nothing that was attributed becomes
  -- anonymous. Rows that already carry a name keep it.
  update issues
     set reporter_name  = coalesce(nullif(btrim(reporter_name), ''), v_name),
         reported_by_id = null
   where reported_by_id = v_uid;

  update pool_chemical_readings
     set logged_by_name = coalesce(nullif(btrim(logged_by_name), ''), v_name),
         logged_by_id   = null
   where logged_by_id = v_uid;

  -- Both activity tables already store user_name NOT NULL, so only the id needs detaching.
  update issue_activity     set user_id = null where user_id = v_uid;
  update checklist_activity set user_id = null where user_id = v_uid;

  -- Open assignments go back to the pool. A departed person holding work is a silent way for
  -- a job to never get done.
  update issues          set assignee_id = null where assignee_id = v_uid;
  update checklist_tasks set assignee_id = null where assignee_id = v_uid;

  update camp_members set invited_by = null where invited_by = v_uid;

  -- These two columns are NOT NULL, so the rows go rather than the reference. Both are
  -- credentials this person issued: an invitation nobody has accepted and a join code still in
  -- circulation would otherwise outlive the account that vouched for them. Any remaining admin
  -- can issue new ones.
  delete from camp_invitations where invited_by = v_uid;
  delete from camp_join_codes  where created_by = v_uid;

  -- Written before the delete because the audit row is the evidence that the erasure was
  -- requested and carried out. The address is retained for exactly that reason.
  insert into audit_log (camp_id, actor_id, actor_email, action, target_table, target_id)
  select m.camp_id, null, v_email, 'account.deleted', 'auth.users', v_uid::text
  from camp_members m
  where m.user_id = v_uid;

  -- Cascades to profiles, camp_members, platform_admins, sessions, identities and MFA factors.
  delete from auth.users where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the calling user''s account and every camp membership. Camp records they created are kept and attributed by name snapshot. Refuses when the caller is the last admin of a camp or the last platform admin.';

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
