-- SECURITY PHASE 0 — close world-readable auth-table policies.
-- Both were `USING(true)` / `is_active=true` with no role restriction, so the `anon`
-- role could read every camp's join codes (→ join any camp as staff) and every
-- invitation email+token cross-tenant.
--
-- Safe to drop outright: `admins_manage_codes` / `admins_manage_invitations`
-- (FOR ALL USING is_camp_admin(camp_id)) already grant admins SELECT on their own
-- camp's rows, so the settings UIs keep working; and the acceptance paths
-- (join_camp_with_code, accept_invitation) are SECURITY DEFINER and read these
-- tables internally, unaffected by RLS.

drop policy if exists "public_read_active_codes" on public.camp_join_codes;
drop policy if exists "public_read_invitation" on public.camp_invitations;
