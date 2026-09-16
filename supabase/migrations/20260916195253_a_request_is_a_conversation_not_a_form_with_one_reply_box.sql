-- A request is a conversation, not a form with one reply box.
--
-- The group asked something, the camp answered into `response_message`, and that was the end of
-- the exchange: there was physically nowhere for "yes but we need it by Friday" to go. The
-- coordinator's only way to say the next sentence was email, which is exactly the thing this
-- module exists to stop happening.
--
-- The opening ask stays on `retreat_change_requests.body` -- it is the subject line, and moving
-- it would rewrite every summary that reads it. Everything said afterwards is a row here, from
-- either side, in order.

create table if not exists retreat_request_messages (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid not null references camps(id) on delete cascade,
  -- Denormalised from the request so the camp can load a season's threads in one filtered
  -- query, the same shape as every other retreat table the store subscribes to.
  retreat_id   uuid not null references retreats(id) on delete cascade,
  request_id   uuid not null references retreat_change_requests(id) on delete cascade,
  -- Which side of the conversation. Not a user id: the group's side has no account, and the
  -- camp's side is a name typed by whoever was at the desk.
  author       text not null check (author in ('camp', 'group')),
  author_name  text,
  body         text not null check (btrim(body) <> ''),
  created_at   timestamptz not null default now()
);

create index if not exists retreat_request_messages_request_idx
  on retreat_request_messages (request_id, created_at);
create index if not exists retreat_request_messages_camp_idx
  on retreat_request_messages (camp_id, retreat_id);

alter table retreat_request_messages enable row level security;

drop policy if exists members_read_request_messages on retreat_request_messages;
create policy members_read_request_messages on retreat_request_messages
  for select using (is_camp_member(camp_id));

-- The camp writes directly; the group writes through portal_post_request_message, which is
-- SECURITY DEFINER because the portal is anonymous.
drop policy if exists members_write_request_messages on retreat_request_messages;
create policy members_write_request_messages on retreat_request_messages
  for insert with check (is_camp_member(camp_id) and author = 'camp');

-- Who spoke last, and whether anyone still owes an answer.
--
-- `status` stays what it always was: the camp's ruling on the ask (approved / declined /
-- countered). It is not a state machine for the conversation, and using it as one is why a
-- reply to an approved request had nowhere to be counted. `closed_at` is the conversation's
-- own state, and a new message from the group clears it.
alter table retreat_change_requests
  add column if not exists last_message_at   timestamptz,
  add column if not exists last_message_from text,
  add column if not exists closed_at         timestamptz;

comment on column retreat_change_requests.last_message_from is
  'camp | group -- which side spoke last, including the opening ask. Buckets the Requests tab.';
comment on column retreat_change_requests.closed_at is
  'Set when the camp marks the thread finished. Cleared again by any new message from the group.';

-- Every existing request gets the thread it always implied: the opening ask (which stays on the
-- row), then the single reply it was allowed, as a message from the other side.
insert into retreat_request_messages (camp_id, retreat_id, request_id, author, author_name, body, created_at)
select cr.camp_id, cr.retreat_id, cr.id,
       case when cr.origin = 'camp' then 'group' else 'camp' end,
       cr.responded_by,
       cr.response_message,
       coalesce(cr.responded_at, cr.updated_at, cr.created_at)
from retreat_change_requests cr
where coalesce(btrim(cr.response_message), '') <> ''
  and not exists (select 1 from retreat_request_messages m where m.request_id = cr.id);

update retreat_change_requests cr
set last_message_at = coalesce(
      (select max(m.created_at) from retreat_request_messages m where m.request_id = cr.id),
      cr.submitted_at, cr.created_at),
    last_message_from = coalesce(
      (select m.author from retreat_request_messages m
        where m.request_id = cr.id order by m.created_at desc limit 1),
      case when cr.origin = 'camp' then 'camp' else 'group' end),
    -- A request that had already been answered was, in the old one-shot world, finished.
    closed_at = case when cr.responded_at is not null then cr.responded_at else null end
where cr.last_message_at is null;

-- One place that keeps the summary honest, so every writer -- the camp's direct insert, the
-- portal's RPC, and anything added later -- lands the same way.
create or replace function touch_request_thread()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  update retreat_change_requests
     set last_message_at   = new.created_at,
         last_message_from = new.author,
         -- The group speaking again reopens the thread. A camp reply does not, because the camp
         -- closes a thread deliberately rather than by being the last to type.
         closed_at         = case when new.author = 'group' then null else closed_at end,
         updated_at        = now()
   where id = new.request_id;
  return new;
end;
$fn$;

drop trigger if exists touch_request_thread on retreat_request_messages;
create trigger touch_request_thread
  after insert on retreat_request_messages
  for each row execute function touch_request_thread();

-- A brand-new request has no messages yet, but somebody is already waiting on somebody.
create or replace function seed_request_thread()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  new.last_message_at   := coalesce(new.last_message_at, new.submitted_at, now());
  new.last_message_from := coalesce(new.last_message_from,
                                    case when new.origin = 'camp' then 'camp' else 'group' end);
  return new;
end;
$fn$;

drop trigger if exists seed_request_thread on retreat_change_requests;
create trigger seed_request_thread
  before insert on retreat_change_requests
  for each row execute function seed_request_thread();

-- The group's side of the conversation.
--
-- Unlike the old portal_respond_to_request this does not care who raised the thread: a
-- coordinator answering a camp question and a coordinator following up on their own request are
-- the same act, and only one of them used to be possible.
create or replace function portal_post_request_message(
  p_token text,
  p_request_id uuid,
  p_body text,
  p_author_name text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare r retreats; v_id uuid;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then raise exception 'Invalid portal token'; end if;
  if portal_link_expired(r.departure_date) then raise exception 'This portal link has expired.'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'A message is required.'; end if;

  -- Scoped to this booking. Without it a token would post into any camp's thread by id.
  if not exists (select 1 from retreat_change_requests
                  where id = p_request_id and retreat_id = r.id) then
    raise exception 'Request not found';
  end if;

  insert into retreat_request_messages (camp_id, retreat_id, request_id, author, author_name, body)
  values (r.camp_id, r.id, p_request_id, 'group', nullif(btrim(p_author_name), ''), btrim(p_body))
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function portal_post_request_message(text, uuid, text, text) from public;
grant execute on function portal_post_request_message(text, uuid, text, text) to anon, authenticated;

-- Kept working, and now writing into the thread as well.
--
-- It is still the call the portal makes for the FIRST reply to a camp question, because that is
-- also the moment the camp's question stops being unanswered. The message row is what the whole
-- conversation is read from; `response_message` stays in step so the summaries that read it
-- (the camp's Requests list, the portal's own status line) keep saying something true.
create or replace function portal_respond_to_request(
  p_token text, p_request_id uuid, p_body text, p_submitted_by text default null::text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare r retreats; v_origin text;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then raise exception 'Invalid portal token'; end if;
  if portal_link_expired(r.departure_date) then raise exception 'This portal link has expired.'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'A reply is required.'; end if;

  select origin into v_origin
  from retreat_change_requests where id = p_request_id and retreat_id = r.id;
  if v_origin is null then raise exception 'Request not found'; end if;
  if v_origin <> 'camp' then raise exception 'That request is not awaiting your reply.'; end if;

  insert into retreat_request_messages (camp_id, retreat_id, request_id, author, author_name, body)
  values (r.camp_id, r.id, p_request_id, 'group', nullif(btrim(p_submitted_by), ''), btrim(p_body));

  update retreat_change_requests
    set response_message = p_body,
        responded_by = nullif(p_submitted_by, ''),
        responded_at = now(),
        status = 'approved',
        updated_at = now()
    where id = p_request_id;
  return true;
end;
$fn$;

-- Realtime. A table missing from the publication makes its subscription silently never fire,
-- which for a conversation means the camp keeps looking at a screen that says the group has not
-- replied while the reply is already in the database.
alter table retreat_request_messages replica identity full;
do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'retreat_request_messages'
  ) then
    execute 'alter publication supabase_realtime add table retreat_request_messages';
  end if;
end
$do$;
