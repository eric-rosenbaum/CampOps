-- Let staff fill in their own details, because the director cannot type sixty people's.
--
-- A camp's roster arrives as a CSV, but the fields the permit forms actually need -- date of
-- birth, education, qualifying experience -- are in none of the systems a roster is exported
-- from. Today camps collect them by emailing a form and re-typing the replies. This is that
-- workflow, minus the re-typing.
--
-- Two shapes of link, one table:
--   staff_id null  an open link the camp sends to everybody; each submission is a new person
--   staff_id set   "finish your record", aimed at one person already on the roster
--
-- Submissions land in a queue and are applied by an admin. A link that wrote straight to the
-- roster would be an unauthenticated door into camp data, and the review step is also where a
-- director notices that two people typed the same name.
--
-- What a submission may carry is fixed in the RPC below, not chosen by the caller. Screening
-- results, licence numbers and anything resembling a background check are not accepted at all --
-- the platform records that a check was run and when, never what it said.

create table if not exists staff_intake_links (
  id          uuid primary key default gen_random_uuid(),
  camp_id     uuid not null references camps(id) on delete cascade,
  season_id   uuid references seasons(id) on delete set null,
  staff_id    uuid references safety_staff(id) on delete cascade,
  token       text not null unique,
  label       text,
  expires_on  date,
  revoked_at  timestamptz,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists staff_intake_links_camp_idx on staff_intake_links (camp_id);

create table if not exists staff_intake_submissions (
  id          uuid primary key default gen_random_uuid(),
  link_id     uuid not null references staff_intake_links(id) on delete cascade,
  camp_id     uuid not null references camps(id) on delete cascade,
  staff_id    uuid references safety_staff(id) on delete set null,
  payload     jsonb not null,
  submitted_at timestamptz not null default now(),
  applied_at  timestamptz,
  applied_by  text
);
create index if not exists staff_intake_submissions_camp_idx
  on staff_intake_submissions (camp_id, applied_at);

alter table staff_intake_links enable row level security;
alter table staff_intake_submissions enable row level security;

-- Only camp admins ever see these directly. The public reaches them through the two RPCs.
drop policy if exists staff_intake_links_admin on staff_intake_links;
create policy staff_intake_links_admin on staff_intake_links
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

drop policy if exists staff_intake_submissions_admin on staff_intake_submissions;
create policy staff_intake_submissions_admin on staff_intake_submissions
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

-- What the person filling the form is allowed to know: the camp's name, and their own, if the
-- link was aimed at them. Nothing else about the camp or its roster.
create or replace function staff_intake_prompt(p_token text)
returns table (camp_name text, person_name text, is_open boolean)
language sql security definer set search_path = public as $$
  select c.name,
         s.name,
         l.staff_id is null
    from staff_intake_links l
    join camps c on c.id = l.camp_id
    left join safety_staff s on s.id = l.staff_id
   where l.token = p_token
     and l.revoked_at is null
     and (l.expires_on is null or l.expires_on >= current_date);
$$;

-- The accepted fields are named here, so a caller cannot post whatever it likes into the queue.
create or replace function staff_intake_submit(
  p_token text, p_name text, p_title text, p_date_of_birth date, p_sex text,
  p_education text, p_qualifying_experience text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_link staff_intake_links%rowtype;
begin
  select * into v_link from staff_intake_links
   where token = p_token and revoked_at is null
     and (expires_on is null or expires_on >= current_date);
  if not found then return false; end if;

  if coalesce(trim(p_name), '') = '' then return false; end if;

  insert into staff_intake_submissions (link_id, camp_id, staff_id, payload)
  values (v_link.id, v_link.camp_id, v_link.staff_id, jsonb_build_object(
    'name', trim(p_name),
    'title', nullif(trim(coalesce(p_title, '')), ''),
    'date_of_birth', p_date_of_birth,
    'sex', case when lower(coalesce(p_sex, '')) like 'm%' then 'male'
                when lower(coalesce(p_sex, '')) like 'f%' then 'female' end,
    'education', nullif(trim(coalesce(p_education, '')), ''),
    'qualifying_experience', nullif(trim(coalesce(p_qualifying_experience, '')), '')
  ));
  return true;
end;
$$;

revoke all on function staff_intake_prompt(text) from public;
revoke all on function staff_intake_submit(text, text, text, date, text, text, text) from public;
grant execute on function staff_intake_prompt(text) to anon, authenticated;
grant execute on function staff_intake_submit(text, text, text, date, text, text, text)
  to anon, authenticated;
