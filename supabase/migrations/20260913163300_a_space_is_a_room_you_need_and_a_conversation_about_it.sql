-- Asking for a room was a six-field form, and the answer had nowhere to go.
--
-- A coordinator on a sofa was asked, per room per day: start time, end time, what's happening,
-- how many people, which layout, and any setup notes. Most of that is the camp's guess about
-- what a crew needs, and a group that gives up halfway leaves the crew with nothing at all. The
-- question a camp actually needs answered is "which rooms do you need, and is there anything we
-- should know" -- so that is now the question, once, for the whole stay.
--
-- The other half: an approval or a decline was a one-way message the group could only reply to
-- by ringing the camp. A space is a negotiation ("can we have the Lodge instead?"), so it gets a
-- thread, and the status changes post into it as messages both sides can answer.

-- ── The thread ───────────────────────────────────────────────────────────────
create table if not exists retreat_space_messages (
  id          uuid primary key default gen_random_uuid(),
  camp_id     uuid not null references camps(id) on delete cascade,
  retreat_id  uuid not null references retreats(id) on delete cascade,
  -- Named when the message is about one room. A status message always names one; a free message
  -- usually does not, because "can we swap to the Barn" is about two.
  location_id uuid references locations(id) on delete set null,
  author_kind text not null check (author_kind in ('camp','group','system')),
  author_name text,
  kind        text not null default 'message' check (kind in ('message','status')),
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists space_messages_thread
  on retreat_space_messages (retreat_id, created_at);

alter table retreat_space_messages enable row level security;
drop policy if exists space_messages_read on retreat_space_messages;
create policy space_messages_read on retreat_space_messages
  for select using (is_camp_member(camp_id));
drop policy if exists space_messages_write on retreat_space_messages;
create policy space_messages_write on retreat_space_messages
  for all using (is_camp_member(camp_id) and get_camp_role(camp_id) in ('admin','staff'))
  with check (is_camp_member(camp_id) and get_camp_role(camp_id) in ('admin','staff'));

alter table retreat_space_messages replica identity full;

-- ── Who has read how far ─────────────────────────────────────────────────────
-- Two marks, not a per-message read table: there are exactly two parties, and "is there anything
-- new for me" is the only question either of them asks.
alter table retreats add column if not exists spaces_camp_read_at  timestamptz;
alter table retreats add column if not exists spaces_group_read_at timestamptz;

comment on column retreats.spaces_camp_read_at is
  'How far the CAMP has read the meeting-spaces thread. Unread for the camp = group messages after this.';
comment on column retreats.spaces_group_read_at is
  'How far the GROUP has read it. Unread for the group = camp and system messages after this.';

-- ── The layout is no longer asked for ────────────────────────────────────────
-- Kept as a column so rows filed under the old form keep meaning what they said, but a request
-- filed now leaves it null rather than claiming the group chose "open".
alter table retreat_space_requests alter column layout drop not null;
alter table retreat_space_requests alter column layout drop default;

comment on column retreat_space_requests.layout is
  'Historical. The portal stopped asking in Sep 2026; null means the group was never asked.';
comment on column retreat_space_requests.day_date is
  'First day the group has the room. Since the portal stopped asking about days this is the arrival date, and end_date the departure date.';

-- ── Posting into the thread ──────────────────────────────────────────────────
-- Used by the approve/decline paths, which are SECURITY DEFINER and must not be blocked by the
-- writer's own RLS.
create or replace function public.post_space_message_internal(
  p_camp_id uuid, p_retreat_id uuid, p_location_id uuid,
  p_author_kind text, p_author_name text, p_kind text, p_body text
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if coalesce(btrim(p_body), '') = '' then return null; end if;
  insert into retreat_space_messages (
    camp_id, retreat_id, location_id, author_kind, author_name, kind, body)
  values (p_camp_id, p_retreat_id, p_location_id, p_author_kind,
          nullif(btrim(coalesce(p_author_name, '')), ''), coalesce(p_kind, 'message'),
          left(btrim(p_body), 4000))
  returning id into v_id;

  -- Whoever wrote it has, by definition, read up to it.
  if p_author_kind = 'group' then
    update retreats set spaces_group_read_at = now() where id = p_retreat_id;
  else
    update retreats set spaces_camp_read_at = now() where id = p_retreat_id;
  end if;

  return v_id;
end;
$fn$;

revoke execute on function public.post_space_message_internal(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
