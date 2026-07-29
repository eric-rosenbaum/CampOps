-- Soft-delete a camp with a 30-day recovery window; a nightly job hard-deletes after that
-- (ON DELETE CASCADE cleans all camp-scoped data). Platform-admin only.
ALTER TABLE camps ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.soft_delete_camp(p_camp_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Only platform admins can delete camps'; END IF;
    UPDATE camps SET deleted_at = now(), updated_at = now() WHERE id = p_camp_id;
  END;
$$;
CREATE OR REPLACE FUNCTION public.restore_camp(p_camp_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Only platform admins can restore camps'; END IF;
    UPDATE camps SET deleted_at = NULL, updated_at = now() WHERE id = p_camp_id;
  END;
$$;
CREATE OR REPLACE FUNCTION public.purge_deleted_camps()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM camps WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
$$;
REVOKE EXECUTE ON FUNCTION public.soft_delete_camp(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_camp(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_deleted_camps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_camp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_camp(uuid) TO authenticated;
SELECT cron.schedule('purge-deleted-camps', '30 8 * * *', $$SELECT public.purge_deleted_camps();$$);
