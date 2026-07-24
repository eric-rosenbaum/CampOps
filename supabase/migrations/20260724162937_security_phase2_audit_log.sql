-- SECURITY PHASE 2 — audit logging.
-- A tamper-evident, append-only record of sensitive actions. Deliberately METADATA-ONLY
-- (actor, action, table, row id, camp, timestamp) — it does NOT store row snapshots, so the
-- log never becomes a second copy of camper health PII and stays clean for retention/deletion.

create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid,
  actor_id     uuid,                         -- auth.uid() of the acting user (null = system)
  action       text not null,               -- insert | update | delete | view_camper_health | export_data | regenerate_portal_token | ...
  target_table text,
  target_id    text,
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_camp_time_idx on public.audit_log (camp_id, created_at desc);
create index if not exists audit_log_action_idx     on public.audit_log (camp_id, action, created_at desc);

alter table public.audit_log enable row level security;

-- Admins can read their own camp's log. No INSERT/UPDATE/DELETE policies exist, so the table
-- is append-only from the app's perspective: only SECURITY DEFINER triggers/functions (running
-- as the table owner) and the service role can write, and nobody can edit or erase entries.
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log
  for select using (is_camp_admin(camp_id));

-- Trigger: log every insert/update/delete on an attached table (metadata only).
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_camp uuid; v_id text;
begin
  if tg_op = 'DELETE' then
    v_camp := (to_jsonb(old)->>'camp_id')::uuid;
    v_id   := to_jsonb(old)->>'id';
  else
    v_camp := (to_jsonb(new)->>'camp_id')::uuid;
    v_id   := to_jsonb(new)->>'id';
  end if;
  insert into public.audit_log (camp_id, actor_id, action, target_table, target_id)
  values (v_camp, auth.uid(), lower(tg_op), tg_table_name, v_id);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Attach to the sensitive tables: camper health, membership/roles, and retreat financials.
do $$
declare t text;
begin
  foreach t in array array[
    'campers','camper_restrictions','camper_sessions','commissary_files',
    'camp_members','retreat_charges','retreat_payments','retreat_costs'
  ] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$s
       for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- Helper for app-level events that aren't row changes (e.g. opening the camper-health roster,
-- exporting data). Scoped to camp members; writes as owner so the log stays append-only.
create or replace function public.log_audit_event(
  p_camp_id uuid, p_action text, p_target_table text default null, p_target_id text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_camp_member(p_camp_id) then raise exception 'Not authorized'; end if;
  insert into public.audit_log (camp_id, actor_id, action, target_table, target_id)
  values (p_camp_id, auth.uid(), p_action, p_target_table, p_target_id);
end $$;

revoke execute on function public.log_audit_event(uuid,text,text,text) from public, anon;
grant  execute on function public.log_audit_event(uuid,text,text,text) to authenticated;
