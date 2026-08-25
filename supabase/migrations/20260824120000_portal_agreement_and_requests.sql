-- Guest portal: let guests read what they are signing, sign it defensibly, and withdraw a
-- request they no longer want.

-- ── 1. Signature audit trail ─────────────────────────────────────────────────
--
-- A typed name is a valid electronic signature under ESIGN/UETA, but only if the record can
-- show WHO signed, WHAT they were shown, and THAT they intended to sign. Previously we stored
-- only the typed name and a timestamp, which proves none of those. These columns capture the
-- rest so a signature can actually be defended if a group later disputes it.
alter table public.retreat_documents
  add column if not exists signed_ip          text,
  add column if not exists signed_user_agent  text,
  -- Hash of the exact stored file at the moment of signing. If the camp later replaces the
  -- agreement, the mismatch proves the signature belonged to the earlier version.
  add column if not exists signed_file_hash   text,
  -- The affirmative consent to transact electronically that ESIGN requires, recorded
  -- separately from the signature itself.
  add column if not exists consent_at         timestamptz;

comment on column public.retreat_documents.signed_ip is
  'IP the signature came from. Part of the ESIGN/UETA audit trail, attribution evidence.';
comment on column public.retreat_documents.signed_file_hash is
  'Hash of the document as presented at signing, so a later edit cannot be passed off as signed.';

-- ── 2. Signing, with the audit trail ─────────────────────────────────────────
create or replace function public.portal_sign_document(
  p_token       text,
  p_doc_id      uuid,
  p_signed_by   text,
  p_ip          text default null,
  p_user_agent  text default null,
  p_file_hash   text default null
) returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare r retreats;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then raise exception 'Invalid portal token'; end if;

  -- A signature is not something you should be able to overwrite from a shared link.
  update retreat_documents
     set status = 'signed',
         signed_by = p_signed_by,
         signed_at = now(),
         signed_ip = coalesce(p_ip, signed_ip),
         signed_user_agent = coalesce(p_user_agent, signed_user_agent),
         signed_file_hash = coalesce(p_file_hash, signed_file_hash),
         consent_at = coalesce(consent_at, now()),
         updated_at = now()
   where id = p_doc_id
     and retreat_id = r.id
     and signed_at is null;

  return found;
end $$;

-- ── 3. Reading the agreement ─────────────────────────────────────────────────
--
-- `retreat-documents` is a private bucket and the portal is unauthenticated, so the guest had
-- no way to read the document they were being asked to sign. Rather than making the bucket
-- public, this returns the storage path only for documents belonging to THIS token's retreat;
-- the caller then mints a short-lived signed URL for exactly that object.
create or replace function public.portal_document_path(p_token text, p_doc_id uuid)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare r retreats; v_path text;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then raise exception 'Invalid portal token'; end if;

  select file_path into v_path
    from retreat_documents
   where id = p_doc_id and retreat_id = r.id;

  return v_path;   -- null when the camp has not attached a file
end $$;

-- ── 4. Withdrawing a special request ─────────────────────────────────────────
--
-- Only while it is still pending: once the camp has responded, the exchange is part of the
-- record of what was agreed and the guest should not be able to erase it.
create or replace function public.portal_delete_change_request(p_token text, p_request_id uuid)
returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare r retreats;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then raise exception 'Invalid portal token'; end if;

  delete from retreat_change_requests
   where id = p_request_id
     and retreat_id = r.id
     and status = 'pending'
     and responded_at is null;

  return found;
end $$;

revoke all on function public.portal_document_path(text, uuid) from public;
revoke all on function public.portal_delete_change_request(text, uuid) from public;
grant execute on function public.portal_document_path(text, uuid) to anon, authenticated;
grant execute on function public.portal_delete_change_request(text, uuid) to anon, authenticated;
grant execute on function public.portal_sign_document(text, uuid, text, text, text, text) to anon, authenticated;
