-- Frictionless demo access: a shareable, non-email-locked link that lets a prospect's whole team
-- into ONE isolated demo camp (account_type='trial') via anonymous sign-in. Each demo is its own
-- camp (already RLS-isolated), so prospects never see each other's data.

-- 1. Per-camp share token. clone_camp/provision_camp insert explicit column lists that omit
--    share_token, so the DEFAULT gives every new (and cloned) camp a fresh unique token.
ALTER TABLE camps ADD COLUMN IF NOT EXISTS share_token text;
UPDATE camps SET share_token = replace(gen_random_uuid()::text, '-', '') WHERE share_token IS NULL;
ALTER TABLE camps ALTER COLUMN share_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS camps_share_token_key ON camps(share_token);

-- 2. Join a demo by its token. Called after signInAnonymously(). Only ever grants access to a
--    single trial camp; hard-refuses non-trial camps, expired/suspended/deleted demos.
CREATE OR REPLACE FUNCTION public.join_demo_with_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_camp camps;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('error', 'Not signed in.'); END IF;

  SELECT * INTO v_camp FROM camps WHERE share_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'This demo link isn''t valid.'); END IF;
  IF v_camp.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('error', 'This demo is no longer available.'); END IF;
  IF v_camp.account_type <> 'trial' THEN RETURN jsonb_build_object('error', 'This link is not a demo link.'); END IF;
  IF v_camp.status <> 'active'
     OR (v_camp.trial_ends_at IS NOT NULL AND v_camp.trial_ends_at < now()) THEN
    RETURN jsonb_build_object('error', 'This demo has expired.');
  END IF;

  INSERT INTO camp_members (camp_id, user_id, role, is_active, display_name)
  VALUES (v_camp.id, auth.uid(), 'admin', true, 'Demo guest')
  ON CONFLICT (camp_id, user_id) DO UPDATE SET is_active = true;

  RETURN jsonb_build_object('camp_id', v_camp.id, 'camp_name', v_camp.name);
END $$;
REVOKE ALL ON FUNCTION public.join_demo_with_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.join_demo_with_token(text) TO authenticated;

-- 3. Get (or lazily create) a demo camp's share link. Platform-admin only.
CREATE OR REPLACE FUNCTION public.demo_share_link(p_camp_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT share_token INTO v_token FROM camps WHERE id = p_camp_id;
  IF v_token IS NULL THEN
    v_token := replace(gen_random_uuid()::text, '-', '');
    UPDATE camps SET share_token = v_token WHERE id = p_camp_id;
  END IF;
  RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION public.demo_share_link(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.demo_share_link(uuid) TO authenticated;

-- 4. Invariant: an anonymous (demo-guest) account can ONLY be a member of a demo camp. Blocks any
--    path that would attach an anon user to a real customer/internal camp.
CREATE OR REPLACE FUNCTION public.enforce_anon_demo_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_anon boolean; v_type text;
BEGIN
  SELECT is_anonymous INTO v_is_anon FROM auth.users WHERE id = NEW.user_id;
  IF COALESCE(v_is_anon, false) THEN
    SELECT account_type INTO v_type FROM camps WHERE id = NEW.camp_id;
    IF v_type IS DISTINCT FROM 'trial' THEN
      RAISE EXCEPTION 'Anonymous demo users can only join demo camps';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_anon_demo_only ON camp_members;
CREATE TRIGGER trg_enforce_anon_demo_only
  BEFORE INSERT OR UPDATE ON camp_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_anon_demo_only();

-- 5. Nightly cleanup: anonymous demo guests are throwaway. Delete ones older than 40 days (demos
--    run 30). Deleting from auth.users cascades their camp_members rows.
CREATE OR REPLACE FUNCTION public.purge_anonymous_demo_users()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM auth.users
  WHERE is_anonymous = true
    AND created_at < now() - interval '40 days';
END $$;
REVOKE ALL ON FUNCTION public.purge_anonymous_demo_users() FROM public, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('purge-anonymous-demo-users');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('purge-anonymous-demo-users', '15 8 * * *', $$SELECT public.purge_anonymous_demo_users();$$);

-- 6. Anonymous users have no email, so the new-user trigger's email-derived full_name would be
--    NULL and violate profiles.full_name NOT NULL, which would make signInAnonymously() itself
--    fail. Give any nameless/emailless account a safe fallback.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Demo guest'
    )
  );
  RETURN NEW;
END;
$function$;
