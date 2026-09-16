-- Staging-only QA fixture for the Playwright journeys: one trial camp ("Prospect QA", Toronto
-- time) cloned from Pine Ridge, and six password logins on @example.com (never receives mail).
-- Idempotent: re-running resets the passwords and memberships but does not re-clone.
-- __PASSWORD__ is substituted by e2e/setup-qa-camp.sh from .env.e2e; never commit a password.
do $$
declare v_camp uuid; v_pw text := crypt('__PASSWORD__', gen_salt('bf'));
  r record;
begin
  if current_setting('server_version') is null then return; end if;
  select id into v_camp from camps where slug = 'prospect-qa' and deleted_at is null;
  if v_camp is null then
    perform set_config('request.jwt.claims', json_build_object('sub','bbbbbbbb-0000-4000-8000-000000000001','role','authenticated')::text, true);
    v_camp := clone_camp('33333333-3333-4333-8333-333333333333', 'Prospect QA', 'trial', null);
  end if;
  update camps set timezone='America/Toronto', slug='prospect-qa', state='ON', country='CA', trial_ends_at = null,
    modules = '{"issues":true,"safety":true,"assets":true,"building":true,"commissary":true,"pool":true,"retreats":true,"trips":true,"receipts":true}',
    platform_modules = '{"issues":true,"safety":true,"assets":true,"building":true,"commissary":true,"pool":true,"retreats":true,"trips":true,"receipts":true}'
  where id = v_camp;

  for r in select * from (values
    ('e2e00000-0000-4000-8000-00000000000a'::uuid,'qa-admin@example.com','Teddy Admin','admin'),
    ('e2e00000-0000-4000-8000-00000000000b'::uuid,'qa-kitchen@example.com','Kim Kitchen','staff'),
    ('e2e00000-0000-4000-8000-00000000000c'::uuid,'qa-program@example.com','Priya Program','staff'),
    ('e2e00000-0000-4000-8000-00000000000d'::uuid,'qa-holder@example.com','Hana Holder','staff'),
    ('e2e00000-0000-4000-8000-00000000000e'::uuid,'qa-holder2@example.com','Omar Holder','staff'),
    ('e2e00000-0000-4000-8000-00000000000f'::uuid,'qa-viewer@example.com','Val Viewer','viewer')) t(id,email,name,role)
  loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (r.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', r.email, v_pw, now(),
      '','','','', '{"provider":"email","providers":["email"]}', json_build_object('full_name', r.name), now(), now())
    on conflict (id) do update set encrypted_password = excluded.encrypted_password;
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    select gen_random_uuid(), r.id, r.id::text, 'email', json_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true), now(), now(), now()
    where not exists (select 1 from auth.identities i where i.user_id = r.id and i.provider = 'email');
    insert into profiles (id, full_name) values (r.id, r.name) on conflict (id) do update set full_name = excluded.full_name;
    if exists (select 1 from camp_members where camp_id = v_camp and user_id = r.id) then
      update camp_members set role = r.role, display_name = r.name, is_active = true where camp_id = v_camp and user_id = r.id;
    else
      insert into camp_members (camp_id, user_id, role, display_name, is_active) values (v_camp, r.id, r.role, r.name, true);
    end if;
  end loop;

  -- A founder (platform admin, member of no camp) and a visitor (member of no camp) for the demo
  -- journey: the founder spins up a demo in /admin, the visitor opens its /try/ link. Staging
  -- has anonymous sign-ins off, and /try/ reuses an existing session, so a signed-in visitor
  -- walks the same join-and-land path a prospect does.
  for r in select * from (values
    ('e2e00000-0000-4000-8000-000000000010'::uuid,'qa-founder@example.com','Fran Founder'),
    ('e2e00000-0000-4000-8000-000000000011'::uuid,'qa-visitor@example.com','Vic Visitor')) t(id,email,name)
  loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (r.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', r.email, v_pw, now(),
      '','','','', '{"provider":"email","providers":["email"]}', json_build_object('full_name', r.name), now(), now())
    on conflict (id) do update set encrypted_password = excluded.encrypted_password;
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    select gen_random_uuid(), r.id, r.id::text, 'email', json_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true), now(), now(), now()
    where not exists (select 1 from auth.identities i where i.user_id = r.id and i.provider = 'email');
    insert into profiles (id, full_name) values (r.id, r.name) on conflict (id) do update set full_name = excluded.full_name;
  end loop;
  insert into platform_admins (user_id) values ('e2e00000-0000-4000-8000-000000000010') on conflict do nothing;
end $$;
select id, name, slug, share_token, timezone from camps where slug = 'prospect-qa';
