-- Two levels of module access, because there was effectively none.
--
-- `camps.modules` has existed since setup and has never been read by the app: a camp could turn
-- Kitchen Manager off in Camp Info and it stayed in their sidebar. That is level two -- the
-- camp's own choice about which parts of the product it uses.
--
-- Level one is new. `camps.platform_modules` is the founder's decision about which modules a
-- camp is sold at all. A module switched off here is not on their nav, not reachable by URL,
-- and not listed in Camp Info -- so a camp on a plan without Retreats never learns Retreats
-- exists, rather than being shown a toggle that leads to a locked door.
--
-- Both objects mean the same thing by the same rule: a key is off ONLY when it is explicitly
-- false. An absent key is on. A module added to the product later is therefore available to
-- everyone until somebody decides otherwise, which is the safe direction for a column that
-- hides screens.

alter table camps
  add column if not exists platform_modules jsonb not null default '{}'::jsonb;

comment on column camps.platform_modules is
  'Founder-level module entitlement. Keys: issues, pool, safety, assets, building, commissary, retreats. A key is off only when explicitly false; absent means allowed. Camp admins cannot change this -- see the guard_platform_modules trigger.';
comment on column camps.modules is
  'The camp''s own module switches, limited by platform_modules. Same keys, same rule: off only when explicitly false.';

-- Normalise the camp-level object onto the module list the product actually has.
--
-- Every camp row still carried the shape of a setup wizard that predates half of it: `kitchen`
-- for Commissary, plus `staff`, `drills` and `checklists`, which stopped being modules years of
-- product ago, and no key at all for Building Systems or Retreats. Answers the camp gave are
-- preserved (a camp that said it has no pool still has no pool); keys nobody was ever asked
-- about default to on, so switching this feature on removes nothing a camp is using today.
update camps
set modules = jsonb_build_object(
  'issues',     coalesce((modules->>'issues')::boolean, true),
  'pool',       coalesce((modules->>'pool')::boolean, true),
  'safety',     coalesce((modules->>'safety')::boolean, (modules->>'compliance')::boolean, true),
  'assets',     coalesce((modules->>'assets')::boolean, true),
  'building',   coalesce((modules->>'building')::boolean, (modules->>'building_systems')::boolean, true),
  'commissary', coalesce((modules->>'commissary')::boolean, (modules->>'kitchen')::boolean, true),
  'retreats',   coalesce((modules->>'retreats')::boolean, true)
)
where modules is not null;

update camps set modules = '{}'::jsonb where modules is null;

-- A camp admin can UPDATE their own camps row directly (policy admins_update_camp), so without
-- this a camp could grant itself a module the platform switched off by writing the column from
-- the REST API. The gate belongs on the table rather than in one RPC, because the RPC is not
-- the only door.
create or replace function guard_platform_modules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.platform_modules is distinct from old.platform_modules
     and not is_platform_admin() then
    new.platform_modules := old.platform_modules;
  end if;
  return new;
end;
$fn$;

drop trigger if exists guard_platform_modules on camps;
create trigger guard_platform_modules
  before update on camps
  for each row
  execute function guard_platform_modules();

-- The founder console's write path. SECURITY DEFINER because platform admins usually hold no
-- camp_members row, so the camps UPDATE policy does not let them through.
create or replace function admin_set_camp_modules(
  p_camp_id uuid,
  p_platform_modules jsonb default null,
  p_modules jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  update camps set
    platform_modules = coalesce(p_platform_modules, platform_modules),
    modules          = coalesce(p_modules, modules)
  where id = p_camp_id;
end;
$fn$;

revoke all on function admin_set_camp_modules(uuid, jsonb, jsonb) from public;
grant execute on function admin_set_camp_modules(uuid, jsonb, jsonb) to authenticated;
