-- Talking on a work order, and the checklist that makes housekeeping a real lane.
--
-- issue_activity is an append-only log of system events. There was no human message, no photo on
-- a message, and no read state -- so the crew coordinated on text messages that nobody could
-- find three weeks later.
--
-- The design decision that matters more than the table: activity events and human messages
-- render as ONE timeline. A "History" tab beside a "Comments" tab is exactly the interface where
-- messages go to be missed, and a message nobody reads is worse than no messaging at all.

create table if not exists issue_comments (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid not null references camps(id) on delete cascade,
  issue_id     uuid not null references issues(id) on delete cascade,
  -- Null author means the public reporter: somebody who filed through a sticker and has no
  -- account. The name is a snapshot because there is no row to join to.
  author_id    uuid,
  author_name  text not null,
  body         text not null,
  photo_urls   text[] not null default '{}',
  -- "Here's what it looks like now" and "here's the part I need" are the two most useful photos
  -- in the life of a work order, and neither is the one taken at reporting time.
  visible_to_reporter boolean not null default false,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  deleted_at   timestamptz
);
create index if not exists issue_comments_issue_idx on issue_comments (issue_id, created_at);
create index if not exists issue_comments_camp_idx  on issue_comments (camp_id, created_at desc);

comment on column issue_comments.visible_to_reporter is
  'Off by default. A camp talking to itself on a work order must not accidentally publish that to whoever scanned the sticker.';

alter table issue_comments enable row level security;
drop policy if exists issue_comments_read on issue_comments;
create policy issue_comments_read on issue_comments for select using (is_camp_member(camp_id));
drop policy if exists issue_comments_write on issue_comments;
create policy issue_comments_write on issue_comments for insert
  with check (is_camp_member(camp_id) and get_camp_role(camp_id) in ('admin','staff'));
drop policy if exists issue_comments_edit on issue_comments;
create policy issue_comments_edit on issue_comments for update
  using (is_camp_admin(camp_id) or author_id = auth.uid())
  with check (is_camp_admin(camp_id) or author_id = auth.uid());
drop policy if exists issue_comments_delete on issue_comments;
create policy issue_comments_delete on issue_comments for delete
  using (is_camp_admin(camp_id) or author_id = auth.uid());

alter table issue_comments replica identity full;

-- Read state. A comment thread nobody is told about gets used twice and abandoned, so the
-- minimum viable notification is an unread dot on the card and a count on the assignee's home.
create table if not exists issue_comment_reads (
  issue_id     uuid not null references issues(id) on delete cascade,
  user_id      uuid not null,
  camp_id      uuid not null references camps(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);

alter table issue_comment_reads enable row level security;
drop policy if exists issue_comment_reads_own on issue_comment_reads;
create policy issue_comment_reads_own on issue_comment_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_camp_member(camp_id));

alter table issue_comment_reads replica identity full;

-- How many work orders assigned to me have something I have not read.
create or replace function public.unread_work_messages(p_camp_id uuid)
returns integer language sql stable security definer set search_path = public as $fn$
  select count(distinct c.issue_id)::int
  from issue_comments c
  join issues i on i.id = c.issue_id
  left join issue_comment_reads r on r.issue_id = c.issue_id and r.user_id = auth.uid()
  where c.camp_id = p_camp_id
    and c.deleted_at is null
    and c.author_id is distinct from auth.uid()
    and i.assignee_id = auth.uid()
    and i.status <> 'resolved'
    and (r.last_read_at is null or c.created_at > r.last_read_at);
$fn$;

-- Closing the loop with the reporter -------------------------------------------
-- A counselor who filed through a sticker never hears what happened, which is the loudest
-- complaint about every open-reporting system. One token per issue, handed back on the success
-- screen; it opens a read-only status page and nothing else.
alter table issues add column if not exists reporter_token text;

create or replace function public.gen_reporter_token()
returns text language sql volatile set search_path = public as $fn$
  select translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_');
$fn$;

update issues set reporter_token = public.gen_reporter_token()
  where reporter_token is null and is_public_report;
alter table issues alter column reporter_token set default public.gen_reporter_token();
create unique index if not exists issues_reporter_token_key on issues(reporter_token) where reporter_token is not null;

-- Everything a reporter is allowed to learn from their own receipt: what they said, where it
-- stands, and any reply the camp deliberately marked visible. Never the assignee, never the
-- cost, never another report.
create or replace function public.get_public_report_status(p_token text)
returns jsonb language sql security definer stable set search_path = public as $fn$
  select case when i.id is null then null else jsonb_build_object(
    'title', i.title,
    'status', i.status,
    'reported_at', i.created_at,
    'resolved_at', i.resolved_at,
    'location', coalesce(i.locations[1], null),
    'camp_name', c.name,
    'replies', coalesce((
      select jsonb_agg(jsonb_build_object('body', k.body, 'at', k.created_at, 'from', k.author_name)
                        order by k.created_at)
      from issue_comments k
      where k.issue_id = i.id and k.visible_to_reporter and k.deleted_at is null
    ), '[]'::jsonb)
  ) end
  from issues i join camps c on c.id = i.camp_id
  where i.reporter_token = p_token and i.is_public_report
  limit 1;
$fn$;

revoke execute on function public.get_public_report_status(text) from public;
grant execute on function public.get_public_report_status(text) to anon, authenticated;

-- Checklists -------------------------------------------------------------------
-- "Turn over Cabin 7" is not a task, it is eleven steps, and the value is in knowing which of
-- the eleven got done. This is what makes housekeeping a real lane rather than a blue issue.
--
-- Template items live as jsonb (matching how retreat invoice lines are already stored) because
-- nothing ever queries an individual template step. The instances are rows, because each one is
-- separately checkable by a named person at a known time.
create table if not exists work_checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  camp_id    uuid not null references camps(id) on delete cascade,
  name       text not null,
  trade      text not null default 'housekeeping',
  items      jsonb not null default '[]'::jsonb,   -- [{ text, note?, requires_photo? }]
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_checklist_templates_camp_idx on work_checklist_templates (camp_id, is_active);

create table if not exists issue_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  camp_id    uuid not null references camps(id) on delete cascade,
  issue_id   uuid not null references issues(id) on delete cascade,
  position   integer not null default 0,
  text       text not null,
  note       text,
  requires_photo boolean not null default false,
  is_done    boolean not null default false,
  done_by    uuid,
  done_by_name text,
  done_at    timestamptz,
  photo_url  text,
  created_at timestamptz not null default now()
);
create index if not exists issue_checklist_items_issue_idx on issue_checklist_items (issue_id, position);

alter table work_checklist_templates enable row level security;
drop policy if exists work_checklist_templates_read on work_checklist_templates;
create policy work_checklist_templates_read on work_checklist_templates for select using (is_camp_member(camp_id));
drop policy if exists work_checklist_templates_write on work_checklist_templates;
create policy work_checklist_templates_write on work_checklist_templates
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

alter table issue_checklist_items enable row level security;
drop policy if exists issue_checklist_items_rw on issue_checklist_items;
create policy issue_checklist_items_rw on issue_checklist_items
  for all using (is_camp_member(camp_id))
  with check (is_camp_member(camp_id) and get_camp_role(camp_id) in ('admin','staff'));

alter table work_checklist_templates replica identity full;
alter table issue_checklist_items   replica identity full;

-- Ticking the last step closes the work order, so the checklist does not add a second closing
-- action. A step that comes back unticked reopens it -- otherwise "done" would be a one-way
-- door that survives someone noticing the beds were never made.
create or replace function public.checklist_close_issue()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_open int;
begin
  select count(*) into v_open from issue_checklist_items
   where issue_id = new.issue_id and not is_done;

  if v_open = 0 then
    update issues set status = 'resolved', updated_at = now()
     where id = new.issue_id and status <> 'resolved';
  elsif new.is_done = false and old.is_done = true then
    update issues set status = 'in_progress', updated_at = now()
     where id = new.issue_id and status = 'resolved';
  end if;
  return new;
end;
$fn$;

drop trigger if exists checklist_close_issue_trg on issue_checklist_items;
create trigger checklist_close_issue_trg after update of is_done on issue_checklist_items
  for each row execute function public.checklist_close_issue();

-- Copy a template onto a work order. Idempotent: applying twice does not duplicate steps.
create or replace function public.apply_checklist_template(p_issue_id uuid, p_template_id uuid)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_camp uuid; v_items jsonb; v_n int := 0; v_existing int;
begin
  select camp_id into v_camp from issues where id = p_issue_id;
  if v_camp is null then raise exception 'No such work order.'; end if;
  if not is_camp_member(v_camp) then raise exception 'Forbidden'; end if;

  select count(*) into v_existing from issue_checklist_items where issue_id = p_issue_id;
  if v_existing > 0 then return 0; end if;

  select items into v_items from work_checklist_templates
   where id = p_template_id and camp_id = v_camp;
  if v_items is null then raise exception 'No such checklist for this camp.'; end if;

  insert into issue_checklist_items (camp_id, issue_id, position, text, note, requires_photo)
  select v_camp, p_issue_id, (ord - 1)::int,
         it->>'text', nullif(it->>'note',''), coalesce((it->>'requires_photo')::boolean, false)
  from jsonb_array_elements(v_items) with ordinality as t(it, ord)
  where coalesce(it->>'text','') <> '';

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

-- The starter set. Six checklists is worth more than the feature itself, because it encodes what
-- a well-run camp does and most camps are running it out of one person's head. Camps edit them.
insert into work_checklist_templates (camp_id, name, trade, items)
select c.id, t.name, t.trade, t.items::jsonb
from camps c
cross join (values
  ('Cabin turnover', 'housekeeping', '[
     {"text":"Strip all beds and bag the linens"},
     {"text":"Wipe down bunks, sills and shelves"},
     {"text":"Sweep and mop the floor"},
     {"text":"Empty and reline the bins"},
     {"text":"Check every window screen for tears","note":"The most common thing a group reports"},
     {"text":"Check the lights and replace any dead bulbs"},
     {"text":"Restock toilet paper and hand soap"},
     {"text":"Clean the bathroom and shower"},
     {"text":"Make up the beds","requires_photo":true},
     {"text":"Prop the door and leave the key in the box"},
     {"text":"Log anything broken as its own work order"}]'),
  ('Bathhouse daily', 'housekeeping', '[
     {"text":"Clean all toilets and urinals"},
     {"text":"Clean the sinks and mirrors"},
     {"text":"Clean the showers and drains"},
     {"text":"Mop the floor"},
     {"text":"Restock paper and soap"},
     {"text":"Empty the bins"},
     {"text":"Check for leaks and running fixtures"}]'),
  ('Program space reset', 'housekeeping', '[
     {"text":"Stack or arrange seating to the requested layout"},
     {"text":"Wipe down tables"},
     {"text":"Sweep the floor"},
     {"text":"Reset AV and lights to default"},
     {"text":"Empty the bins"},
     {"text":"Return anything borrowed to its home"}]'),
  ('Vehicle pre-trip', 'maintenance', '[
     {"text":"Walk-around: tires, lights, glass, body damage"},
     {"text":"Check the oil and coolant"},
     {"text":"Check the fuel level"},
     {"text":"Record the odometer or hour meter","note":"Meter routines read this"},
     {"text":"First aid kit and fire extinguisher present"},
     {"text":"Registration and insurance in the glovebox"}]'),
  ('Cabin opening', 'maintenance', '[
     {"text":"Open the water and check for burst lines"},
     {"text":"Test every outlet and light"},
     {"text":"Check smoke and CO alarms, replace batteries"},
     {"text":"Check screens, doors and locks"},
     {"text":"Sweep out and check for animal damage"},
     {"text":"Check the fire extinguisher tag date"}]'),
  ('Cabin closing', 'maintenance', '[
     {"text":"Shut off and drain the water"},
     {"text":"Blow out the lines and add antifreeze to traps"},
     {"text":"Unplug appliances and switch off breakers"},
     {"text":"Strip and store the mattresses"},
     {"text":"Close and latch every window"},
     {"text":"Set traps and seal entry points"},
     {"text":"Lock up and log the key"}]')
) as t(name, trade, items)
where not exists (
  select 1 from work_checklist_templates w where w.camp_id = c.id and w.name = t.name
);
