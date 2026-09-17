-- Receipts, after a charity finance director and an operations lead used the demo a second time.
--
--   * An exported receipt could be edited or deleted with no warning, so the books and the app
--     disagreed silently. Exported receipts (and exported statements) are now read-only for
--     everyone, finance included, until finance unlocks them "to correct", which records who,
--     when and why, and marks the month's export as needing to be done again. The guard enforces
--     it, not only the screen.
--   * "No receipt needed" hid two different things. A charge is now either "Receipt lost" (a note
--     is required: it is the missing-receipt record an auditor asks for) or "No receipt expected"
--     (a bank fee), and either can be booked to a budget code instead of always the card's default.
--   * Removing a duplicate waited out an 8-second Undo on the screen before it was sent, so leaving
--     the page inside that window brought the copy back. A removal is now committed at once and
--     kept in receipt_removals; Undo restores it from there.
--   * Keeping one copy of a duplicate can take the removed copy's photo, so resolving an undated
--     receipt no longer means deleting the only photo.
--   * Finance can ask a card holder about a receipt (an undated one, usually) by email.
--   * A statement remembers whether its total was typed from the bill or is only the sum of the
--     lines, so the screen stops calling an unchecked sum "from the bill".
--   * Tax settings carry the camp's QuickBooks tax code names and how the bills export writes tax
--     the camp cannot get back; an export records which treatment it used.

-- ─── Columns ─────────────────────────────────────────────────────────────────

alter table public.receipts
  add column unlocked_at timestamptz,
  add column unlocked_by uuid,
  add column unlocked_by_name text,
  add column unlock_reason text,
  add column holder_asked_at timestamptz;

alter table public.statement_lines
  add column no_receipt_kind text check (no_receipt_kind is null or no_receipt_kind in ('lost', 'not_expected')),
  add column budget_code_id uuid references public.expense_budget_codes(id) on delete set null;

-- Every "no receipt needed" so far was a charge nobody expected paper for, as far as anyone said.
update public.statement_lines set no_receipt_kind = 'not_expected' where match_state = 'no_receipt_ok';

alter table public.statement_lines
  add constraint statement_lines_no_receipt_has_kind check ((match_state = 'no_receipt_ok') = (no_receipt_kind is not null)),
  -- A lost receipt without a word about it is exactly what an audit refuses.
  add constraint statement_lines_lost_receipt_has_note check (no_receipt_kind is distinct from 'lost' or length(btrim(coalesce(note, ''))) > 0);

alter table public.card_statements
  add column total_source text not null default 'typed' check (total_source in ('typed', 'sum_of_lines')),
  add column reexport_needed_at timestamptz,
  add column reexport_reason text;

alter table public.expense_tax_settings
  add column qbo_tax_codes jsonb not null default '{}'::jsonb check (jsonb_typeof(qbo_tax_codes) = 'object'),
  add column nonrecoverable_tax text check (nonrecoverable_tax is null or nonrecoverable_tax in ('expense', 'claim_all'));

alter table public.expense_exports
  add column tax_treatment text;

-- ─── Audit: every unlock, and every removal (which is what Undo restores) ───

create table public.receipt_unlocks (
  id               uuid primary key default gen_random_uuid(),
  camp_id          uuid not null references public.camps(id) on delete cascade,
  receipt_id       uuid,
  statement_id     uuid,
  export_id        uuid,
  reason           text not null,
  unlocked_by      uuid default auth.uid(),
  unlocked_by_name text,
  created_at       timestamptz not null default now(),
  -- Set when the month is exported again and the unlocked receipt is locked with it.
  relocked_at      timestamptz,
  relocked_export_id uuid
);
create index receipt_unlocks_camp_idx on public.receipt_unlocks (camp_id, created_at desc);

create table public.receipt_removals (
  id              uuid primary key default gen_random_uuid(),
  camp_id         uuid not null references public.camps(id) on delete cascade,
  receipt_id      uuid not null,
  kind            text not null check (kind in ('duplicate', 'deleted')),
  kept_receipt_id uuid,
  -- The whole row as it was, so a restore puts back exactly what was removed.
  receipt_row     jsonb not null,
  -- The statement lines matched to it: [{id, match_state, receipt_id, note, no_receipt_kind, resolved_by, resolved_at}]
  lines_before    jsonb not null default '[]'::jsonb,
  -- What the kept copy looked like before it took anything from the removed one.
  kept_before     jsonb,
  removed_by      uuid default auth.uid(),
  removed_by_name text,
  created_at      timestamptz not null default now(),
  restored_at     timestamptz,
  restored_by     uuid
);
create index receipt_removals_camp_idx on public.receipt_removals (camp_id, created_at desc);

alter table public.receipt_unlocks enable row level security;
alter table public.receipt_removals enable row level security;
create policy receipt_unlocks_admin_read on public.receipt_unlocks for select to authenticated using (is_camp_admin(camp_id));
create policy receipt_removals_read on public.receipt_removals for select to authenticated
  using (is_camp_admin(camp_id) or removed_by = auth.uid());
-- Written only by the functions below.
revoke all on public.receipt_unlocks, public.receipt_removals from anon, authenticated;
grant select on public.receipt_unlocks, public.receipt_removals to authenticated;

-- ─── Helpers ─────────────────────────────────────────────────────────────────

-- Functions that write the books on purpose (export, unlock, restore, the demo seed) say so for
-- the rest of their transaction; the guards below let those writes through. A browser cannot set
-- it: every PostgREST request is its own transaction and set_config is not an exposed function.
create or replace function public.receipts_books_write_allowed()
returns boolean
language sql stable set search_path = public
as $fn$ select coalesce(current_setting('campcommand.receipts_books', true), '') = 'on' $fn$;
revoke execute on function public.receipts_books_write_allowed() from public, anon, authenticated;

create or replace function public.receipts_person_name(p_camp uuid)
returns text
language sql stable security definer set search_path = public
as $fn$
  select coalesce(nullif(btrim(p.full_name), ''), m.display_name)
    from camp_members m left join profiles p on p.id = m.user_id
   where m.camp_id = p_camp and m.user_id = auth.uid() limit 1
$fn$;
revoke execute on function public.receipts_person_name(uuid) from public, anon, authenticated;

-- ─── Guards ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.receipts_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  v_admin boolean := is_camp_admin(new.camp_id);
  t jsonb;
  v_new jsonb; v_old jsonb;
  -- Columns an export, a duplicate flag, a question to the holder or a deleted card/code/export
  -- may change on a locked receipt without it counting as a correction.
  v_free text[] := array['updated_at', 'export_id', 'exported_at', 'possible_duplicate_of', 'duplicate_dismissed', 'holder_asked_at'];
begin
  -- Every reference must stay inside the receipt's own camp. RLS checks the row's camp_id, not
  -- the camp of the card it points at, so without this a staff member could hang a receipt on
  -- another camp's card and become visible to that card's holder.
  if new.card_id is not null and not exists (select 1 from expense_cards where id = new.card_id and camp_id = new.camp_id) then
    raise exception 'That card belongs to a different camp';
  end if;
  if new.budget_code_id is not null and not exists (select 1 from expense_budget_codes where id = new.budget_code_id and camp_id = new.camp_id) then
    raise exception 'That budget code belongs to a different camp';
  end if;
  if new.possible_duplicate_of is not null and not exists (select 1 from receipts where id = new.possible_duplicate_of and camp_id = new.camp_id) then
    raise exception 'That duplicate belongs to a different camp';
  end if;

  for t in select * from jsonb_array_elements(new.taxes) loop
    if coalesce(t->>'type','') not in ('GST','HST','PST','QST','other') then
      raise exception 'Unknown tax type %', coalesce(t->>'type','(blank)');
    end if;
    if jsonb_typeof(t->'amount') <> 'number' then
      raise exception 'A tax line needs an amount';
    end if;
  end loop;

  if tg_op = 'UPDATE' and new.camp_id <> old.camp_id then
    raise exception 'A receipt cannot move camps';
  end if;

  -- Unlocking is a recorded act (unlock_exported_receipt), never a column someone sets.
  if auth.uid() is not null and not receipts_books_write_allowed() then
    if tg_op = 'INSERT' and new.unlocked_at is not null and not v_admin then
      raise exception 'Only finance can unlock an exported receipt';
    end if;
    if tg_op = 'UPDATE' and (new.unlocked_at is distinct from old.unlocked_at or new.unlocked_by is distinct from old.unlocked_by
        or new.unlocked_by_name is distinct from old.unlocked_by_name or new.unlock_reason is distinct from old.unlock_reason) then
      raise exception 'Use "Unlock to correct" to change an exported receipt';
    end if;
    -- An exported receipt is in the books. Changing it while locked, finance included, is how the
    -- app and QuickBooks came to disagree without anyone being told.
    if tg_op = 'UPDATE' and old.status = 'exported' and old.unlocked_at is null then
      v_new := to_jsonb(new) - v_free;
      v_old := to_jsonb(old) - v_free;
      -- A card or budget code deleted in Settings clears its column: not a correction.
      if new.card_id is null and old.card_id is not null and not exists (select 1 from expense_cards where id = old.card_id) then
        v_new := v_new - 'card_id'; v_old := v_old - 'card_id';
      end if;
      if new.budget_code_id is null and old.budget_code_id is not null and not exists (select 1 from expense_budget_codes where id = old.budget_code_id) then
        v_new := v_new - 'budget_code_id'; v_old := v_old - 'budget_code_id';
      end if;
      if v_new is distinct from v_old then
        raise exception 'This receipt was exported to QuickBooks. Unlock it to correct it, and export the month again.';
      end if;
    end if;
  end if;

  -- Only a trigger reached with a signed-in session has a person to restrict. The service role
  -- and SQL maintenance run with no auth.uid() and are trusted.
  if auth.uid() is null or v_admin then return new; end if;

  if tg_op = 'INSERT' then
    if new.submitted_by is distinct from auth.uid() then
      raise exception 'You can only submit receipts as yourself';
    end if;
    if new.deferred_month is not null or new.deferred_note is not null then
      raise exception 'Only finance can set a receipt aside for another month';
    end if;
    if new.status = 'exported' or new.export_id is not null or new.exported_at is not null then
      raise exception 'Only finance can mark a receipt exported';
    end if;
    return new;
  end if;

  if old.status = 'exported' then
    raise exception 'This receipt has been exported to the books. Ask finance to change it.';
  end if;
  if new.status = 'exported' or new.export_id is distinct from old.export_id
     or new.exported_at is distinct from old.exported_at then
    raise exception 'Only finance can mark a receipt exported';
  end if;
  -- Setting a receipt aside is finance saying "this posts next month". A holder doing it to their
  -- own receipt would take it out of a month that does not agree without anyone in finance seeing.
  if new.deferred_month is distinct from old.deferred_month or new.deferred_note is distinct from old.deferred_note then
    raise exception 'Only finance can set a receipt aside for another month';
  end if;
  if new.submitted_by is distinct from old.submitted_by then
    raise exception 'The submitter of a receipt cannot be changed';
  end if;
  if new.holder_asked_at is distinct from old.holder_asked_at then
    raise exception 'Only finance can ask a card holder about a receipt';
  end if;
  return new;
end $fn$;

-- Deleting an exported receipt took it out of the app and left it in QuickBooks.
create or replace function public.receipts_delete_guard()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if old.status = 'exported' and old.unlocked_at is null and auth.uid() is not null
     and not receipts_books_write_allowed()
     -- A camp being deleted takes its receipts with it.
     and exists (select 1 from camps where id = old.camp_id) then
    raise exception 'This receipt was exported to QuickBooks. Unlock it to correct it before removing it.';
  end if;
  return old;
end $fn$;
revoke execute on function public.receipts_delete_guard() from public, anon, authenticated;
create trigger receipts_delete_guard before delete on public.receipts
  for each row execute function public.receipts_delete_guard();

CREATE OR REPLACE FUNCTION public.statement_lines_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
begin
  -- The line's camp is the statement's camp, always. Taken from the parent rather than trusted.
  select camp_id into new.camp_id from card_statements where id = new.statement_id;
  if new.camp_id is null then raise exception 'Statement not found'; end if;
  if new.receipt_id is not null and not exists (select 1 from receipts where id = new.receipt_id and camp_id = new.camp_id) then
    raise exception 'That receipt belongs to a different camp';
  end if;
  if new.budget_code_id is not null and not exists (select 1 from expense_budget_codes where id = new.budget_code_id and camp_id = new.camp_id) then
    raise exception 'That budget code belongs to a different camp';
  end if;
  return new;
end $fn$;

CREATE OR REPLACE FUNCTION public.card_statements_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
begin
  if not exists (select 1 from expense_cards where id = new.card_id and camp_id = new.camp_id) then
    raise exception 'That card belongs to a different camp';
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and not receipts_books_write_allowed() then
    if new.reexport_needed_at is distinct from old.reexport_needed_at or new.reexport_reason is distinct from old.reexport_reason
       or new.export_id is distinct from old.export_id or new.exported_at is distinct from old.exported_at then
      raise exception 'Use "Unlock to correct" to change an exported statement';
    end if;
    if old.export_id is not null and old.reexport_needed_at is null
       and (new.statement_total is distinct from old.statement_total or new.total_source is distinct from old.total_source
            or new.period_month is distinct from old.period_month or new.card_id is distinct from old.card_id) then
      raise exception 'This statement was exported to QuickBooks. Unlock it to correct it, and export the month again.';
    end if;
  end if;
  return new;
end $fn$;

create or replace function public.card_statements_delete_guard()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if old.export_id is not null and old.reexport_needed_at is null and auth.uid() is not null
     and not receipts_books_write_allowed()
     -- Deleting the card (or the camp) takes its statements with it.
     and exists (select 1 from expense_cards where id = old.card_id) then
    raise exception 'This statement was exported to QuickBooks. Unlock it to correct it before replacing or deleting it.';
  end if;
  return old;
end $fn$;
revoke execute on function public.card_statements_delete_guard() from public, anon, authenticated;
create trigger card_statements_delete_guard before delete on public.card_statements
  for each row execute function public.card_statements_delete_guard();

-- ─── Import: a total nobody typed is recorded as the sum of the lines ───────

create or replace function public.import_card_statement(
  p_card_id uuid, p_period_month date, p_statement_total numeric, p_file_name text,
  p_lines jsonb, p_replace boolean default false)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare v_camp uuid; v_id uuid; l jsonb; v_sum numeric;
begin
  select camp_id into v_camp from expense_cards where id = p_card_id;
  if v_camp is null or not is_camp_admin(v_camp) then raise exception 'Only a camp admin can import statements'; end if;
  if extract(day from p_period_month) <> 1 then raise exception 'period_month must be the first of the month'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'The statement has no lines'; end if;

  select id into v_id from card_statements where card_id = p_card_id and period_month = p_period_month;
  if v_id is not null then
    if not p_replace then
      raise exception 'A statement for this card and month is already imported. Replace it to import again.'
        using errcode = 'unique_violation';
    end if;
    -- card_statements_delete_guard refuses an exported statement that nobody unlocked.
    delete from card_statements where id = v_id;
  end if;

  -- A null total is "I don't have the bill's total": the lines' own sum is kept, and said to be only that.
  select coalesce(sum(round((e->>'amount')::numeric, 2)), 0) into v_sum from jsonb_array_elements(p_lines) e;
  insert into card_statements (camp_id, card_id, period_month, statement_total, total_source, file_name)
  values (v_camp, p_card_id, p_period_month, round(coalesce(p_statement_total, v_sum), 2),
          case when p_statement_total is null then 'sum_of_lines' else 'typed' end, p_file_name)
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    insert into statement_lines (statement_id, camp_id, posted_date, description, amount)
    values (v_id, v_camp, (l->>'posted_date')::date, left(coalesce(l->>'description',''), 300),
            round((l->>'amount')::numeric, 2));
  end loop;
  return v_id;
end $fn$;
revoke execute on function public.import_card_statement(uuid, date, numeric, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_card_statement(uuid, date, numeric, text, jsonb, boolean) to authenticated;

-- ─── Resolve lines: two kinds of no receipt, a budget code, and the lock ────
-- p_changes: [{"line_id", "match_state", "receipt_id", "note", "no_receipt_kind": "lost|not_expected", "budget_code_id"}]
create or replace function public.resolve_statement_lines(p_changes jsonb)
returns integer
language plpgsql security definer set search_path = public
as $fn$
declare c jsonb; v_camp uuid; v_n int := 0; v_state text; v_receipt uuid; v_kind text; v_note text; s record;
begin
  for c in select * from jsonb_array_elements(p_changes) loop
    select sl.camp_id, sl.note, cs.export_id, cs.reexport_needed_at into s
      from statement_lines sl join card_statements cs on cs.id = sl.statement_id
     where sl.id = (c->>'line_id')::uuid;
    v_camp := s.camp_id;
    if v_camp is null or not is_camp_admin(v_camp) then raise exception 'Only a camp admin can reconcile statements'; end if;
    if s.export_id is not null and s.reexport_needed_at is null then
      raise exception 'This statement was exported to QuickBooks. Unlock it to correct it, and export the month again.';
    end if;
    v_state := coalesce(c->>'match_state', 'unmatched');
    v_receipt := case when v_state = 'matched' then nullif(c->>'receipt_id','')::uuid else null end;
    if v_state = 'matched' and exists (select 1 from statement_lines where receipt_id = v_receipt and id <> (c->>'line_id')::uuid) then
      raise exception 'That receipt is already matched to another charge' using errcode = 'unique_violation';
    end if;
    v_kind := case when v_state = 'no_receipt_ok' then coalesce(nullif(c->>'no_receipt_kind', ''), 'not_expected') end;
    v_note := case when c ? 'note' then nullif(btrim(c->>'note'), '') else s.note end;
    if v_kind = 'lost' and v_note is null then
      raise exception 'Say what the charge was for and what happened to the receipt. An auditor asks for that note.';
    end if;
    update statement_lines
       set match_state = v_state, receipt_id = v_receipt,
           note = v_note,
           no_receipt_kind = v_kind,
           budget_code_id = case when v_state = 'no_receipt_ok' then nullif(c->>'budget_code_id', '')::uuid else null end,
           resolved_by = case when v_state = 'unmatched' then null else auth.uid() end,
           resolved_at = case when v_state = 'unmatched' then null else now() end
     where id = (c->>'line_id')::uuid;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;
revoke execute on function public.resolve_statement_lines(jsonb) from public, anon, authenticated;
grant execute on function public.resolve_statement_lines(jsonb) to authenticated;

-- ─── Unlock to correct ───────────────────────────────────────────────────────

create or replace function public.unlock_exported_receipt(p_receipt_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare r record; v_stmt uuid; v_name text; v_reason text := nullif(btrim(p_reason), '');
begin
  select * into r from receipts where id = p_receipt_id;
  if r.id is null or not is_camp_admin(r.camp_id) then raise exception 'Only finance can unlock an exported receipt'; end if;
  if r.status <> 'exported' then raise exception 'This receipt has not been exported, so it is not locked'; end if;
  if v_reason is null then raise exception 'Say what needs correcting. It is kept with the receipt.'; end if;
  v_name := receipts_person_name(r.camp_id);
  perform set_config('campcommand.receipts_books', 'on', true);

  update receipts set unlocked_at = now(), unlocked_by = auth.uid(), unlocked_by_name = v_name, unlock_reason = v_reason
   where id = r.id;
  select statement_id into v_stmt from statement_lines where receipt_id = r.id;
  if v_stmt is not null then
    update card_statements
       set reexport_needed_at = coalesce(reexport_needed_at, now()),
           reexport_reason = left(concat_ws(' · ', reexport_reason, coalesce(r.vendor, 'A receipt') || ' unlocked by ' || coalesce(v_name, 'finance') || ': ' || v_reason), 1000)
     where id = v_stmt;
  end if;
  insert into receipt_unlocks (camp_id, receipt_id, statement_id, export_id, reason, unlocked_by_name)
  values (r.camp_id, r.id, v_stmt, r.export_id, v_reason, v_name);
  perform set_config('campcommand.receipts_books', '', true);
  return jsonb_build_object('receipt_id', r.id, 'statement_id', v_stmt, 'unlocked_by_name', v_name);
end $fn$;
revoke execute on function public.unlock_exported_receipt(uuid, text) from public, anon, authenticated;
grant execute on function public.unlock_exported_receipt(uuid, text) to authenticated;

create or replace function public.unlock_exported_statement(p_statement_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare s record; v_name text; v_reason text := nullif(btrim(p_reason), '');
begin
  select * into s from card_statements where id = p_statement_id;
  if s.id is null or not is_camp_admin(s.camp_id) then raise exception 'Only finance can unlock an exported statement'; end if;
  if s.export_id is null then raise exception 'This statement has not been exported, so it is not locked'; end if;
  if v_reason is null then raise exception 'Say what needs correcting. It is kept with the statement.'; end if;
  v_name := receipts_person_name(s.camp_id);
  perform set_config('campcommand.receipts_books', 'on', true);
  update card_statements
     set reexport_needed_at = coalesce(reexport_needed_at, now()),
         reexport_reason = left(concat_ws(' · ', reexport_reason, 'Statement unlocked by ' || coalesce(v_name, 'finance') || ': ' || v_reason), 1000)
   where id = s.id;
  insert into receipt_unlocks (camp_id, statement_id, export_id, reason, unlocked_by_name)
  values (s.camp_id, s.id, s.export_id, v_reason, v_name);
  perform set_config('campcommand.receipts_books', '', true);
  return jsonb_build_object('statement_id', s.id, 'unlocked_by_name', v_name);
end $fn$;
revoke execute on function public.unlock_exported_statement(uuid, text) from public, anon, authenticated;
grant execute on function public.unlock_exported_statement(uuid, text) to authenticated;

-- ─── Export: relocks what was unlocked, records the tax treatment ───────────

CREATE OR REPLACE FUNCTION public.export_card_statement(p_statement_id uuid, p_format text, p_file_name text, p_date_format text, p_include_exported boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  s record; v_blockers jsonb; v_id uuid; v_rows int; v_total numeric; v_personal numeric; v_prev int; v_name text;
  v_treatment text;
begin
  select cs.*, c.label as card_label into s
    from card_statements cs join expense_cards c on c.id = cs.card_id where cs.id = p_statement_id;
  if s.id is null or not is_camp_admin(s.camp_id) then raise exception 'Only a camp admin can export statements'; end if;
  if p_format not in ('qbo_bank_3col', 'qbo_bank_4col', 'qbo_bills') then
    raise exception 'Unknown export format %', p_format;
  end if;

  v_blockers := card_month_blockers_internal(s.id);
  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'This month does not agree with the statement yet (%). Resolve it, or download it for review instead.',
      (select string_agg(b->>'code', ', ') from jsonb_array_elements(v_blockers) b);
  end if;

  select count(*) into v_prev from statement_lines l join receipts r on r.id = l.receipt_id
   where l.statement_id = s.id and r.status = 'exported';
  -- A month unlocked to correct is expected to be exported again; that is not a silent second export.
  if (s.export_id is not null or v_prev > 0) and not p_include_exported and s.reexport_needed_at is null then
    raise exception 'This statement was already exported. Tick "export again" to export it a second time.';
  end if;

  select count(*), coalesce(sum(amount), 0) into v_rows, v_total from statement_lines
   where statement_id = s.id and match_state <> 'personal' and (p_format <> 'qbo_bills' or amount > 0);
  select coalesce(sum(amount), 0) into v_personal from statement_lines
   where statement_id = s.id and match_state = 'personal';

  -- The person's own name. camp_members.display_name is a per-camp nickname, and in a demo camp
  -- it is "Demo guest" for whoever opened the link, which is what the export history recorded.
  v_name := receipts_person_name(s.camp_id);

  -- Mirrors defaultNonrecoverableTax() in src/lib/receipts.ts: the camp's choice, else "expense"
  -- when its rules recover less than all of the tax.
  if p_format = 'qbo_bills' then
    select coalesce(ts.nonrecoverable_tax,
             case when exists (select 1 from jsonb_array_elements(ts.tax_rules) e
                                where case when e ? 'federal_pct' and e ? 'provincial_pct'
                                           then (e->>'federal_pct')::numeric < 100 or (e->>'provincial_pct')::numeric < 100
                                           else coalesce((e->>'recoverable_pct')::numeric, 0) < 100 end)
                  then 'expense' else 'claim_all' end)
      into v_treatment from expense_tax_settings ts where ts.camp_id = s.camp_id;
    v_treatment := coalesce(v_treatment, 'claim_all');
  end if;

  perform set_config('campcommand.receipts_books', 'on', true);
  insert into expense_exports (camp_id, period_from, period_to, card_ids, format, file_name, include_exported,
                               row_count, total, created_by_name, statement_id, personal_total, date_format, tax_treatment)
  values (s.camp_id, s.period_month, (s.period_month + interval '1 month - 1 day')::date, array[s.card_id],
          p_format, p_file_name, p_include_exported or s.reexport_needed_at is not null, v_rows, v_total, v_name, s.id, v_personal,
          p_date_format, v_treatment)
  returning id into v_id;

  update receipt_unlocks set relocked_at = now(), relocked_export_id = v_id
   where relocked_at is null and (statement_id = s.id
         or receipt_id in (select receipt_id from statement_lines where statement_id = s.id and match_state = 'matched'));
  update receipts set status = 'exported', export_id = v_id, exported_at = now(),
                      unlocked_at = null, unlocked_by = null, unlocked_by_name = null, unlock_reason = null
   where id in (select receipt_id from statement_lines where statement_id = s.id and match_state = 'matched');
  update card_statements set export_id = v_id, exported_at = now(), reexport_needed_at = null, reexport_reason = null
   where id = s.id;
  perform set_config('campcommand.receipts_books', '', true);
  return jsonb_build_object('export_id', v_id, 'row_count', v_rows, 'total', v_total, 'personal_total', v_personal, 'tax_treatment', v_treatment);
end $fn$;
revoke execute on function public.export_card_statement(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.export_card_statement(uuid, text, text, text, boolean) to authenticated;

-- ─── Removing a receipt: committed at once, restorable ──────────────────────

-- Lines matched to a receipt, as they are, for a removal to restore.
create or replace function public.receipt_lines_snapshot_internal(p_receipt_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'match_state', match_state, 'receipt_id', receipt_id, 'note', note,
           'no_receipt_kind', no_receipt_kind, 'budget_code_id', budget_code_id, 'resolved_by', resolved_by, 'resolved_at', resolved_at)), '[]'::jsonb)
    from statement_lines where receipt_id = p_receipt_id
$fn$;
revoke execute on function public.receipt_lines_snapshot_internal(uuid) from public, anon, authenticated;

drop function if exists public.merge_duplicate_receipt(uuid, uuid);

-- Keep p_keep, remove p_remove. A statement match on the removed copy moves to the kept one; the
-- kept one takes the removed copy's budget code and purpose where it has none, and its photo when
-- p_take_photo (the undated copy was often the only one photographed). Recorded in
-- receipt_removals, so restore_removed_receipt() puts everything back.
create or replace function public.merge_duplicate_receipt(p_keep uuid, p_remove uuid, p_take_photo boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare k record; r record; v_admin boolean; v_line uuid; v_removal uuid; v_lines jsonb;
begin
  if p_keep = p_remove then raise exception 'Pick two different receipts'; end if;
  select * into k from receipts where id = p_keep;
  select * into r from receipts where id = p_remove;
  if k.id is null or r.id is null or k.camp_id <> r.camp_id then raise exception 'Receipt not found'; end if;
  v_admin := is_camp_admin(r.camp_id);
  if not v_admin then
    if not (can_see_receipt(k.camp_id, k.submitted_by, k.card_id) and get_camp_role(r.camp_id) = 'staff'
            and r.submitted_by = auth.uid() and r.status <> 'exported') then
      raise exception 'You can only remove a copy you snapped yourself';
    end if;
  end if;
  if r.status = 'exported' and r.unlocked_at is null then
    raise exception 'That copy was exported to QuickBooks. Unlock it to correct it before removing it.';
  end if;
  if k.status = 'exported' and k.unlocked_at is null and (p_take_photo or (k.budget_code_id is null and r.budget_code_id is not null)
                                                        or (k.purpose is null and r.purpose is not null)) then
    -- Keep the exported one exactly as exported: take nothing across.
    p_take_photo := false;
  end if;

  v_lines := receipt_lines_snapshot_internal(p_remove);
  select id into v_line from statement_lines where receipt_id = p_remove;
  if v_line is not null then
    if not v_admin then raise exception 'This copy is matched to a statement charge. Ask finance to remove it.'; end if;
    if exists (select 1 from statement_lines where receipt_id = p_keep) then
      raise exception 'Both copies are matched to charges. Undo one of the matches first.';
    end if;
  end if;

  insert into receipt_removals (camp_id, receipt_id, kind, kept_receipt_id, receipt_row, lines_before, kept_before, removed_by_name)
  values (r.camp_id, r.id, 'duplicate', k.id, to_jsonb(r), v_lines,
          jsonb_build_object('budget_code_id', k.budget_code_id, 'purpose', k.purpose, 'file_path', k.file_path,
                             'file_name', k.file_name, 'file_type', k.file_type, 'possible_duplicate_of', k.possible_duplicate_of),
          receipts_person_name(r.camp_id))
  returning id into v_removal;

  if v_line is not null then
    update statement_lines set receipt_id = p_keep where id = v_line;
  end if;

  if not (k.status = 'exported' and k.unlocked_at is null) then
    update receipts
       set budget_code_id = coalesce(k.budget_code_id, r.budget_code_id),
           purpose = coalesce(k.purpose, r.purpose),
           file_path = case when p_take_photo and r.file_path is not null then r.file_path else file_path end,
           file_name = case when p_take_photo and r.file_path is not null then r.file_name else file_name end,
           file_type = case when p_take_photo and r.file_path is not null then r.file_type else file_type end,
           possible_duplicate_of = case when possible_duplicate_of = p_remove then null else possible_duplicate_of end
     where id = p_keep;
  end if;
  -- The photo is not deleted from storage: a restore needs it, and nothing can sign a URL for a
  -- file whose row is gone (can_read_receipt_file looks the row up).
  delete from receipts where id = p_remove;
  return jsonb_build_object('removal_id', v_removal, 'removed', p_remove, 'kept', p_keep, 'moved_line', v_line,
                            'took_photo', p_take_photo and r.file_path is not null);
end $fn$;
revoke execute on function public.merge_duplicate_receipt(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.merge_duplicate_receipt(uuid, uuid, boolean) to authenticated;

-- Delete one receipt, restorably. A matched receipt's charge goes back to unexplained.
create or replace function public.remove_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare r record; v_removal uuid; v_lines jsonb;
begin
  select * into r from receipts where id = p_receipt_id;
  if r.id is null then raise exception 'Receipt not found'; end if;
  if not (is_camp_admin(r.camp_id) or (get_camp_role(r.camp_id) = 'staff' and r.submitted_by = auth.uid() and r.status <> 'exported')) then
    raise exception 'You can only delete a receipt you snapped yourself';
  end if;
  if r.status = 'exported' and r.unlocked_at is null then
    raise exception 'This receipt was exported to QuickBooks. Unlock it to correct it before removing it.';
  end if;
  v_lines := receipt_lines_snapshot_internal(r.id);
  if jsonb_array_length(v_lines) > 0 and not is_camp_admin(r.camp_id) then
    raise exception 'This receipt is matched to a statement charge. Ask finance to remove it.';
  end if;
  insert into receipt_removals (camp_id, receipt_id, kind, receipt_row, lines_before, removed_by_name)
  values (r.camp_id, r.id, 'deleted', to_jsonb(r), v_lines, receipts_person_name(r.camp_id))
  returning id into v_removal;
  -- "Matched" names a receipt; deleting the receipt leaves the charge unexplained, not broken.
  update statement_lines set match_state = 'unmatched', receipt_id = null, resolved_by = null, resolved_at = null
   where receipt_id = r.id;
  delete from receipts where id = r.id;
  return jsonb_build_object('removal_id', v_removal, 'removed', r.id, 'file_path', r.file_path);
end $fn$;
revoke execute on function public.remove_receipt(uuid) from public, anon, authenticated;
grant execute on function public.remove_receipt(uuid) to authenticated;

-- Undo a removal: the receipt comes back as it was, its statement matches with it, and a kept
-- duplicate gives back what it took. Refused when something has moved on since (the charge was
-- matched to another receipt, or the kept copy was exported).
create or replace function public.restore_removed_receipt(p_removal_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare x record; v_row receipts; l jsonb; v_kept record; v_skipped int := 0;
begin
  select * into x from receipt_removals where id = p_removal_id;
  if x.id is null then raise exception 'Nothing to restore'; end if;
  if not (is_camp_admin(x.camp_id) or (x.removed_by = auth.uid() and get_camp_role(x.camp_id) = 'staff')) then
    raise exception 'Only finance or the person who removed it can put it back';
  end if;
  if x.restored_at is not null then raise exception 'That receipt was already put back'; end if;
  if exists (select 1 from receipts where id = x.receipt_id) then raise exception 'That receipt is already there'; end if;

  if x.kept_receipt_id is not null then
    select * into v_kept from receipts where id = x.kept_receipt_id;
    if v_kept.id is not null and v_kept.status = 'exported' and v_kept.unlocked_at is null
       and (x.receipt_row->>'status') is distinct from 'exported' then
      raise exception 'The copy that was kept has been exported since. Unlock it to correct it first.';
    end if;
  end if;

  perform set_config('campcommand.receipts_books', 'on', true);
  if v_kept.id is not null and x.kept_before is not null then
    update receipts
       set budget_code_id = (x.kept_before->>'budget_code_id')::uuid,
           purpose = x.kept_before->>'purpose',
           file_path = x.kept_before->>'file_path',
           file_name = x.kept_before->>'file_name',
           file_type = x.kept_before->>'file_type',
           possible_duplicate_of = (x.kept_before->>'possible_duplicate_of')::uuid
     where id = v_kept.id;
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

-- ─── Ask the card holder about a receipt ────────────────────────────────────
-- One email a day per receipt, to the holder of its card (else whoever snapped it), with a
-- text-length copy the screen shows as a preview.
create or replace function public.ask_card_holder_about_receipt(p_receipt_id uuid, p_question text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  r record; v_to text; v_name text; v_tz text; v_camp_name text; v_card text; v_amount text; v_snapped text;
  v_question text; v_text text; v_html text; v_rule text; v_queued boolean;
begin
  select rc.*, c.label as card_label, c.holder_email, c.holder_name, c.holder_member_id
    into r
    from receipts rc left join expense_cards c on c.id = rc.card_id
   where rc.id = p_receipt_id;
  if r.id is null or not is_camp_admin(r.camp_id) then raise exception 'Only finance can ask a card holder about a receipt'; end if;

  select coalesce(timezone, 'America/Toronto'), name into v_tz, v_camp_name from camps where id = r.camp_id;
  v_to := nullif(btrim(r.holder_email), '');
  v_name := r.holder_name;
  if v_to is null and r.holder_member_id is not null then
    select user_email(m.user_id), coalesce(v_name, m.display_name) into v_to, v_name from camp_members m where m.id = r.holder_member_id;
  end if;
  if v_to is null and r.submitted_by is not null then
    v_to := user_email(r.submitted_by);
    v_name := coalesce(v_name, r.submitter_name);
  end if;
  if v_to is null then return jsonb_build_object('queued', false, 'reason', 'no_email'); end if;

  v_card := coalesce(r.card_label, 'no card');
  v_amount := case when r.total is null then 'an unknown amount' else '$' || to_char(r.total, 'FM999,999,990.00') end;
  v_snapped := to_char(r.created_at at time zone v_tz, 'FMMon FMDD');
  v_question := coalesce(nullif(btrim(p_question), ''),
    case when r.purchase_date is null then 'What date was it bought?' else 'Can you tell us more about it?' end);
  v_text := left('Receipt question: ' || coalesce(r.vendor, 'a receipt') || ', ' || v_amount || ' (' || v_card || ', snapped '
    || v_snapped || '). ' || v_question || ' Reply, or fix it in CampCommand > Receipts.', 320);
  v_html := msg_wrap('A question about a receipt',
    'Finance is reconciling <strong>' || expense_html(v_card) || '</strong> and has a question about this receipt:'
    || '<br><br><strong>' || expense_html(coalesce(r.vendor, 'Receipt')) || '</strong>, ' || v_amount || ', snapped ' || v_snapped
    || '<br><br>' || expense_html(v_question)
    || '<br><br>Reply to this email, or open it in CampCommand under <em>Receipts</em>.', v_camp_name);
  v_rule := 'receipt_question:' || to_char(now() at time zone v_tz, 'YYYY-MM-DD');

  perform queue_message(r.camp_id, 'receipt', r.id, v_rule, 'card_holder', v_to, v_name, null,
    now(), 'A question about your ' || coalesce(r.vendor, '') || ' receipt', v_html, v_text);
  v_queued := exists (select 1 from scheduled_messages where subject_type = 'receipt' and subject_id = r.id
                        and rule_key = v_rule and recipient_kind = 'card_holder');
  update receipts set holder_asked_at = now() where id = r.id;
  return jsonb_build_object('queued', v_queued, 'to_email', v_to, 'to_name', v_name, 'body_text', v_text);
end $fn$;
revoke execute on function public.ask_card_holder_about_receipt(uuid, text) from public, anon, authenticated;
grant execute on function public.ask_card_holder_about_receipt(uuid, text) to authenticated;
