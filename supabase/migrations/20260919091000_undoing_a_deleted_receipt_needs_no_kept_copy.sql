-- Undoing the deletion of a receipt that was not a duplicate failed with "record v_kept is not
-- assigned yet": the kept copy was read into a record only when there was one, and then tested
-- either way. Plain variables, which are simply null when nothing was kept.

-- Undo a removal: the receipt comes back as it was, its statement matches with it, and a kept
-- duplicate gives back what it took. Refused when something has moved on since (the charge was
-- matched to another receipt, or the kept copy was exported).
create or replace function public.restore_removed_receipt(p_removal_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare x record; v_row receipts; l jsonb; v_kept_id uuid; v_kept_status text; v_kept_unlocked timestamptz; v_skipped int := 0;
begin
  select * into x from receipt_removals where id = p_removal_id;
  if x.id is null then raise exception 'Nothing to restore'; end if;
  if not (is_camp_admin(x.camp_id) or (x.removed_by = auth.uid() and get_camp_role(x.camp_id) = 'staff')) then
    raise exception 'Only finance or the person who removed it can put it back';
  end if;
  if x.restored_at is not null then raise exception 'That receipt was already put back'; end if;
  if exists (select 1 from receipts where id = x.receipt_id) then raise exception 'That receipt is already there'; end if;

  if x.kept_receipt_id is not null then
    select id, status, unlocked_at into v_kept_id, v_kept_status, v_kept_unlocked from receipts where id = x.kept_receipt_id;
    if v_kept_id is not null and v_kept_status = 'exported' and v_kept_unlocked is null
       and (x.receipt_row->>'status') is distinct from 'exported' then
      raise exception 'The copy that was kept has been exported since. Unlock it to correct it first.';
    end if;
  end if;

  perform set_config('campcommand.receipts_books', 'on', true);
  if v_kept_id is not null and x.kept_before is not null then
    update receipts
       set budget_code_id = (x.kept_before->>'budget_code_id')::uuid,
           purpose = x.kept_before->>'purpose',
           file_path = x.kept_before->>'file_path',
           file_name = x.kept_before->>'file_name',
           file_type = x.kept_before->>'file_type',
           possible_duplicate_of = (x.kept_before->>'possible_duplicate_of')::uuid
     where id = v_kept_id;
  end if;

  v_row := jsonb_populate_record(null::receipts, x.receipt_row);
  -- A code or card deleted since is not a reason to lose the receipt.
  if v_row.budget_code_id is not null and not exists (select 1 from expense_budget_codes where id = v_row.budget_code_id) then v_row.budget_code_id := null; end if;
  if v_row.card_id is not null and not exists (select 1 from expense_cards where id = v_row.card_id) then v_row.card_id := null; end if;
  if v_row.possible_duplicate_of is not null and not exists (select 1 from receipts where id = v_row.possible_duplicate_of) then v_row.possible_duplicate_of := null; end if;
  if v_row.export_id is not null and not exists (select 1 from expense_exports where id = v_row.export_id) then v_row.export_id := null; end if;
  insert into receipts select v_row.*;

  for l in select * from jsonb_array_elements(x.lines_before) loop
    -- Only if the charge is still where the removal left it: on the kept copy, or unexplained.
    update statement_lines
       set match_state = l->>'match_state', receipt_id = (l->>'receipt_id')::uuid, note = l->>'note',
           no_receipt_kind = l->>'no_receipt_kind', budget_code_id = (l->>'budget_code_id')::uuid,
           resolved_by = (l->>'resolved_by')::uuid, resolved_at = (l->>'resolved_at')::timestamptz
     where id = (l->>'id')::uuid
       and (receipt_id is not distinct from x.kept_receipt_id and x.kept_receipt_id is not null
            or match_state = 'unmatched');
    if not found then v_skipped := v_skipped + 1; end if;
  end loop;

  update receipt_removals set restored_at = now(), restored_by = auth.uid() where id = x.id;
  perform set_config('campcommand.receipts_books', '', true);
  return jsonb_build_object('restored', x.receipt_id, 'lines_not_restored', v_skipped);
end $fn$;
revoke execute on function public.restore_removed_receipt(uuid) from public, anon, authenticated;
grant execute on function public.restore_removed_receipt(uuid) to authenticated;

