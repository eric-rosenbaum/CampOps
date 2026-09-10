-- Tagging someone into a work order thread.
--
-- The banner at the top of Campground only lights up for work that is already yours: you are the
-- assignee, or you have said something in the thread. That rule exists so a busy camp does not
-- light up every card, and it is a good rule -- but it leaves no way to pull someone in. The
-- groundskeeper who knows which valve it is never sees the question, because nobody can ask him.
--
-- Mentions are stored as ids rather than parsed back out of the text. A name in prose stops
-- resolving the day somebody is renamed or two Sarahs work the same season; an id is still the
-- person it was. The display name is kept alongside so the message still reads correctly after a
-- rename, and so a mention of someone since removed from the camp does not become a bare uuid.
alter table public.issue_comments
  add column if not exists mentions uuid[] not null default '{}';

comment on column public.issue_comments.mentions is
  'User ids named with @ in this message. Being mentioned puts the thread in your Campground banner even if the work is not yours and you have never posted in it.';

-- The banner reads this per camp; without it, every unread check scans the camp's whole comment
-- history to find the handful naming you.
create index if not exists issue_comments_mentions_idx
  on public.issue_comments using gin (mentions);
