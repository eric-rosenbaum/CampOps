-- Each person reads the app in their own language.
--
-- Camps run on crews who speak Spanish or Hebrew first. The language is a property of the
-- PERSON, not the camp: the director reads English while the housekeeper beside them reads
-- Spanish, off the same work orders. It lives on the profile rather than in the browser so the
-- phone and the web agree, and so the server can pick the language of a push notification and
-- decide which languages a camp's typed work needs translating into.
--
-- Null means "never answered": clients fall back to the device language and do not write one
-- until the person picks. own_profile_update already lets a person write their own row.

alter table public.profiles
  add column if not exists preferred_language text;

alter table public.profiles
  drop constraint if exists profiles_preferred_language_check;

alter table public.profiles
  add constraint profiles_preferred_language_check
  check (preferred_language is null or preferred_language in ('en', 'es', 'he'));

comment on column public.profiles.preferred_language is
  'The interface language this person chose (en/es/he), shared by web and iOS. Also decides which languages a camp''s typed work is translated into and the language of their push notifications. Null = never chosen; clients use the device language.';
