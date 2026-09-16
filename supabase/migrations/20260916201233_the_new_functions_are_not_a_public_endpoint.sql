-- Supabase's default privileges grant EXECUTE on every new function to `anon` and
-- `authenticated`, which means each one is also a POST endpoint at /rest/v1/rpc/<name>.
--
-- `revoke ... from public` in the migrations that created these did not cover it: the grants to
-- those two roles are explicit, not inherited from PUBLIC.
--
-- The three trigger functions should not be callable at all, and the founder-only writer should
-- not be reachable by a signed-out caller. `admin_set_camp_modules` refuses anyone who is not a
-- platform admin either way -- this just stops it being a door to knock on.
--
-- Revoking is safe for the triggers: Postgres checks EXECUTE on a trigger function when the
-- trigger is CREATED, not each time it fires.
revoke execute on function guard_platform_modules() from anon, authenticated;
revoke execute on function touch_request_thread() from anon, authenticated;
revoke execute on function seed_request_thread() from anon, authenticated;
revoke execute on function admin_set_camp_modules(uuid, jsonb, jsonb) from anon;
