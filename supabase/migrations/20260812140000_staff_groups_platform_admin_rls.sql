-- staff_groups: use the tenancy helpers instead of an inlined membership check.
--
-- Every other table in the schema authorizes through is_camp_member() / is_camp_admin(),
-- and both helpers begin with `is_platform_admin() OR ...`. That is how a founder viewing
-- a camp they don't belong to gets admin rights. staff_groups was the single holdout: its
-- policies predate those helpers and were transcribed verbatim from the live database in
-- 20260709232544_staff_groups_backfill.sql to avoid silently changing authorization.
--
-- The effect was a platform admin could SELECT nothing and INSERT/UPDATE/DELETE nothing on
-- staff_groups unless they happened to hold a literal camp_members row with role='admin'.
-- Creating a staff group from Settings → Team failed the WITH CHECK and returned an RLS
-- violation. This aligns staff_groups with the rest of the schema; it grants platform admins
-- nothing they don't already have on every other table.

DROP POLICY IF EXISTS "staff_groups_select" ON public.staff_groups;
CREATE POLICY "staff_groups_select" ON public.staff_groups
  FOR SELECT
  USING (public.is_camp_member(camp_id));

DROP POLICY IF EXISTS "staff_groups_admin_write" ON public.staff_groups;
CREATE POLICY "staff_groups_admin_write" ON public.staff_groups
  FOR ALL
  USING (public.is_camp_admin(camp_id))
  WITH CHECK (public.is_camp_admin(camp_id));
