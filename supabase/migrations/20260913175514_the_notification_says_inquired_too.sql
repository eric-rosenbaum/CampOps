-- "has enquired" survived the rename because it is a verb, not the noun the replace was after.
do $outer$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_camp_inquiry';

  if v_def is null or v_def not like '%has enquired%' then
    raise exception 'Expected "has enquired" in submit_camp_inquiry and did not find it.';
  end if;

  execute replace(v_def, 'has enquired', 'has inquired');
end
$outer$;
