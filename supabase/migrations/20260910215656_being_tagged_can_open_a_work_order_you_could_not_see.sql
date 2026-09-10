-- Tagging someone who cannot see the work order.
--
-- The board shows a staff member their own work, plus -- if their crew allows it -- whatever is
-- unassigned. A crew set to "own work only" sees nothing else. So you could name that person in a
-- thread, they would get the banner, click it, and find nothing: the message arrived and the work
-- it was about did not.
--
-- Rather than quietly widen the rule for everyone, the person doing the tagging is asked. If they
-- say yes, a row lands here and that ONE work order becomes visible to that ONE person. The crew
-- setting is untouched and everything else stays hidden.
--
-- This is a deliberate, recorded exception, which is why it is a table and not a boolean: who
-- opened what to whom, and when, is the sort of thing a camp will eventually want to answer.
create table if not exists public.issue_viewers (
  camp_id    uuid not null references public.camps(id)  on delete cascade,
  issue_id   uuid not null references public.issues(id) on delete cascade,
  user_id    uuid not null references auth.users(id)    on delete cascade,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);

create index if not exists issue_viewers_user_idx on public.issue_viewers (camp_id, user_id);

comment on table public.issue_viewers is
  'People given sight of one specific work order because they were tagged into its thread. Narrower than a permission: it grants this row and nothing else, and does not change their crew setting.';

alter table public.issue_viewers enable row level security;

-- Anyone in the camp may read these: the board needs to know which extra rows to show you, and
-- knowing that somebody was let in on a work order is not itself sensitive.
drop policy if exists issue_viewers_read on public.issue_viewers;
create policy issue_viewers_read on public.issue_viewers
  for select using (is_camp_member(camp_id));

-- Granting requires being able to see the work order yourself, which every camp member can do at
-- the RLS level -- the narrowing is in the UI. You cannot grant on another camp's work.
drop policy if exists issue_viewers_write on public.issue_viewers;
create policy issue_viewers_write on public.issue_viewers
  for all using (is_camp_member(camp_id)) with check (is_camp_member(camp_id));

grant select, insert, delete on public.issue_viewers to authenticated;

-- The board reads this on every load; without it each check scans the camp's grants.
alter publication supabase_realtime add table public.issue_viewers;
