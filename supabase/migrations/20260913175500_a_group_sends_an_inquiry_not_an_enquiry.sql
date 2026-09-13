-- One spelling, and it is the American one: every camp on this product is in the United States,
-- and "enquiry" read as a typo to the people using it.
--
-- The columns are renamed rather than duplicated, and the three functions that name them are
-- rebuilt from their own deployed definitions with the word replaced -- so nothing is retyped
-- from memory and nothing is left referring to a column that no longer exists. Token VALUES are
-- untouched, so an inquiry link a camp has already shared keeps working, and /enquire/:token
-- stays routed in the app for the same reason.
alter table camps    rename column enquiry_token   to inquiry_token;
alter table retreats rename column enquiry_seen_at to inquiry_seen_at;

comment on column camps.inquiry_token is
  'The camp''s public inquiry-form link. Was enquiry_token until Sep 2026; the values did not change, so links already shared still resolve.';

do $outer$
declare
  r record;
  v_def text;
  v_grants text;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('camp_enquiry_page', 'mark_enquiry_seen', 'submit_camp_enquiry')
  loop
    v_def := pg_get_functiondef(r.oid);

    -- Every spelling of it: the function's own name, the columns it reads, and any copy inside.
    v_def := replace(v_def, 'enquiries', 'inquiries');
    v_def := replace(v_def, 'enquiry',   'inquiry');
    v_def := replace(v_def, 'Enquiry',   'Inquiry');

    execute v_def;

    -- The two the portal calls are reached by anon; the third is only ever the camp's own app.
    v_grants := case when r.proname = 'mark_enquiry_seen' then 'authenticated'
                     else 'anon, authenticated' end;
    execute format('grant execute on function public.%I(%s) to %s',
                   replace(r.proname, 'enquiry', 'inquiry'), r.args, v_grants);

    execute format('drop function if exists public.%I(%s)', r.proname, r.args);
  end loop;
end
$outer$;
