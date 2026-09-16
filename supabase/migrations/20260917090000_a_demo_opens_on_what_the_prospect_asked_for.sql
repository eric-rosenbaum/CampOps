-- A demo camp opens on a page written for the prospect who asked for it.
--
-- Until now a /try/ link dropped a prospect onto the operations dashboard of a camp full of
-- sample data, with nothing saying which of eight modules to look at, or that anything had been
-- built because of what they said. The brief is the founder's note to that prospect: who it is
-- for, what they told us, which features answer it, and how to try each in two minutes.
--
-- One row per camp. Readable by the camp's members (an anonymous /try/ visitor is a member) so
-- the guide can render it; written only by a platform admin through admin_set_demo_brief, and
-- only for demo-type camps -- a customer must never find sales copy in their own account.
create table if not exists demo_briefs (
  camp_id        uuid primary key references camps(id) on delete cascade,
  prospect_name  text,
  headline       text,
  intro          text,
  -- [{ "key": "food_requests", "enabled": true, "you_told_us": "...", "what_we_built": "..." }]
  spotlights     jsonb not null default '[]'::jsonb,
  founder_name   text,
  founder_email  text,
  updated_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table demo_briefs is
  'Per-demo landing copy for the Demo Guide (/demo-guide). Platform admins write it via admin_set_demo_brief; camp members read it.';

alter table demo_briefs enable row level security;

drop policy if exists demo_briefs_read on demo_briefs;
create policy demo_briefs_read on demo_briefs for select
  using (is_camp_member(camp_id) or is_platform_admin());

drop trigger if exists trg_demo_briefs_updated_at on demo_briefs;
create trigger trg_demo_briefs_updated_at before update on demo_briefs
  for each row execute function update_updated_at();

create or replace function public.admin_set_demo_brief(p_camp_id uuid, p_brief jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_type text;
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  select account_type into v_type from camps where id = p_camp_id and deleted_at is null;
  if v_type is null then
    raise exception 'Camp not found';
  end if;
  if v_type not in ('trial', 'demo') then
    raise exception 'A demo guide can only be written for a demo camp';
  end if;
  if jsonb_typeof(coalesce(p_brief->'spotlights', '[]'::jsonb)) <> 'array' then
    raise exception 'spotlights must be a list';
  end if;

  insert into demo_briefs (camp_id, prospect_name, headline, intro, spotlights, founder_name, founder_email, updated_by)
  values (p_camp_id,
          nullif(btrim(p_brief->>'prospect_name'), ''),
          nullif(btrim(p_brief->>'headline'), ''),
          nullif(btrim(p_brief->>'intro'), ''),
          coalesce(p_brief->'spotlights', '[]'::jsonb),
          nullif(btrim(p_brief->>'founder_name'), ''),
          nullif(btrim(p_brief->>'founder_email'), ''),
          auth.uid())
  on conflict (camp_id) do update set
    prospect_name = excluded.prospect_name,
    headline      = excluded.headline,
    intro         = excluded.intro,
    spotlights    = excluded.spotlights,
    founder_name  = excluded.founder_name,
    founder_email = excluded.founder_email,
    updated_by    = excluded.updated_by;
end;
$$;

revoke execute on function public.admin_set_demo_brief(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_demo_brief(uuid, jsonb) to authenticated;
