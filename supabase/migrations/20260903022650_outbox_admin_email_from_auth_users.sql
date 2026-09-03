-- plan_retreat_messages() looked the camp's own address up as profiles.email, a column that does
-- not exist on this schema (profiles is id, full_name, avatar_url, created_at, updated_at). Every
-- call therefore raised 42703 before queueing a single message, so the whole notification outbox
-- was dead for any camp with a dated retreat.
--
-- Supabase keeps the address on auth.users, which is where the rest of this codebase reads it
-- (admin_list_camp_accounts, platform_admin_management, delete_my_account). Patch just that one
-- lookup and leave the rest of the body untouched.
do $$
declare
  before_src text;
  after_src  text;
begin
  if to_regprocedure('public.plan_retreat_messages(uuid)') is null then
    raise notice 'plan_retreat_messages(uuid) not present; nothing to patch';
    return;
  end if;

  before_src := pg_get_functiondef('public.plan_retreat_messages(uuid)'::regprocedure);
  after_src  := replace(
    before_src,
    'select p.email from camp_members m join profiles p on p.id = m.user_id',
    'select u.email::text from camp_members m join auth.users u on u.id = m.user_id');

  if after_src = before_src then
    if before_src like '%auth.users u on u.id = m.user_id%' then
      raise notice 'plan_retreat_messages already reads auth.users; nothing to patch';
      return;
    end if;
    raise exception 'plan_retreat_messages: expected profiles.email lookup not found, refusing to guess';
  end if;

  execute after_src;
end $$;
