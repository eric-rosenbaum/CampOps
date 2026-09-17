-- Resets the Receipts module in the staging "Prospect QA" camp to a known August 2026, so the J4
-- journey starts from the same place every run. STAGING ONLY, and only this camp.
--
--   Hana Holder  · Visa ··4821 · five receipts (one of them snapped twice) waiting for a statement
--   Omar Holder  · Visa ··7390 · one receipt, which Hana must never be able to see
--   Tax rules: the Ontario charity rebate preset (HST 50% federal / 82% provincial), not confirmed
do $$
declare
  v_camp uuid := (select id from camps where slug = 'prospect-qa' and deleted_at is null);
  v_hana uuid := 'e2e00000-0000-4000-8000-00000000000d';
  v_omar uuid := 'e2e00000-0000-4000-8000-00000000000e';
  v_admin uuid := 'e2e00000-0000-4000-8000-00000000000a';
  m_hana uuid; m_omar uuid;
begin
  if v_camp is null then raise exception 'Prospect QA camp not found'; end if;

  delete from scheduled_messages where camp_id = v_camp and subject_type in ('statement_line', 'receipt_review');
  delete from card_statements where camp_id = v_camp;
  delete from receipts where camp_id = v_camp;
  delete from expense_exports where camp_id = v_camp;
  delete from expense_cards where camp_id = v_camp;
  delete from expense_budget_codes where camp_id = v_camp;
  delete from expense_tax_settings where camp_id = v_camp;
  delete from ai_usage where camp_id = v_camp;

  select id into m_hana from camp_members where camp_id = v_camp and user_id = v_hana;
  select id into m_omar from camp_members where camp_id = v_camp and user_id = v_omar;

  insert into expense_budget_codes (id, camp_id, code, name, qb_account, sort_order) values
    ('bc000000-0000-4000-8000-000000000001', v_camp, 'PRG', 'Programs', 'Program Supplies', 10),
    ('bc000000-0000-4000-8000-000000000002', v_camp, 'MAINT', 'Maintenance', 'Repairs & Maintenance', 20),
    ('bc000000-0000-4000-8000-000000000003', v_camp, 'KIT', 'Kitchen', 'Kitchen Supplies', 30),
    ('bc000000-0000-4000-8000-000000000004', v_camp, 'WATER', 'Waterfront', 'Waterfront Equipment', 40),
    ('bc000000-0000-4000-8000-000000000005', v_camp, 'OFFICE', 'Office', 'Office Expenses', 50);

  insert into expense_cards (id, camp_id, label, holder_member_id, holder_name, last4, default_budget_code_id) values
    ('ec000000-0000-4000-8000-000000004821', v_camp, 'Visa ··4821', m_hana, 'Hana Holder', '4821', 'bc000000-0000-4000-8000-000000000002'),
    ('ec000000-0000-4000-8000-000000007390', v_camp, 'Visa ··7390', m_omar, 'Omar Holder', '7390', 'bc000000-0000-4000-8000-000000000001');

  -- The public service bodies' rebate for an Ontario charity, as the Settings preset writes it.
  insert into expense_tax_settings (camp_id, currency, province, claim_basis, tax_rules)
  values (v_camp, 'CAD', 'ON', 'psb', '[{"type":"HST","recoverable_pct":69.69,"federal_pct":50,"provincial_pct":82},{"type":"GST","recoverable_pct":50}]');

  insert into receipts (id, camp_id, card_id, submitted_by, submitter_name, vendor, purchase_date, subtotal, taxes, total,
                        budget_code_id, purpose, status, reviewed_by, reviewed_at, file_path, file_name, file_type, created_at) values
    ('ae000000-0000-4000-8000-000000000001', v_camp, 'ec000000-0000-4000-8000-000000004821', v_hana, 'Hana Holder',
     'Northwind Hardware', '2026-08-02', 75.00, '[{"type":"HST","rate_pct":13,"amount":9.75}]', 84.75,
     'bc000000-0000-4000-8000-000000000002', 'Dock hinges', 'ready', v_hana, now(),
     v_camp || '/ae000000-0000-4000-8000-000000000001.jpg', '02-on-hst.jpg', 'image/jpeg', now() - interval '40 days'),
    ('ae000000-0000-4000-8000-000000000002', v_camp, 'ec000000-0000-4000-8000-000000004821', v_hana, 'Hana Holder',
     'Birchbark Bakery', '2026-08-06', 23.40, '[]', 23.40,
     'bc000000-0000-4000-8000-000000000003', 'Bread for the overnight trip', 'ready', v_hana, now(),
     null, null, null, now() - interval '36 days'),
    ('ae000000-0000-4000-8000-000000000003', v_camp, 'ec000000-0000-4000-8000-000000004821', v_hana, 'Hana Holder',
     'Loons Landing Craft Supply', '2026-08-10', 138.16, '[{"type":"HST","rate_pct":13,"amount":17.96}]', 156.12,
     'bc000000-0000-4000-8000-000000000001', 'Craft week', 'ready', v_hana, now(),
     null, null, null, now() - interval '33 days'),
    ('ae000000-0000-4000-8000-000000000004', v_camp, 'ec000000-0000-4000-8000-000000004821', v_hana, 'Hana Holder',
     'Blue Heron Marine', '2026-08-20', 188.04, '[{"type":"HST","rate_pct":13,"amount":24.45}]', 212.49,
     'bc000000-0000-4000-8000-000000000004', 'Paddle repair kit', 'ready', v_hana, now(),
     null, null, null, now() - interval '26 days'),
    -- Finance snapped the emailed copy of the same purchase a week later.
    ('ae000000-0000-4000-8000-000000000005', v_camp, 'ec000000-0000-4000-8000-000000004821', v_admin, 'Teddy Admin',
     'Blue Heron Marine Ltd.', '2026-08-20', 188.04, '[{"type":"HST","rate_pct":13,"amount":24.45}]', 212.49,
     'bc000000-0000-4000-8000-000000000004', 'Paddle repair kit (emailed invoice)', 'ready', v_admin, now(),
     null, null, null, now() - interval '19 days'),
    ('ae000000-0000-4000-8000-000000000006', v_camp, 'ec000000-0000-4000-8000-000000007390', v_omar, 'Omar Holder',
     'Harbourview Books & Gifts', '2026-08-12', 76.47, '[{"type":"GST","rate_pct":5,"amount":3.82},{"type":"PST","rate_pct":7,"amount":5.35}]', 85.64,
     'bc000000-0000-4000-8000-000000000001', 'Board games for rainy days', 'ready', v_omar, now(),
     v_camp || '/ae000000-0000-4000-8000-000000000006.jpg', '09-crumpled.jpg', 'image/jpeg', now() - interval '34 days');
end $$;
select 'receipts QA reset' as result;
