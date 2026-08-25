-- Guest portal hardening: expire the link, and verify the signer.
--
-- The portal token is a bearer credential in a URL. That is the right trade for volunteer group
-- coordinators who use it twice a year, but it had two sharp edges:
--
--   1. The link never expired. Retreats that finished months ago still served their agreement,
--      invoices and attendee allergen lists to anyone in a forwarded email thread.
--   2. The token granted WRITE access, including signing the agreement. Reading a contract you
--      are party to is low harm; signing one you are not is high harm.
--
-- This addresses both: links go dark after a grace period, and signing requires a one-time code
-- sent to the coordinator address already on record, not one the visitor types, which would be
-- theatre.

-- ── 1. Link lifetime ─────────────────────────────────────────────────────────
-- Long enough to cover the feedback window (opens the day after departure) and any final
-- invoicing, short enough that a forwarded link is not a permanent key.
create or replace function public.portal_link_expired(p_departure date)
returns boolean
language sql immutable as $$
  select p_departure is not null and current_date > p_departure + 45;
$$;

comment on function public.portal_link_expired(date) is
  'True once a retreat portal link should stop working: 45 days after departure.';

-- ── 2. Signature identity ────────────────────────────────────────────────────
alter table public.retreat_documents
  add column if not exists signed_email      text,
  -- 'code' when a one-time email code was verified, 'typed' when the retreat had no
  -- coordinator address to send one to. Records how much the signature can be relied on.
  add column if not exists signature_method  text;

comment on column public.retreat_documents.signature_method is
  'How the signer was verified: "code" (one-time email code) or "typed" (name only).';

-- ── 3. One-time signing codes ────────────────────────────────────────────────
create table if not exists public.retreat_signing_codes (
  id          uuid primary key default gen_random_uuid(),
  retreat_id  uuid not null references public.retreats(id) on delete cascade,
  document_id uuid not null references public.retreat_documents(id) on delete cascade,
  -- Only the hash is stored, so a database read cannot be replayed as a signature.
  code_hash   text not null,
  sent_to     text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists retreat_signing_codes_lookup
  on public.retreat_signing_codes (document_id, consumed_at);

alter table public.retreat_signing_codes enable row level security;
-- No policies: reachable only through SECURITY DEFINER functions and the service role. A guest
-- must never be able to read a code out of the table.

-- ── 4. Signing, with verification ────────────────────────────────────────────
create or replace function public.portal_sign_document(
  p_token       text,
  p_doc_id      uuid,
  p_signed_by   text,
  p_ip          text default null,
  p_user_agent  text default null,
  p_file_hash   text default null,
  p_code        text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  r        retreats;
  v_code   retreat_signing_codes;
  v_method text;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then raise exception 'Invalid portal token'; end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;

  if coalesce(btrim(r.coordinator_email), '') <> '' then
    -- A coordinator address exists, so a code is required. Without this, anyone holding a
    -- forwarded link could bind the group to a contract.
    if p_code is null then
      return jsonb_build_object('ok', false, 'error', 'A verification code is required.');
    end if;

    select * into v_code
      from retreat_signing_codes
     where document_id = p_doc_id
       and retreat_id = r.id
       and consumed_at is null
     order by created_at desc
     limit 1;

    if not found or v_code.expires_at < now() then
      return jsonb_build_object('ok', false, 'error', 'That code has expired. Request a new one.');
    end if;
    if v_code.attempts >= 5 then
      return jsonb_build_object('ok', false, 'error', 'Too many attempts. Request a new code.');
    end if;
    if v_code.code_hash <> encode(digest(p_code, 'sha256'), 'hex') then
      update retreat_signing_codes set attempts = attempts + 1 where id = v_code.id;
      return jsonb_build_object('ok', false, 'error', 'That code is not correct.');
    end if;

    update retreat_signing_codes set consumed_at = now() where id = v_code.id;
    v_method := 'code';
  else
    -- No address on record to verify against. Signing still works so the camp is not blocked,
    -- but the weaker basis is recorded rather than glossed over.
    v_method := 'typed';
  end if;

  update retreat_documents
     set status = 'signed',
         signed_by = p_signed_by,
         signed_at = now(),
         signed_ip = coalesce(p_ip, signed_ip),
         signed_user_agent = coalesce(p_user_agent, signed_user_agent),
         signed_file_hash = coalesce(p_file_hash, signed_file_hash),
         signed_email = coalesce(v_code.sent_to, signed_email),
         signature_method = v_method,
         consent_at = coalesce(consent_at, now()),
         updated_at = now()
   where id = p_doc_id and retreat_id = r.id and signed_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'This document has already been signed.');
  end if;
  return jsonb_build_object('ok', true, 'method', v_method);
end $$;

grant execute on function public.portal_link_expired(date) to anon, authenticated;
grant execute on function public.portal_sign_document(text, uuid, text, text, text, text, text)
  to anon, authenticated;
