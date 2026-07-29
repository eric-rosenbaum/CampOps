-- Lock platform-admin/cron functions from the implicit PUBLIC grant (REVOKE FROM anon alone
-- doesn't remove it). clone_camp/provision_camp self-check is_platform_admin(); expire_trials is cron-only.
REVOKE EXECUTE ON FUNCTION public.clone_camp(uuid,text,text,int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_camp(text,text,text,text,uuid,int,text,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clone_camp(uuid,text,text,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_camp(text,text,text,text,uuid,int,text,text,jsonb) TO authenticated;
