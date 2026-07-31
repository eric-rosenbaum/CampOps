-- Platform admins support/impersonate camps they aren't members of, so the "shared-camp" profile
-- read rule hid other members' names from them (shown as "Unknown"). Add a platform-admin bypass,
-- consistent with is_camp_member/is_camp_admin already bypassing for founders.
DROP POLICY IF EXISTS profile_select ON public.profiles;
CREATE POLICY profile_select ON public.profiles FOR SELECT USING (
  id = auth.uid()
  OR is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM camp_members cm1
    JOIN camp_members cm2 ON cm1.camp_id = cm2.camp_id
    WHERE cm1.user_id = auth.uid()
      AND cm2.user_id = profiles.id
      AND cm1.is_active = true
      AND cm2.is_active = true
  )
);
