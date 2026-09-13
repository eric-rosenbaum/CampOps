-- The one piece of copy in the database that still called it a proposal: the nudge that goes to
-- the CAMP three days after a group has not opened what was sent them.
--
-- Rewritten by reading the deployed definition and replacing the three strings in it, rather
-- than retyping twelve kilobytes of function around a copy change. Every replacement is checked,
-- so this fails loudly if the text it is looking for has moved rather than quietly doing nothing.
do $outer$
declare
  v_def text;
  v_before text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'plan_retreat_messages';

  if v_def is null then raise exception 'plan_retreat_messages is not there to edit.'; end if;

  v_before := v_def;
  v_def := replace(v_def, 'has not opened your proposal', 'has not signed your agreement');
  v_def := replace(v_def, 'Proposal still unopened', 'Agreement still unopened');
  v_def := replace(v_def, 'You sent a proposal to <strong>', 'You sent the agreement to <strong>');

  if v_def = v_before then
    raise exception 'None of the proposal wording was found — has this email been rewritten?';
  end if;

  execute v_def;
end
$outer$;
