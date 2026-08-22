-- Where an issue was logged from.
--
-- The cross-device story — a counselor logs a torn screen from their phone at the waterfront
-- and it is on the director's screen in the office before they have walked back — is the most
-- convincing thing this module does, and until now it was invisible once the row landed. Both
-- clients wrote identical rows, so a list of issues gave no sign that half of them came in
-- from the field.
--
-- Null means genuinely unknown, which is every row written before this column existed. The UI
-- shows no marker rather than guessing, because a wrong provenance claim is worse than none.
-- Public reports are the one case we can backfill honestly: is_public_report already records it.

alter table public.issues add column if not exists source text;

alter table public.issues drop constraint if exists issues_source_check;
alter table public.issues add constraint issues_source_check
  check (source is null or source in ('web', 'ios', 'public'));

comment on column public.issues.source is
  'Client the issue was logged from: web, ios, or public (the tokenized guest report form). Null on rows predating the column — render nothing rather than guessing.';

update public.issues set source = 'public' where is_public_report and source is null;
