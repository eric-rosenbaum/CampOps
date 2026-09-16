-- Receipts: company-card receipts are photographed, read, coded, matched to the card statement,
-- summarised by tax type and exported for QuickBooks.
--
-- The one module in the product with private-per-person data. A card holder's receipts are the
-- holder's and finance's business, not the whole staff's: before this, anything a staff member
-- could see in a module, every staff member could see. So visibility is per row here, and the
-- storage bucket mirrors it -- a signed URL is only ever issued to someone who could read the row.
--
-- Money is numeric(12,2) everywhere and compared in cents by the client. Statement lines are
-- positive for a charge and negative for a credit, whatever sign the bank exported them in.

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table public.expense_budget_codes (
  id          uuid primary key default gen_random_uuid(),
  camp_id     uuid not null references public.camps(id) on delete cascade,
  code        text not null,
  name        text not null,
  -- The QuickBooks account name the finance director codes this bucket to. Free text: we do not
  -- talk to QuickBooks, so a typo here is a typo in the export, not a sync failure.
  qb_account  text,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (camp_id, code)
);

create table public.expense_cards (
  id                      uuid primary key default gen_random_uuid(),
  camp_id                 uuid not null references public.camps(id) on delete cascade,
  label                   text not null,
  holder_member_id        uuid references public.camp_members(id) on delete set null,
  holder_name             text,
  holder_email            text,
  last4                   text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  default_budget_code_id  uuid references public.expense_budget_codes(id) on delete set null,
  active                  boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- One row per camp. No rates are pre-filled as fact: the recoverable share depends on the camp's
-- charity / public-service-body status and its province, which only its finance director knows.
create table public.expense_tax_settings (
  camp_id     uuid primary key references public.camps(id) on delete cascade,
  currency    text not null default 'CAD' check (currency in ('CAD','USD')),
  province    text,
  -- [{"type":"GST","recoverable_pct":50}, ...]
  tax_rules   jsonb not null default '[]'::jsonb check (jsonb_typeof(tax_rules) = 'array'),
  confirmed_at timestamptz,
  confirmed_by uuid,
  updated_at  timestamptz not null default now()
);

create table public.expense_exports (
  id                uuid primary key default gen_random_uuid(),
  camp_id           uuid not null references public.camps(id) on delete cascade,
  period_from       date,
  period_to         date,
  card_ids          uuid[] not null default '{}',
  format            text not null,
  file_name         text,
  include_exported  boolean not null default false,
  row_count         integer not null default 0,
  total             numeric(12,2) not null default 0,
  created_by        uuid default auth.uid(),
  created_by_name   text,
  created_at        timestamptz not null default now()
);

create table public.receipts (
  id                    uuid primary key default gen_random_uuid(),
  camp_id               uuid not null references public.camps(id) on delete cascade,
  card_id               uuid references public.expense_cards(id) on delete set null,
  submitted_by          uuid default auth.uid(),
  submitter_name        text,
  -- Private bucket `receipts`, path <camp_id>/<receipt_id>.<ext>.
  file_path             text,
  file_name             text,
  file_type             text,
  vendor                text,
  purchase_date         date,
  subtotal              numeric(12,2),
  -- [{"type":"GST|HST|PST|QST|other","rate_pct":5,"amount":1.23}]
  taxes                 jsonb not null default '[]'::jsonb check (jsonb_typeof(taxes) = 'array'),
  tip                   numeric(12,2),
  total                 numeric(12,2),
  currency              text not null default 'CAD' check (currency in ('CAD','USD')),
  budget_code_id        uuid references public.expense_budget_codes(id) on delete set null,
  -- Optional: [{"budget_code_id":uuid,"amount":12.34}] when one receipt spans budget buckets.
  splits                jsonb not null default '[]'::jsonb check (jsonb_typeof(splits) = 'array'),
  purpose               text,
  status                text not null default 'processing'
                          check (status in ('processing','needs_review','ready','exported')),
  ai_result             jsonb,
  ai_min_confidence     numeric(4,3),
  reviewed_by           uuid,
  reviewed_at           timestamptz,
  possible_duplicate_of uuid references public.receipts(id) on delete set null,
  duplicate_dismissed   boolean not null default false,
  export_id             uuid references public.expense_exports(id) on delete set null,
  exported_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index receipts_camp_date_idx on public.receipts (camp_id, purchase_date);
create index receipts_card_idx on public.receipts (card_id);
create index receipts_submitted_by_idx on public.receipts (submitted_by);

create table public.card_statements (
  id               uuid primary key default gen_random_uuid(),
  camp_id          uuid not null references public.camps(id) on delete cascade,
  card_id          uuid not null references public.expense_cards(id) on delete cascade,
  period_month     date not null check (extract(day from period_month) = 1),
  statement_total  numeric(12,2),
  file_name        text,
  uploaded_by      uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Importing the same month twice doubled every charge in the reconciliation. One per card-month.
  unique (card_id, period_month)
);

create table public.statement_lines (
  id            uuid primary key default gen_random_uuid(),
  statement_id  uuid not null references public.card_statements(id) on delete cascade,
  camp_id       uuid not null references public.camps(id) on delete cascade,
  posted_date   date not null,
  description   text not null default '',
  amount        numeric(12,2) not null,
  match_state   text not null default 'unmatched'
                  check (match_state in ('unmatched','matched','no_receipt_ok','personal')),
  receipt_id    uuid references public.receipts(id) on delete set null,
  note          text,
  resolved_by   uuid,
  resolved_at   timestamptz,
  reminded_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A matched line names its receipt and nothing else does. Without this a line could say
  -- "matched" with no receipt behind it and the month would agree on nothing.
  constraint statement_lines_match_has_receipt check ((match_state = 'matched') = (receipt_id is not null))
);
create index statement_lines_statement_idx on public.statement_lines (statement_id);
-- One receipt pays for one charge. Matching the same receipt to two lines made two charges look
-- documented by one piece of paper.
create unique index statement_lines_one_line_per_receipt on public.statement_lines (receipt_id)
  where receipt_id is not null;

create table public.ai_usage (
  id          uuid primary key default gen_random_uuid(),
  camp_id     uuid not null references public.camps(id) on delete cascade,
  user_id     uuid default auth.uid(),
  function    text not null,
  created_at  timestamptz not null default now()
);
create index ai_usage_camp_fn_idx on public.ai_usage (camp_id, function, created_at);

-- ─── updated_at ──────────────────────────────────────────────────────────────

create trigger expense_budget_codes_updated before update on public.expense_budget_codes
  for each row execute function public.update_updated_at();
create trigger expense_cards_updated before update on public.expense_cards
  for each row execute function public.update_updated_at();
create trigger expense_tax_settings_updated before update on public.expense_tax_settings
  for each row execute function public.update_updated_at();
create trigger receipts_updated before update on public.receipts
  for each row execute function public.update_updated_at();
create trigger card_statements_updated before update on public.card_statements
  for each row execute function public.update_updated_at();
create trigger statement_lines_updated before update on public.statement_lines
  for each row execute function public.update_updated_at();

-- ─── Visibility helpers ──────────────────────────────────────────────────────

-- Is the signed-in person the holder of this card? Keyed on the membership in the card's own
-- camp, so a card cloned into a demo camp (which keeps the source's member id) holds nobody.
create or replace function public.is_expense_card_holder(p_card_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from expense_cards c
      join camp_members m on m.id = c.holder_member_id and m.camp_id = c.camp_id
     where c.id = p_card_id and m.user_id = auth.uid() and m.is_active);
$$;

-- Admin: every receipt. Staff: what they submitted, and what was charged to a card they hold.
-- Viewer: nothing. A viewer is an observer of operations, not of who bought what.
create or replace function public.can_see_receipt(p_camp_id uuid, p_submitted_by uuid, p_card_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case get_camp_role(p_camp_id)
    when 'admin' then true
    when 'staff' then (p_submitted_by = auth.uid())
                      or (p_card_id is not null and is_expense_card_holder(p_card_id))
    else false end;
$$;

create or replace function public.can_use_receipts(p_camp_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(get_camp_role(p_camp_id) in ('admin','staff'), false); $$;

-- Storage: a receipt file is readable exactly when its row is. The path is looked up rather than
-- trusted, so renaming an object into someone else's receipt id grants nothing.
create or replace function public.can_read_receipt_file(p_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from receipts r
     where r.file_path = p_name
       and r.camp_id::text = split_part(p_name, '/', 1)
       and can_see_receipt(r.camp_id, r.submitted_by, r.card_id));
$$;

-- Upload / replace / delete: the row must already exist (it is created before the upload), be
-- visible to you, and not be exported -- an exported receipt's paper is part of the books.
create or replace function public.can_write_receipt_file(p_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from receipts r
     where r.id::text = split_part(split_part(p_name, '/', 2), '.', 1)
       and r.camp_id::text = split_part(p_name, '/', 1)
       and r.status <> 'exported'
       and (is_camp_admin(r.camp_id)
            or (get_camp_role(r.camp_id) = 'staff' and r.submitted_by = auth.uid())));
$$;

revoke execute on function public.is_expense_card_holder(uuid) from public, anon, authenticated;
revoke execute on function public.can_see_receipt(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.can_use_receipts(uuid) from public, anon, authenticated;
revoke execute on function public.can_read_receipt_file(text) from public, anon, authenticated;
revoke execute on function public.can_write_receipt_file(text) from public, anon, authenticated;
-- Policies are evaluated as the caller, so the caller has to be able to execute what they name.
grant execute on function public.is_expense_card_holder(uuid) to authenticated;
grant execute on function public.can_see_receipt(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_use_receipts(uuid) to authenticated;
grant execute on function public.can_read_receipt_file(text) to authenticated;
grant execute on function public.can_write_receipt_file(text) to authenticated;

-- ─── Integrity guard ─────────────────────────────────────────────────────────

create or replace function public.receipts_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
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
  if new.submitted_by is distinct from old.submitted_by then
    raise exception 'The submitter of a receipt cannot be changed';
  end if;
  return new;
end $$;
revoke execute on function public.receipts_guard() from public, anon, authenticated;

create trigger receipts_guard before insert or update on public.receipts
  for each row execute function public.receipts_guard();

create or replace function public.statement_lines_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- The line's camp is the statement's camp, always. Taken from the parent rather than trusted.
  select camp_id into new.camp_id from card_statements where id = new.statement_id;
  if new.camp_id is null then raise exception 'Statement not found'; end if;
  if new.receipt_id is not null and not exists (select 1 from receipts where id = new.receipt_id and camp_id = new.camp_id) then
    raise exception 'That receipt belongs to a different camp';
  end if;
  return new;
end $$;
revoke execute on function public.statement_lines_guard() from public, anon, authenticated;
create trigger statement_lines_guard before insert or update on public.statement_lines
  for each row execute function public.statement_lines_guard();

create or replace function public.card_statements_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from expense_cards where id = new.card_id and camp_id = new.camp_id) then
    raise exception 'That card belongs to a different camp';
  end if;
  return new;
end $$;
revoke execute on function public.card_statements_guard() from public, anon, authenticated;
create trigger card_statements_guard before insert or update on public.card_statements
  for each row execute function public.card_statements_guard();

create or replace function public.expense_cards_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.holder_member_id is not null and not exists (select 1 from camp_members where id = new.holder_member_id and camp_id = new.camp_id) then
    -- clone_camp copies cards but not members, so a cloned card arrives naming the source camp's
    -- member. Refusing that insert failed the whole clone; a demo card simply holds nobody.
    if tg_op = 'INSERT' then
      new.holder_member_id := null;
    else
      raise exception 'That card holder is not a member of this camp';
    end if;
  end if;
  if new.default_budget_code_id is not null and not exists (select 1 from expense_budget_codes where id = new.default_budget_code_id and camp_id = new.camp_id) then
    raise exception 'That budget code belongs to a different camp';
  end if;
  return new;
end $$;
revoke execute on function public.expense_cards_guard() from public, anon, authenticated;
create trigger expense_cards_guard before insert or update of holder_member_id, default_budget_code_id on public.expense_cards
  for each row execute function public.expense_cards_guard();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.expense_budget_codes enable row level security;
alter table public.expense_cards        enable row level security;
alter table public.expense_tax_settings enable row level security;
alter table public.expense_exports      enable row level security;
alter table public.receipts             enable row level security;
alter table public.card_statements      enable row level security;
alter table public.statement_lines      enable row level security;
alter table public.ai_usage             enable row level security;

-- Cards and codes are the picklists on the snap form, so staff read them. Only admins change them.
create policy expense_budget_codes_read on public.expense_budget_codes for select to authenticated
  using (can_use_receipts(camp_id));
create policy expense_budget_codes_admin on public.expense_budget_codes for all to authenticated
  using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

create policy expense_cards_read on public.expense_cards for select to authenticated
  using (can_use_receipts(camp_id));
create policy expense_cards_admin on public.expense_cards for all to authenticated
  using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

create policy expense_tax_settings_read on public.expense_tax_settings for select to authenticated
  using (can_use_receipts(camp_id));
create policy expense_tax_settings_admin on public.expense_tax_settings for all to authenticated
  using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

create policy receipts_read on public.receipts for select to authenticated
  using (can_see_receipt(camp_id, submitted_by, card_id));
create policy receipts_insert on public.receipts for insert to authenticated
  with check (is_camp_admin(camp_id)
              or (get_camp_role(camp_id) = 'staff' and submitted_by = auth.uid()));
-- WITH CHECK repeats the visibility rule so an update cannot move a receipt out of your own
-- sight (for instance onto a card you do not hold, after which you could not correct it back).
create policy receipts_update on public.receipts for update to authenticated
  using (can_see_receipt(camp_id, submitted_by, card_id))
  with check (can_see_receipt(camp_id, submitted_by, card_id));
create policy receipts_delete on public.receipts for delete to authenticated
  using (is_camp_admin(camp_id)
         or (get_camp_role(camp_id) = 'staff' and submitted_by = auth.uid() and status <> 'exported'));

create policy card_statements_admin on public.card_statements for all to authenticated
  using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));
create policy statement_lines_admin on public.statement_lines for all to authenticated
  using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));
create policy expense_exports_admin_read on public.expense_exports for select to authenticated
  using (is_camp_admin(camp_id));
-- Exports are only ever written by export_receipts(), which also marks the rows.
create policy ai_usage_admin_read on public.ai_usage for select to authenticated
  using (is_camp_admin(camp_id));

grant select, insert, update, delete on public.expense_budget_codes, public.expense_cards,
  public.expense_tax_settings, public.receipts, public.card_statements, public.statement_lines
  to authenticated;
grant select on public.expense_exports, public.ai_usage to authenticated;
revoke all on public.expense_budget_codes, public.expense_cards, public.expense_tax_settings,
  public.receipts, public.card_statements, public.statement_lines, public.expense_exports,
  public.ai_usage from anon;

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- Realtime applies RLS to each change, so a holder's screen only hears about their own receipts.

do $$
declare t text;
begin
  foreach t in array array['expense_budget_codes','expense_cards','expense_tax_settings','receipts',
                           'card_statements','statement_lines','expense_exports','ai_usage']
  loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─── Storage ─────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 20971520,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy receipts_files_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.can_read_receipt_file(name));
create policy receipts_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_write_receipt_file(name));
create policy receipts_files_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.can_write_receipt_file(name))
  with check (bucket_id = 'receipts' and public.can_write_receipt_file(name));
create policy receipts_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.can_write_receipt_file(name));

-- ─── RPCs ────────────────────────────────────────────────────────────────────

create or replace function public.expense_html(p text)
returns text language sql immutable set search_path = public
as $$ select replace(replace(replace(replace(coalesce(p,''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;') $$;
revoke execute on function public.expense_html(text) from public, anon, authenticated;

-- The AI quota, claimed before the model is called so a failed or abandoned read still counts:
-- the credit was spent either way. Counted per camp per camp-local day.
create or replace function public.claim_ai_quota(p_camp_id uuid, p_function text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tz text; v_type text; v_limit int; v_used int; v_start timestamptz;
begin
  if auth.uid() is null or not can_use_receipts(p_camp_id) then
    return jsonb_build_object('allowed', false, 'reason', 'not_member');
  end if;
  select coalesce(timezone, 'America/Toronto'), account_type into v_tz, v_type from camps where id = p_camp_id;
  v_limit := case when v_type = 'trial' then 25 else 60 end;
  v_start := (date_trunc('day', now() at time zone v_tz)) at time zone v_tz;
  -- Serialise claims per camp so two phones snapping at once cannot both take the last slot.
  perform pg_advisory_xact_lock(hashtext('ai_quota:' || p_camp_id::text || ':' || p_function));
  select count(*) into v_used from ai_usage
   where camp_id = p_camp_id and function = p_function and created_at >= v_start;
  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'quota', 'used', v_used, 'limit', v_limit);
  end if;
  insert into ai_usage (camp_id, user_id, function) values (p_camp_id, auth.uid(), p_function);
  return jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', v_limit);
end $$;
revoke execute on function public.claim_ai_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_ai_quota(uuid, text) to authenticated;

-- Import one card-month in one transaction. A half-imported statement reconciles against the
-- wrong total, so it is all the lines or none of them.
create or replace function public.import_card_statement(
  p_card_id uuid, p_period_month date, p_statement_total numeric, p_file_name text,
  p_lines jsonb, p_replace boolean default false)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_camp uuid; v_id uuid; l jsonb;
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
    delete from card_statements where id = v_id;
  end if;

  insert into card_statements (camp_id, card_id, period_month, statement_total, file_name)
  values (v_camp, p_card_id, p_period_month, round(p_statement_total, 2), p_file_name)
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    insert into statement_lines (statement_id, camp_id, posted_date, description, amount)
    values (v_id, v_camp, (l->>'posted_date')::date, left(coalesce(l->>'description',''), 300),
            round((l->>'amount')::numeric, 2));
  end loop;
  return v_id;
end $$;
revoke execute on function public.import_card_statement(uuid, date, numeric, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_card_statement(uuid, date, numeric, text, jsonb, boolean) to authenticated;

-- Resolve several lines at once ("Accept all"). All or nothing: accepting twenty suggestions and
-- having the eleventh fail halfway left a month that was neither the old state nor the new one.
-- p_changes: [{"line_id":uuid,"match_state":"matched|unmatched|no_receipt_ok|personal","receipt_id":uuid|null,"note":text|null}]
create or replace function public.resolve_statement_lines(p_changes jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare c jsonb; v_camp uuid; v_n int := 0; v_state text; v_receipt uuid;
begin
  for c in select * from jsonb_array_elements(p_changes) loop
    select camp_id into v_camp from statement_lines where id = (c->>'line_id')::uuid;
    if v_camp is null or not is_camp_admin(v_camp) then raise exception 'Only a camp admin can reconcile statements'; end if;
    v_state := coalesce(c->>'match_state', 'unmatched');
    v_receipt := case when v_state = 'matched' then nullif(c->>'receipt_id','')::uuid else null end;
    if v_state = 'matched' and exists (select 1 from statement_lines where receipt_id = v_receipt and id <> (c->>'line_id')::uuid) then
      raise exception 'That receipt is already matched to another charge' using errcode = 'unique_violation';
    end if;
    update statement_lines
       set match_state = v_state, receipt_id = v_receipt,
           note = case when c ? 'note' then c->>'note' else note end,
           resolved_by = case when v_state = 'unmatched' then null else auth.uid() end,
           resolved_at = case when v_state = 'unmatched' then null else now() end
     where id = (c->>'line_id')::uuid;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.resolve_statement_lines(jsonb) from public, anon, authenticated;
grant execute on function public.resolve_statement_lines(jsonb) to authenticated;

-- "Remind holder": one email a day per charge, to the card holder, with a text-length copy.
create or replace function public.remind_card_holder(p_line_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  l record; v_to text; v_name text; v_tz text; v_camp_name text; v_day text;
  v_amount text; v_date text; v_text text; v_html text; v_rule text; v_queued boolean;
begin
  select sl.*, cs.card_id, c.label as card_label, c.holder_email, c.holder_name, c.holder_member_id
    into l
    from statement_lines sl
    join card_statements cs on cs.id = sl.statement_id
    join expense_cards c on c.id = cs.card_id
   where sl.id = p_line_id;
  if l.id is null or not is_camp_admin(l.camp_id) then raise exception 'Only a camp admin can send reminders'; end if;

  select coalesce(timezone,'America/Toronto'), name into v_tz, v_camp_name from camps where id = l.camp_id;
  v_to := nullif(btrim(l.holder_email), '');
  v_name := l.holder_name;
  if v_to is null and l.holder_member_id is not null then
    select user_email(m.user_id), coalesce(v_name, m.display_name) into v_to, v_name
      from camp_members m where m.id = l.holder_member_id;
  end if;
  if v_to is null then
    return jsonb_build_object('queued', false, 'reason', 'no_email');
  end if;

  v_day := to_char(now() at time zone v_tz, 'YYYY-MM-DD');
  v_amount := to_char(l.amount, 'FM999,999,990.00');
  v_date := to_char(l.posted_date, 'FMMon FMDD');
  v_text := left('Receipt needed: $' || v_amount || ' at ' || coalesce(nullif(l.description,''), 'a merchant')
    || ' on ' || v_date || ' (' || l.card_label || '). Snap it in CampCommand > Receipts.', 320);
  v_html := msg_wrap('A receipt is missing',
    'Finance is reconciling <strong>' || expense_html(l.card_label) || '</strong> and could not find a receipt for:'
    || '<br><br><strong>$' || v_amount || '</strong> at ' || expense_html(l.description) || ' on ' || v_date
    || '<br><br>Snap a photo of it in CampCommand under <em>Receipts</em>. If there is no receipt, reply and say what it was for.',
    v_camp_name);
  v_rule := 'receipt_missing:' || v_day;

  perform queue_message(l.camp_id, 'statement_line', l.id, v_rule, 'card_holder', v_to, v_name, null,
    now(), 'Receipt needed: $' || v_amount || ' on ' || v_date, v_html, v_text);
  v_queued := exists (select 1 from scheduled_messages where subject_type = 'statement_line'
                        and subject_id = l.id and rule_key = v_rule and recipient_kind = 'card_holder');
  update statement_lines set reminded_at = now() where id = l.id;
  return jsonb_build_object('queued', v_queued, 'to_email', v_to, 'to_name', v_name, 'body_text', v_text);
end $$;
revoke execute on function public.remind_card_holder(uuid) from public, anon, authenticated;
grant execute on function public.remind_card_holder(uuid) to authenticated;

-- Mark receipts exported, and record the export. Refuses rows that were already exported unless
-- the caller says so explicitly: re-exporting silently is how the same receipt lands in the
-- books twice. The totals are computed here, not taken from the client.
create or replace function public.export_receipts(
  p_camp_id uuid, p_receipt_ids uuid[], p_period_from date, p_period_to date, p_card_ids uuid[],
  p_format text, p_file_name text, p_include_exported boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_n int; v_total numeric; v_bad int; v_prev int; v_name text;
begin
  if not is_camp_admin(p_camp_id) then raise exception 'Only a camp admin can export receipts'; end if;
  if p_format not in ('qbo_3col','qbo_4col','detailed') then raise exception 'Unknown export format %', p_format; end if;
  if coalesce(cardinality(p_receipt_ids), 0) = 0 then raise exception 'Nothing to export'; end if;

  select count(*) into v_n from receipts where id = any (p_receipt_ids) and camp_id = p_camp_id;
  if v_n <> cardinality(p_receipt_ids) then raise exception 'Some receipts are not in this camp'; end if;
  select count(*) into v_bad from receipts where id = any (p_receipt_ids) and status not in ('ready','exported');
  if v_bad > 0 then raise exception '% receipt(s) still need review', v_bad; end if;
  select count(*) into v_prev from receipts where id = any (p_receipt_ids) and status = 'exported';
  if v_prev > 0 and not p_include_exported then
    raise exception '% receipt(s) were already exported. Tick "include already exported" to export them again.', v_prev
      using errcode = 'P0001';
  end if;

  select coalesce(sum(total), 0) into v_total from receipts where id = any (p_receipt_ids);
  select coalesce(display_name, (select full_name from profiles where id = auth.uid())) into v_name
    from camp_members where camp_id = p_camp_id and user_id = auth.uid() limit 1;

  insert into expense_exports (camp_id, period_from, period_to, card_ids, format, file_name,
                               include_exported, row_count, total, created_by_name)
  values (p_camp_id, p_period_from, p_period_to, coalesce(p_card_ids, '{}'), p_format, p_file_name,
          p_include_exported, v_n, v_total, v_name)
  returning id into v_id;

  update receipts set status = 'exported', export_id = v_id, exported_at = now()
   where id = any (p_receipt_ids);
  return jsonb_build_object('export_id', v_id, 'row_count', v_n, 'total', v_total);
end $$;
revoke execute on function public.export_receipts(uuid, uuid[], date, date, uuid[], text, text, boolean) from public, anon, authenticated;
grant execute on function public.export_receipts(uuid, uuid[], date, date, uuid[], text, text, boolean) to authenticated;

-- Nightly nudge: a receipt someone snapped and never confirmed is invisible to finance, because
-- only reviewed receipts export. One digest per person per week while any has waited two days.
create or replace function public.plan_receipt_messages_internal()
returns integer
language plpgsql security definer set search_path = public
as $$
declare r record; v_n int := 0; v_to text; v_week text; v_text text;
begin
  for r in
    select rc.camp_id, rc.submitted_by, c.name as camp_name, coalesce(c.timezone,'America/Toronto') as tz,
           count(*) as waiting, min(rc.created_at) as oldest,
           (select m.display_name from camp_members m where m.camp_id = rc.camp_id and m.user_id = rc.submitted_by limit 1) as who
      from receipts rc
      join camps c on c.id = rc.camp_id
     where rc.status = 'needs_review'
       and rc.submitted_by is not null
       and rc.created_at < now() - interval '2 days'
       and c.deleted_at is null
       and coalesce(c.platform_modules->>'receipts', 'false') = 'true'
       and coalesce(c.modules->>'receipts', 'true') <> 'false'
     group by rc.camp_id, rc.submitted_by, c.name, c.timezone
  loop
    v_to := user_email(r.submitted_by);
    v_week := to_char(now() at time zone r.tz, 'IYYY-IW');
    v_text := left(r.waiting || ' receipt' || case when r.waiting = 1 then '' else 's' end
      || ' you snapped still need a quick check before finance can use them. Open CampCommand > Receipts.', 320);
    -- subject_id is the camp: queue_message dedupes on (subject_type, subject_id, rule_key, kind),
    -- and the person is folded into the rule key so two people in one camp each get theirs.
    perform queue_message(r.camp_id, 'receipt_review', r.camp_id,
      'needs_review:' || r.submitted_by::text || ':' || v_week, 'card_holder', v_to, r.who, null, now(),
      'Receipts waiting for your check',
      msg_wrap('Receipts waiting for your check',
        '<strong>' || r.waiting || '</strong> receipt' || case when r.waiting = 1 then '' else 's' end
        || ' you snapped are still waiting for you to confirm the amounts. Finance cannot export them until you do.'
        || '<br><br>Open <em>Receipts</em> in CampCommand and tap <em>Review</em>.', r.camp_name),
      v_text);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.plan_receipt_messages_internal() from public, anon, authenticated;
