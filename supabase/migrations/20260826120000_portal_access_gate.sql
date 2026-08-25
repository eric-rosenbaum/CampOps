-- Gate the private half of the guest portal behind a code sent to the coordinator.
--
-- Applied as five migrations on 2026-08-25 (portal_access_gate, portal_gate_payload_and_writes,
-- drop_legacy_get_portal_data, portal_gate_sensitive_writes, drop_ungated_portal_overloads,
-- portal_gate_narrow_to_roster). Recorded here as one readable unit.
--
-- The link stays password-free, because that is why coordinators use the portal at all. What it
-- no longer opens on its own is the one thing that would really matter if it were forwarded:
-- the named roster and which bed each person is in.
--
-- Deliberately NOT gated: dates, the menu, the checklist, confirming a headcount, and document
-- and invoice metadata. Two reasons. The checklist is built from documents, so hiding those
-- rows dropped "sign the retreat agreement" off the list and the progress bar undercounted.
-- And the payload already exposes total_charges / total_paid / balance_due, so hiding the
-- invoices that explain those numbers protected nothing while making the "new invoice"
-- notification impossible to show. The document FILE is still gated, inside
-- portal_document_path, and signing still needs its own fresh code.

-- One-time codes for access, separate from the signing codes.
create table if not exists retreat_access_codes (
  id          uuid primary key default gen_random_uuid(),
  retreat_id  uuid not null references retreats(id) on delete cascade,
  code_hash   text not null,
  sent_to     text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists retreat_access_codes_retreat_idx on retreat_access_codes(retreat_id);
alter table retreat_access_codes enable row level security;

-- Sessions record the portal token they were issued against, so regenerating the link
-- invalidates every session on it. That is what "revoke this link" has to mean.
create table if not exists retreat_portal_sessions (
  id             uuid primary key default gen_random_uuid(),
  retreat_id     uuid not null references retreats(id) on delete cascade,
  token_at_issue text not null,
  session_hash   text not null unique,
  verified_email text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  last_seen_at   timestamptz not null default now()
);
create index if not exists retreat_portal_sessions_retreat_idx on retreat_portal_sessions(retreat_id);
alter table retreat_portal_sessions enable row level security;

-- Neither table carries policies: both are reachable only through SECURITY DEFINER functions.

-- A link now closes 14 days after departure rather than 45. Long enough to pull an invoice
-- after getting home, short enough that a forwarded link is not live most of a season later.
create or replace function public.portal_link_expired(p_departure date)
returns boolean language sql immutable
as $$ select current_date > p_departure + 14 $$;

-- See the applied migrations for the bodies of:
--   portal_session_valid(p_token, p_session)
--   portal_verify_access_code(p_token, p_code)   -> issues a 12-hour session
--   get_portal_data(p_token, p_session)          -> gates 'guests', adds 'unlocked' + hint
--   portal_save_roster / portal_update_guest / portal_assign_guests / portal_delete_guests
--   portal_document_path                          -> all gained a trailing p_access argument
--
-- The pre-existing ungated overloads of those five functions were DROPPED rather than left in
-- place: keeping them would have been a bypass, since anyone calling the older signature would
-- have skipped the session check entirely.

-- ─── One code, not two ───────────────────────────────────────────────────────
-- Applied as 20260825030000_sign_accepts_access_session.
--
-- Signing used to demand its own fresh code even when the visitor had just unlocked the portal
-- with one. Both codes go to the same address, so the second proved nothing the first had not
-- already established: control of the coordinator's inbox. It only added a step at the exact
-- moment the guest is trying to finish.
--
-- portal_sign_document now takes a trailing p_access. A live session satisfies verification,
-- attribution is taken from the session's verified_email, and signature_method records
-- 'session' so the audit trail still distinguishes how identity was proven:
--
--   'session' - unlocked the portal with an emailed code, then signed
--   'code'    - signed with a per-document code (no session)
--   'typed'   - no coordinator email on file; the typed name alone
--
-- The old 7-argument signature was dropped: it would have let a caller sign while skipping the
-- session path, and would have been ambiguous against the new one.
