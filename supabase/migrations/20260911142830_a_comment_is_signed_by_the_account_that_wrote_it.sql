-- A thread was showing names the camp could not account for.
--
-- `issue_comments.author_name` is a free-text string the CLIENT supplies at post time. Nothing
-- checked it against the account doing the posting, so the displayed name and the actual author
-- could be anything with respect to each other. Of the five comments on this database, three
-- disagreed: one signed "Camp office" and one signed "Housekeeping" were both written from real
-- staff accounts, and a third stored a person's profile name while the camp knows them by a
-- different display name.
--
-- Only the first two came from seeding. The third is what ordinary use does on its own, which is
-- the reason this is a schema fix and not a delete statement: a camp cannot be expected to
-- reconcile a name that no screen in the product will ever show them again.
--
-- The fix is that the ACCOUNT signs the comment, not the string. A name still lives on the row --
-- it has to, for authors with no account and for people who later leave the camp -- but it stops
-- being something a caller can assert.

create or replace function public.comment_is_signed_by_its_author()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_name text;
begin
  -- No account means a genuine outside author: the public reporter who scanned a QR sticker, or
  -- the product itself posting a system note. Those keep the name they were given -- there is no
  -- account to check them against, and that is exactly when the UI must say so rather than
  -- rendering a bare name that reads like staff.
  if new.author_id is null then
    new.author_name := coalesce(nullif(btrim(new.author_name), ''), 'CampCommand');
    return new;
  end if;

  -- Otherwise the name is not the caller's to choose. Whatever they sent is replaced with what
  -- this camp calls that person: their display name here, else the name on their profile.
  select coalesce(nullif(btrim(m.display_name), ''), nullif(btrim(p.full_name), ''))
    into v_name
    from public.camp_members m
    left join public.profiles p on p.id = m.user_id
   where m.camp_id = new.camp_id and m.user_id = new.author_id
   limit 1;

  if v_name is null then
    select nullif(btrim(p.full_name), '') into v_name
      from public.profiles p where p.id = new.author_id;
  end if;

  new.author_name := coalesce(v_name, 'Someone');
  return new;
end;
$fn$;

drop trigger if exists comment_is_signed_by_its_author_trg on public.issue_comments;
create trigger comment_is_signed_by_its_author_trg
  before insert or update of author_id, author_name on public.issue_comments
  for each row execute function public.comment_is_signed_by_its_author();

-- Correct what is already stored, so the existing threads stop misattributing themselves. Rows
-- with no account are left exactly as they are.
update public.issue_comments c
   set author_name = coalesce(
         nullif(btrim(m.display_name), ''),
         nullif(btrim(p.full_name), ''),
         c.author_name)
  from public.camp_members m
  left join public.profiles p on p.id = m.user_id
 where c.author_id is not null
   and m.camp_id = c.camp_id
   and m.user_id = c.author_id
   and c.author_name is distinct from coalesce(
         nullif(btrim(m.display_name), ''),
         nullif(btrim(p.full_name), ''),
         c.author_name);

comment on column public.issue_comments.author_name is
  'Who wrote this, as the camp knows them. Set by trigger from author_id -- NOT accepted from the client, because an unchecked name is how a thread ends up signed by somebody the camp has no record of. Meaningful on its own only when author_id is null (a public reporter, or a system note).';
