-- Receipts, after a finance director used it: "this month agrees" went green too easily, a
-- receipt with no charge could only be edited or deleted, and the QuickBooks file did not add up
-- to the card bill.
--
--   * A receipt can be set aside for a month ("posts next month"), with a note. It stops blocking
--     that month and turns up in the next one, where it is expected to find its charge.
--   * Statements remember when they were exported. Exports now follow the statement -- one row per
--     charge at its posted date and amount -- so the file reconciles to the bill it came from.
--   * The month's blockers are computed here as well as on screen, so an export cannot mark a month
--     exported that the screen would have called unresolved.
--   * Removing a duplicate moves its statement match onto the copy that is kept. Deleting a
--     matched receipt used to fail on the "matched has a receipt" check.
--   * Tax settings record which way the camp claims tax back (input tax credits, the public service
--     bodies' rebate, none, or custom), and HST rules can carry separate federal and provincial
--     percentages. The demo seed now uses the Ontario charity rebate instead of a flat 50%.

-- ─── Columns ─────────────────────────────────────────────────────────────────

alter table public.receipts
  add column deferred_month date check (deferred_month is null or extract(day from deferred_month) = 1),
  add column deferred_note text;

alter table public.expense_exports
  add column statement_id uuid references public.card_statements(id) on delete set null,
  add column personal_total numeric(12,2),
  add column date_format text;

alter table public.card_statements
  add column export_id uuid references public.expense_exports(id) on delete set null,
  add column exported_at timestamptz;

alter table public.expense_tax_settings
  add column claim_basis text check (claim_basis is null or claim_basis in ('itc', 'psb', 'none', 'custom'));

-- ─── Guard: only finance sets a receipt aside ───────────────────────────────

CREATE OR REPLACE FUNCTION public.receipts_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  v_admin boolean := is_camp_admin(new.camp_id);
  t jsonb;
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
  return new;
end $fn$;

-- ─── What stands between a card-month and agreeing ──────────────────────────
-- Mirrors monthAgreement() in src/lib/receipts.ts; the SQL suite and the Vitest suite hold the two
-- to the same cases. Each blocker is {code, count}. Empty array: the month agrees.
--
--   total_missing        no statement total typed from the bill
--   total_mismatch       the imported lines do not add up to the bill's total
--   unexplained          charges with no receipt, no "no receipt needed" and no "personal"
--   amount_differs       a matched receipt's total is not the charge's amount
--   matched_needs_review a matched receipt nobody has confirmed yet
--   no_charge            receipts on this card dated this month (or set aside from last month)
--                        that no charge on any statement is matched to
--   undated              receipts on this card with no date, snapped this month or next, and
--                        not matched: they could be this month's, and appeared nowhere before
create or replace function public.card_month_blockers_internal(p_statement_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  s record; v_tz text; v_next date; v_prev date; v_out jsonb := '[]'::jsonb; v_n int; v_sum numeric;
begin
  select * into s from card_statements where id = p_statement_id;
  if s.id is null then raise exception 'Statement not found'; end if;
  select coalesce(timezone, 'America/Toronto') into v_tz from camps where id = s.camp_id;
  v_next := (s.period_month + interval '1 month')::date;
  v_prev := (s.period_month - interval '1 month')::date;

  select coalesce(sum(amount), 0) into v_sum from statement_lines where statement_id = s.id;
  if s.statement_total is null then
    v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'total_missing', 'count', 1));
  elsif s.statement_total <> v_sum then
    v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'total_mismatch', 'count', 1));
  end if;

  select count(*) into v_n from statement_lines where statement_id = s.id and amount > 0 and match_state = 'unmatched';
  if v_n > 0 then v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'unexplained', 'count', v_n)); end if;

  select count(*) into v_n from statement_lines l join receipts r on r.id = l.receipt_id
   where l.statement_id = s.id and l.match_state = 'matched' and r.total is distinct from l.amount;
  if v_n > 0 then v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'amount_differs', 'count', v_n)); end if;

  select count(*) into v_n from statement_lines l join receipts r on r.id = l.receipt_id
   where l.statement_id = s.id and l.match_state = 'matched' and r.status in ('processing', 'needs_review');
  if v_n > 0 then v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'matched_needs_review', 'count', v_n)); end if;

  select count(*) into v_n from receipts r
   where r.camp_id = s.camp_id and r.card_id = s.card_id and r.status <> 'processing'
     and not exists (select 1 from statement_lines l where l.receipt_id = r.id)
     and ((r.purchase_date >= s.period_month and r.purchase_date < v_next
           and r.deferred_month is distinct from s.period_month)
          or r.deferred_month = v_prev);
  if v_n > 0 then v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'no_charge', 'count', v_n)); end if;

  select count(*) into v_n from receipts r
   where r.camp_id = s.camp_id and r.card_id = s.card_id and r.purchase_date is null
     and not exists (select 1 from statement_lines l where l.receipt_id = r.id)
     and (r.created_at at time zone v_tz)::date >= s.period_month
     and (r.created_at at time zone v_tz)::date < (v_next + interval '1 month')::date;
  if v_n > 0 then v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'undated', 'count', v_n)); end if;

  return v_out;
end $fn$;
revoke execute on function public.card_month_blockers_internal(uuid) from public, anon, authenticated;

-- ─── Export one card-month ───────────────────────────────────────────────────
-- The file itself is written by the browser (toStatementExport in src/lib/receipts.ts); this
-- records the export and marks what went into the books. It refuses a month that does not agree:
-- "Download for review" is how a month that does not agree yet leaves the building, and it marks
-- nothing. Row count and total are computed here from the lines, never taken from the client.
--   bank formats: every line except personal charges (credits included, as the bank lists them)
--   bills:        charges only, except personal (QuickBooks' bill import has no credit memos)
create or replace function public.export_card_statement(
  p_statement_id uuid, p_format text, p_file_name text, p_date_format text, p_include_exported boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  s record; v_blockers jsonb; v_id uuid; v_rows int; v_total numeric; v_personal numeric; v_prev int; v_name text;
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
  if (s.export_id is not null or v_prev > 0) and not p_include_exported then
    raise exception 'This statement was already exported. Tick "export again" to export it a second time.';
  end if;

  select count(*), coalesce(sum(amount), 0) into v_rows, v_total from statement_lines
   where statement_id = s.id and match_state <> 'personal' and (p_format <> 'qbo_bills' or amount > 0);
  select coalesce(sum(amount), 0) into v_personal from statement_lines
   where statement_id = s.id and match_state = 'personal';

  -- The person's own name. camp_members.display_name is a per-camp nickname, and in a demo camp
  -- it is "Demo guest" for whoever opened the link, which is what the export history recorded.
  select coalesce(nullif(btrim(p.full_name), ''), m.display_name) into v_name
    from camp_members m left join profiles p on p.id = m.user_id
   where m.camp_id = s.camp_id and m.user_id = auth.uid() limit 1;

  insert into expense_exports (camp_id, period_from, period_to, card_ids, format, file_name, include_exported,
                               row_count, total, created_by_name, statement_id, personal_total, date_format)
  values (s.camp_id, s.period_month, (s.period_month + interval '1 month - 1 day')::date, array[s.card_id],
          p_format, p_file_name, p_include_exported, v_rows, v_total, v_name, s.id, v_personal, p_date_format)
  returning id into v_id;

  update receipts set status = 'exported', export_id = v_id, exported_at = now()
   where id in (select receipt_id from statement_lines where statement_id = s.id and match_state = 'matched');
  update card_statements set export_id = v_id, exported_at = now() where id = s.id;
  return jsonb_build_object('export_id', v_id, 'row_count', v_rows, 'total', v_total, 'personal_total', v_personal);
end $fn$;
revoke execute on function public.export_card_statement(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.export_card_statement(uuid, text, text, text, boolean) to authenticated;

-- ─── Keep one copy of a duplicate ────────────────────────────────────────────
-- Removes p_remove and keeps p_keep. A statement match on the removed copy moves to the kept one,
-- and the kept one takes the removed copy's budget code and purpose where it has none.
create or replace function public.merge_duplicate_receipt(p_keep uuid, p_remove uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare k record; r record; v_admin boolean; v_line uuid;
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

  select id into v_line from statement_lines where receipt_id = p_remove;
  if v_line is not null then
    if not v_admin then raise exception 'This copy is matched to a statement charge. Ask finance to remove it.'; end if;
    if exists (select 1 from statement_lines where receipt_id = p_keep) then
      raise exception 'Both copies are matched to charges. Undo one of the matches first.';
    end if;
    update statement_lines set receipt_id = p_keep where id = v_line;
  end if;

  if k.status <> 'exported' or v_admin then
    update receipts
       set budget_code_id = coalesce(k.budget_code_id, r.budget_code_id),
           purpose = coalesce(k.purpose, r.purpose),
           possible_duplicate_of = case when possible_duplicate_of = p_remove then null else possible_duplicate_of end
     where id = p_keep;
  end if;
  delete from receipts where id = p_remove;
  return jsonb_build_object('removed', p_remove, 'kept', p_keep, 'moved_line', v_line, 'file_path', r.file_path);
end $fn$;
revoke execute on function public.merge_duplicate_receipt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_duplicate_receipt(uuid, uuid) to authenticated;

-- ─── Demo seed: the tax rules a camp is likeliest to have ───────────────────

CREATE OR REPLACE FUNCTION public.seed_demo_receipts_internal(p_camp uuid)
 RETURNS TABLE(receipt_id uuid, file_path text, sample_file text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  v_today date := demo_camp_today(p_camp);
  v_last  date := date_trunc('month', v_today - interval '1 month')::date;
  r record;
  v_rid uuid;
  v_stmt uuid;
  v_taxes jsonb;
  v_sub numeric; v_tax numeric; v_total numeric;
begin
  -- Sample rows only: statements (their lines cascade), receipts, cards, codes, settings.
  delete from card_statements where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'statement:' || k) from unnest(array['A','B']) k);
  delete from receipts where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'receipt:' || k) from generate_series(1, 40) k);

  for r in select * from (values
    ('PRG',    'Programs',            'Program Supplies',        10),
    ('ARTS',   'Arts & crafts',       'Program Supplies:Arts',   20),
    ('WATER',  'Waterfront',          'Waterfront Equipment',    30),
    ('MAINT',  'Maintenance',         'Repairs & Maintenance',   40),
    ('KIT',    'Kitchen',             'Kitchen Supplies',        50),
    ('HEALTH', 'Health centre',       'Medical Supplies',        60),
    ('TRIP',   'Trips & travel',      'Travel',                  70),
    ('OFFICE', 'Office',              'Office Expenses',         80)
  ) as t(code, name, qb, sort)
  loop
    insert into expense_budget_codes (id, camp_id, code, name, qb_account, sort_order)
    values (demo_seed_uuid(p_camp, 'code:' || r.code), p_camp, r.code, r.name, r.qb, r.sort)
    on conflict do nothing;
  end loop;

  for r in select * from (values
    ('A', 'Visa ··4821', 'Maya Torres (Waterfront)',   '4821', 'WATER'),
    ('B', 'Visa ··7390', 'Luis Ortega (Maintenance)',  '7390', 'MAINT'),
    ('C', 'Visa ··1156', 'Priya Shah (Programs)',      '1156', 'PRG')
  ) as t(k, label, holder, last4, code)
  loop
    insert into expense_cards (id, camp_id, label, holder_name, holder_email, last4, default_budget_code_id)
    values (demo_seed_uuid(p_camp, 'card:' || r.k), p_camp, r.label, r.holder,
      lower(split_part(r.holder, ' ', 1)) || '.' || lower(split_part(r.holder, ' ', 2)) || '@example.com', r.last4,
      (select id from expense_budget_codes where camp_id = p_camp and code = r.code))
    on conflict (id) do update set label = excluded.label, holder_name = excluded.holder_name, last4 = excluded.last4;
  end loop;

  -- A camp is a charity or qualifying non-profit far more often than it is a GST/HST registrant
  -- claiming full input tax credits, so the sample is the public service bodies' rebate for an
  -- Ontario charity: 50% of GST and the federal part of HST, 82% of the provincial part (CRA
  -- RC4034). It was a flat "HST 50%", which understated an Ontario camp's rebate by a third.
  insert into expense_tax_settings (camp_id, currency, province, claim_basis, tax_rules)
  values (p_camp, 'CAD', 'ON', 'psb', '[{"type":"HST","recoverable_pct":69.69,"federal_pct":50,"provincial_pct":82},{"type":"GST","recoverable_pct":50}]')
  on conflict (camp_id) do nothing;

  -- Last month, three cards. HST 13% unless noted. Day = day of last month.
  --  k  card  day  vendor                          subtotal  tax    code     purpose
  for r in select * from (values
    (1,  'A', 2,  'Blue Heron Marine',               188.04, 'HST', 'WATER',  'Paddle repair kit'),
    (2,  'A', 5,  'Northwind Hardware',               75.00, 'HST', 'WATER',  'Dock cleats'),
    (3,  'A', 9,  'Pinegrove General Store',          30.47, 'HST', 'KIT',    'Ice for the waterfront coolers'),
    (4,  'A', 12, 'Lakeview Pharmacy',                42.65, 'HST', 'HEALTH', 'Sunscreen for swim staff'),
    (5,  'A', 15, 'Blue Heron Marine',               312.39, 'HST', 'WATER',  'Two throw bags and a whistle kit'),
    (6,  'A', 15, 'Blue Heron Marine',               312.39, 'HST', 'WATER',  'Two throw bags and a whistle kit'),
    (7,  'A', 19, 'Trillium Craft Supply',            77.46, 'HST', 'ARTS',   'Tie-dye kits'),
    (8,  'A', 23, 'Northwind Hardware',               18.99, 'HST', 'WATER',  'Rope'),
    (9,  'A', 27, 'The Loon''s Nest Grill',          142.00, 'HST', 'TRIP',   'Staff dinner on the canoe trip'),
    (10, 'B', 3,  'Northwind Hardware',              264.18, 'HST', 'MAINT',  'Hinges and door closers'),
    (11, 'B', 7,  'Foothills Lumber Yard',           612.40, 'HST', 'MAINT',  'Dock decking'),
    (12, 'B', 11, 'Northwind Hardware',               58.20, 'HST', 'MAINT',  'Paint rollers'),
    (13, 'B', 16, 'Cedar Valley Electric Supply',    129.75, 'HST', 'MAINT',  'Breaker for the dining hall'),
    (14, 'B', 21, 'Pinegrove General Store',          22.10, 'HST', 'KIT',    'Emergency milk run'),
    (15, 'B', 26, 'Northwind Hardware',               96.33, 'HST', 'MAINT',  'Plumbing fittings'),
    (16, 'C', 4,  'Trillium Craft Supply',           146.80, 'HST', 'ARTS',   'Beads and string'),
    (17, 'C', 8,  'Paper Moon Stationers',            64.12, 'HST', 'OFFICE', 'Name tags'),
    (18, 'C', 13, 'Trillium Craft Supply',            88.45, 'HST', 'ARTS',   'Watercolour paper'),
    (19, 'C', 18, 'Maple Leaf Games & Toys',         119.99, 'HST', 'PRG',    'Evening program prizes'),
    (20, 'C', 25, 'Pinegrove General Store',          35.60, 'HST', 'PRG',    'Candy for the carnival')
  ) as t(k, card, day, vendor, subtotal, tax, code, purpose)
  loop
    v_rid := demo_seed_uuid(p_camp, 'receipt:' || r.k);
    v_tax := round(r.subtotal * 0.13, 2);
    v_total := r.subtotal + v_tax;
    insert into receipts (id, camp_id, card_id, submitter_name, vendor, purchase_date, subtotal, taxes, total, currency,
      budget_code_id, purpose, status, reviewed_at, possible_duplicate_of, created_at)
    values (v_rid, p_camp, demo_seed_uuid(p_camp, 'card:' || r.card),
      (select holder_name from expense_cards where id = demo_seed_uuid(p_camp, 'card:' || r.card)),
      r.vendor, v_last + (r.day - 1), r.subtotal,
      jsonb_build_array(jsonb_build_object('type', r.tax, 'rate_pct', 13, 'amount', v_tax)), v_total, 'CAD',
      (select id from expense_budget_codes where camp_id = p_camp and code = r.code), r.purpose, 'ready',
      (v_last + (r.day - 1) + 1)::timestamptz,
      case when r.k = 6 then demo_seed_uuid(p_camp, 'receipt:5') end,
      (v_last + (r.day - 1))::timestamptz + interval '15 hours');
  end loop;

  -- Card A's statement: every receipt matched except the one snapped twice, plus one fuel charge
  -- nobody handed in a receipt for. Card B's statement agrees to the cent. Card C has no statement
  -- yet -- the visitor imports it from the guide's sample CSV.
  v_stmt := demo_seed_uuid(p_camp, 'statement:A');
  insert into card_statements (id, camp_id, card_id, period_month, statement_total, file_name, created_at)
  values (v_stmt, p_camp, demo_seed_uuid(p_camp, 'card:A'), v_last, 0, 'visa-4821-statement.csv', now() - interval '3 days');
  insert into statement_lines (id, statement_id, camp_id, posted_date, description, amount, match_state, receipt_id, resolved_at)
  select demo_seed_uuid(p_camp, 'line:A:' || k), v_stmt, p_camp, r2.purchase_date + 1, upper(r2.vendor), r2.total, 'matched', r2.id, now() - interval '2 days'
    from generate_series(1, 9) k join receipts r2 on r2.id = demo_seed_uuid(p_camp, 'receipt:' || k)
   where k <> 6;
  insert into statement_lines (id, statement_id, camp_id, posted_date, description, amount, match_state)
  values (demo_seed_uuid(p_camp, 'line:A:fuel'), v_stmt, p_camp, v_last + 21, 'MAPLE RIDGE GAS BAR', 64.37, 'unmatched');
  update card_statements set statement_total = (select sum(amount) from statement_lines where statement_id = v_stmt) where id = v_stmt;

  v_stmt := demo_seed_uuid(p_camp, 'statement:B');
  insert into card_statements (id, camp_id, card_id, period_month, statement_total, file_name, created_at)
  values (v_stmt, p_camp, demo_seed_uuid(p_camp, 'card:B'), v_last, 0, 'visa-7390-statement.csv', now() - interval '3 days');
  insert into statement_lines (id, statement_id, camp_id, posted_date, description, amount, match_state, receipt_id, resolved_at)
  select demo_seed_uuid(p_camp, 'line:B:' || k), v_stmt, p_camp, r2.purchase_date + 1, upper(r2.vendor), r2.total, 'matched', r2.id, now() - interval '2 days'
    from generate_series(10, 15) k join receipts r2 on r2.id = demo_seed_uuid(p_camp, 'receipt:' || k);
  update card_statements set statement_total = (select sum(amount) from statement_lines where statement_id = v_stmt) where id = v_stmt;

  -- Photos waiting for their holder to confirm what was read. These use the sample receipt images,
  -- so their dates are the dates printed on those images. They all sit on the third card, the one
  -- with no statement yet: on a card whose statement is already reconciled they would show up as
  -- "receipts with no charge" beside the one duplicate that list is meant to demonstrate.
  for r in select * from (values
    (31, 'C', '02-on-hst.jpg',          'Northwind Hardware',         '2026-08-03', 75.00,  '[{"type":"HST","rate_pct":13,"amount":9.75}]',  null::numeric, 84.75,  0.94, 'WATER'),
    (32, 'C', '12-stained-date.jpg',    'Trillium Craft Supply',      null,         77.46,  '[{"type":"HST","rate_pct":13,"amount":10.07}]', null, 87.53,  0.00, 'ARTS'),
    (33, 'C', '06-restaurant-tip.jpg',  'The Loon''s Nest Grill',     '2026-08-08', 142.00, '[{"type":"HST","rate_pct":13,"amount":18.46}]', 25,   185.46, 0.58, 'TRIP'),
    (34, 'C', '01-thermal-faded.jpg',   'Pinegrove General Store',    '2026-08-14', 30.47,  '[{"type":"HST","rate_pct":13,"amount":3.96}]',  null, 34.43,  0.61, 'KIT'),
    (35, 'C', '09-crumpled.jpg',        'Harbourview Books & Gifts',  '2026-09-02', 76.47,  '[{"type":"GST","rate_pct":5,"amount":3.82},{"type":"PST","rate_pct":7,"amount":5.35}]', null, 85.64, 0.71, 'PRG'),
    (36, 'C', '05-ab-gst.jpg',          'Foothills Farm & Feed',      '2026-08-19', 50.50,  '[{"type":"GST","rate_pct":5,"amount":2.53}]',   null, 53.03,  0.88, 'MAINT')
  ) as t(k, card, sample, vendor, day, subtotal, taxes, tip, total, conf, code)
  loop
    v_rid := demo_seed_uuid(p_camp, 'receipt:' || r.k);
    insert into receipts (id, camp_id, card_id, submitter_name, file_path, file_name, file_type, vendor, purchase_date,
      subtotal, taxes, tip, total, currency, budget_code_id, status, ai_result, ai_min_confidence, created_at)
    values (v_rid, p_camp, demo_seed_uuid(p_camp, 'card:' || r.card),
      (select holder_name from expense_cards where id = demo_seed_uuid(p_camp, 'card:' || r.card)),
      p_camp || '/' || v_rid || '.jpg', r.sample, 'image/jpeg', r.vendor, r.day::date,
      r.subtotal, r.taxes::jsonb, r.tip, r.total, 'CAD',
      (select id from expense_budget_codes where camp_id = p_camp and code = r.code), 'needs_review',
      jsonb_build_object(
        'readable', true, 'vendor', r.vendor, 'purchaseDate', r.day, 'subtotal', r.subtotal,
        'taxes', (select coalesce(jsonb_agg(jsonb_build_object('type', e->>'type', 'ratePct', (e->>'rate_pct')::numeric, 'amount', (e->>'amount')::numeric)), '[]'::jsonb)
                    from jsonb_array_elements(r.taxes::jsonb) e),
        'tip', r.tip, 'total', r.total, 'currency', 'CAD',
        'cardLast4', (select last4 from expense_cards where id = demo_seed_uuid(p_camp, 'card:' || r.card)),
        'confidence', jsonb_build_object('vendor', greatest(r.conf, 0.9), 'date', case when r.day is null then 0 else greatest(r.conf, 0.7) end,
                                         'subtotal', r.conf, 'taxes', r.conf, 'tip', case when r.tip is null then 1 else r.conf end,
                                         'total', greatest(r.conf, 0.8), 'currency', 0.95),
        'minConfidence', r.conf,
        'flags', jsonb_build_object('mathMismatch', false, 'dateOutOfRange', false, 'currencyUnsupported', false),
        'model', 'sample'),
      r.conf, now() - make_interval(hours => 3 * (r.k - 30)));
    receipt_id := v_rid; file_path := p_camp || '/' || v_rid || '.jpg'; sample_file := r.sample;
    return next;
  end loop;

  perform plan_receipt_messages_internal();
end;
$fn$;

revoke execute on function public.seed_demo_receipts_internal(uuid) from public, anon, authenticated;
grant execute on function public.seed_demo_receipts_internal(uuid) to service_role;
