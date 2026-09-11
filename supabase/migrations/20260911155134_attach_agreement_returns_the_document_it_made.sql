-- Immediately previous migration retyped this function to add a due date and dropped the
-- `returning id into v_id` off the insert. It still attached the agreement; it just always
-- reported null afterwards, which the caller reads as "this camp keeps no template, nothing
-- happened" -- so sending a proposal would have stopped telling anyone an agreement went with it.
--
-- Fourth time a retyped function has lost something on the way. The guard that actually works is
-- reading pg_get_functiondef and editing THAT, which is what produced the version below.
create or replace function public.attach_agreement_from_template(p_retreat_id uuid)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_r retreats; v_c camps; v_id uuid;
begin
  select * into v_r from retreats where id = p_retreat_id;
  if v_r.id is null then raise exception 'No such retreat.'; end if;
  if not is_camp_member(v_r.camp_id) then raise exception 'Forbidden'; end if;

  select * into v_c from camps where id = v_r.camp_id;
  if coalesce(btrim(v_c.agreement_template_path), '') = '' then return null; end if;

  if exists (
    select 1 from retreat_documents
    where retreat_id = p_retreat_id and doc_type in ('agreement', 'contract')
  ) then return null; end if;

  insert into retreat_documents (camp_id, retreat_id, doc_type, name, status, file_path, sort_order,
                                 due_date)
  values (v_r.camp_id, p_retreat_id, 'agreement',
          coalesce(nullif(btrim(v_c.agreement_template_name), ''), 'Retreat agreement'),
          'pending', v_c.agreement_template_path, 0,
          -- A month before they arrive, or today if they booked inside that. Without a due date
          -- the agreement_14d/7d/2d reminders have nothing to count back from and never queue.
          case when v_r.arrival_date is not null
               then greatest(v_r.arrival_date - 30, current_date) end)
  returning id into v_id;

  return v_id;
end;
$fn$;
