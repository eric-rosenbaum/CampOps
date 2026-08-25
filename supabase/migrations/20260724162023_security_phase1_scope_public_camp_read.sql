-- SECURITY PHASE 1, stop exposing the whole camps table to anon.
-- The old `anon read camp by slug USING(true)` let any holder of the public anon key read
-- ALL columns of ALL camps (names, street addresses, capacity, module config) cross-tenant.
-- Replace with a SECURITY DEFINER function that returns only the four fields the public
-- report page needs, for the one requested slug.

create or replace function public.get_public_camp(p_slug text)
returns table (id uuid, name text, logo_url text, locations jsonb)
language sql security definer set search_path = public stable as $$
  select c.id, c.name, c.logo_url, c.locations
  from public.camps c
  where c.slug = p_slug
  limit 1;
$$;

revoke execute on function public.get_public_camp(text) from public;
grant  execute on function public.get_public_camp(text) to anon, authenticated;

-- Authenticated members still read their own camp via `members_view_camp` (is_camp_member).
drop policy if exists "anon read camp by slug" on public.camps;
