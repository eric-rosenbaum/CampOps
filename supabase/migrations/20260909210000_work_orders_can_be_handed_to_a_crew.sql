-- A job can be handed to a crew rather than a person.
--
-- Until now the only answer to "who is doing this" was one name or nobody, so a camp that works
-- the way most camps do -- "housekeeping will pick it up" -- had to either invent an owner or
-- leave it unassigned and hope. Handing it to a crew says who it belongs to without pretending
-- somebody has agreed to it.
--
-- Crew-assigned still counts as UNASSIGNED. That is deliberate: nobody has taken it, so it
-- belongs in the pile people are asked to clear, and status stays 'unassigned' until a person's
-- name goes on it. The crew is a routing hint, not an owner.

alter table issues
  add column if not exists assignee_group_id uuid references staff_groups(id) on delete set null;

create index if not exists issues_assignee_group_idx on issues(camp_id, assignee_group_id)
  where assignee_group_id is not null;

-- One or the other, never both: "assigned to Sam and also to Housekeeping" has no meaning the
-- board could render, and the two would disagree the moment either changed.
alter table issues drop constraint if exists issues_one_assignee;
alter table issues add constraint issues_one_assignee
  check (assignee_id is null or assignee_group_id is null);

comment on column issues.assignee_group_id is
  'The crew this job is waiting on. Mutually exclusive with assignee_id, and still counts as unassigned: a crew is where work waits, not who owns it.';
