-- Public report form now offers locations from the unified tree (id + name), not the old
-- camps.locations string array.
create or replace function public.get_public_camp(p_slug text)
returns table (id uuid, name text, logo_url text, locations jsonb)
language sql security definer set search_path = public stable as $$
  select c.id, c.name, c.logo_url,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.sort_order, l.name)
      from public.locations l where l.camp_id = c.id and l.is_active
    ), '[]'::jsonb)
  from public.camps c
  where c.slug = p_slug
  limit 1;
$$;
revoke execute on function public.get_public_camp(text) from public;
grant  execute on function public.get_public_camp(text) to anon, authenticated;
