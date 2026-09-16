-- The module switches every camp is carrying were never a camp's choice.
--
-- The previous migration preserved them, on the reading that "enable only the modules your camp
-- uses" had been answered. Reading `provision_camp` and `create_camp` says otherwise: both seed
--   {"issues":true,"pool":false,"staff":true,"checklists":true,"safety":true,
--    "kitchen":false,"drills":false,"assets":false}
-- into every camp at creation. That is where `pool:false` and `assets:false` came from on camps
-- that have a pool and a fleet -- nobody was asked, and because the column has never been read
-- by the app, no camp has ever seen the consequence either.
--
-- So: start everyone from on. Now that the switches work, a camp turning one off is a decision
-- somebody actually made, which is the only kind worth honouring.
update camps set modules = jsonb_build_object(
  'issues', true, 'pool', true, 'safety', true, 'assets', true,
  'building', true, 'commissary', true, 'retreats', true
);

-- And stop minting new camps with three modules hidden.
--
-- Both bodies are otherwise `pg_get_functiondef` of the live functions, edited only where the
-- default jsonb literal is built.
CREATE OR REPLACE FUNCTION public.provision_camp(p_name text, p_slug text, p_account_type text DEFAULT 'customer'::text, p_plan text DEFAULT NULL::text, p_org_id uuid DEFAULT NULL::uuid, p_trial_days integer DEFAULT NULL::integer, p_camp_type text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_modules jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE v_id uuid; v_modules jsonb;
  BEGIN
    IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Only platform admins can provision camps'; END IF;
    v_modules := COALESCE(p_modules, '{"issues":true,"pool":true,"safety":true,"assets":true,"building":true,"commissary":true,"retreats":true}'::jsonb);
    INSERT INTO camps (name, slug, camp_type, state, modules, account_type, status, plan, org_id, trial_ends_at, provisioned_by, provisioned_at)
    VALUES (p_name, p_slug, p_camp_type, p_state, v_modules, p_account_type, 'active', p_plan, p_org_id,
      CASE WHEN p_trial_days IS NOT NULL THEN now() + make_interval(days => p_trial_days) ELSE NULL END, auth.uid(), now())
    RETURNING id INTO v_id;
    RETURN v_id;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.create_camp(p_name text, p_slug text, p_camp_type text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_modules jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE v_camp_id uuid; v_modules jsonb;
  BEGIN
    IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Only CampCommand platform admins can create camps'; END IF;
    v_modules := COALESCE(p_modules, '{"issues":true,"pool":true,"safety":true,"assets":true,"building":true,"commissary":true,"retreats":true}'::jsonb);
    INSERT INTO camps (name, slug, camp_type, state, modules) VALUES (p_name, p_slug, p_camp_type, p_state, v_modules) RETURNING id INTO v_camp_id;
    INSERT INTO camp_members (camp_id, user_id, role) VALUES (v_camp_id, auth.uid(), 'admin');
    RETURN v_camp_id;
  END;
$function$;
