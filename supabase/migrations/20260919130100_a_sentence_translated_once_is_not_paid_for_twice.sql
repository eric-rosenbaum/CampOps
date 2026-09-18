-- A sentence translated once is not paid for twice.
--
-- Routines generate the same checklist on every work order they make — "Check the smoke
-- detector", "Test the GFCI outlet" — and each generated item is its own row with its own queue
-- job. Translated one row at a time, a nightly routine run was dozens of model calls that all
-- returned the same answer. translate-content now asks this first: has this camp already
-- translated exactly this text into these languages? If so the rows are copied, not re-made.
--
-- It matches on md5(source_text) so the lookup rides content_translations_reuse; a b-tree on the
-- raw text would have refused any description longer than a b-tree page. The equality on the
-- text itself stays, because a hash match is a hint and not an answer.
create or replace function public.reusable_translations(p_camp_id uuid, p_texts text[])
returns setof public.content_translations
language sql stable security definer set search_path = public as $fn$
  select t.*
    from content_translations t
   where t.camp_id = p_camp_id
     and md5(t.source_text) = any (select md5(x) from unnest(p_texts) x)
     and t.source_text = any (p_texts);
$fn$;

revoke execute on function public.reusable_translations(uuid, text[]) from public, anon, authenticated;
grant execute on function public.reusable_translations(uuid, text[]) to service_role;
