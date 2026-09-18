# Multilingual Campground — plan and contracts

2026-09-18. Branch `feature/multilingual`, worktree `../CampOps-i18n`, linked to **staging**.

Camps run on crews who speak Spanish or Hebrew first. Two features:

1. **The interface in your language.** Each person picks English, Español or עברית. Stored on
   `profiles.preferred_language` (shared by web and iOS). Hebrew mirrors the layout (RTL).
2. **What other people typed, in your language.** A work order typed in Spanish is read in
   English by the director and vice versa. Translations are made on write by Claude, stored
   beside the original, never overwrite it, and are always one tap away from the original.

## Scope

Translated screens: Campground (board, detail, timeline, routines, templates, vendors, calendar,
season review), My Tasks, the shell (sidebar, headers, loading), the shared components those use,
login / forgot / reset / accept-invite / join / app-handoff, the three home pages, personal
security settings, the sticker pages (`/l/:token`, `/hub/:token`), the public report form.
iOS: Issues, Scan, Home, Profile, Auth, Shared, and the root tab shell.

Not translated (stay English, held left-to-right under Hebrew via `<Untranslated>` in App.tsx):
Pool, Safety, Compliance, Assets, Building, Commissary, Retreats, Trips, Receipts, Food requests,
camp/team settings, admin console, onboarding, demo guide, the guest portal, marketing pages.
iOS: Pool, Assets, Building.

## Web conventions (read before editing a screen)

- `import { useTranslation } from 'react-i18next'`, then `const { t } = useTranslation('campground')`.
  Keys are type-checked against `src/i18n/locales/en/*.json` by `npx tsc -b`.
- Namespaces and who owns them — **only add keys to your own namespace(s)**:
  | namespace | owner |
  |---|---|
  | `common` | foundation (read-only for everyone: status, priority, source, cadence, crew, actions, language) |
  | `campground` | campground-core agent |
  | `campgroundAdmin` | campground-admin agent |
  | `shell`, `activity` | shell agent |
  | `auth`, `home`, `scan`, `account` | entry-screens agent |
  | `translation` | content-translation agent |
- Every key you add goes into **en, es and he** in the same commit. `npm run test:unit` runs
  `src/i18n/__tests__/locales.test.ts`, which fails on a missing key, a dropped `{{variable}}`,
  or a missing plural form. Plurals: en `_one/_other`; es `_one/_many/_other`;
  he `_one/_two/_other` (+ `_many` if Intl reports it — the test tells you).
- Never build a sentence by concatenating translated fragments. Use one key with
  `{{variables}}`, or `<Trans>` when a sentence contains markup.
- Spanish: neutral Latin-American, informal "tú" for crew-facing UI. Hebrew: modern, gender-
  neutral where possible (infinitive or plural imperative for buttons, e.g. "שמירה", "לסגור").
  Keep product terms consistent: work order = orden de trabajo / קריאת שירות; crew = equipo /
  צוות; routine = rutina / שגרה; vendor = proveedor / ספק. Camp jargon the camp typed (location
  names, crew names) is never translated by the string files.
- Module-level label maps (`STATUS_LABELS`, `TRADE_LABELS`, `CADENCE_LABELS`, `SOURCE_LABELS`)
  are already localized getters (`localizedLabels` in `src/i18n/index.ts`). Do the same for any
  other module-level map you own. Pages remount on language change (Layout keys `<Outlet>`).
- Dates: use the helpers in `src/lib/utils.ts` (shell agent makes them locale-aware). Never
  `toISOString().slice(0,10)` (trap 3).
- **RTL.** `scripts/rtl-logical-classes.py` has already rewritten `ml-/pl-/left-/text-left/
  border-l/rounded-l` to logical `ms-/ps-/start-/text-start/border-s/rounded-s` in the in-scope
  files. What you still own in your files:
  - directional icons (ChevronRight, ArrowRight, ChevronLeft, ArrowLeft, "back"/"next"
    arrows) get `rtl:-scale-x-100`;
  - `space-x-*` gets `rtl:space-x-reverse`;
  - `translate-x-*` used for slide-in drawers/toggles needs an `rtl:` counterpart;
  - any new class you write uses the logical form.
  - Numbers, times, emails, URLs, codes inside Hebrew text: wrap in `<bdi>` or `dir="ltr"` when
    they would otherwise reorder.
- `TranslatedText` / `useTranslationLookup` (below) for anything a PERSON typed.
- Do not touch Compliance or Commissary. Do not touch files owned by another agent. Do not commit
  — the coordinator commits. Do not run `supabase link`, `db push`, or anything against production.

## Content translation — the contract

### Database (backend agent)

```
content_translations
  id            uuid pk default gen_random_uuid()
  camp_id       uuid not null references camps(id) on delete cascade
  source_table  text not null  check in ('issues','issue_comments','issue_checklist_items')
  source_id     text not null           -- the row's id as text (issues ids are text, others uuid)
  field         text not null  check in ('title','description','body','text','note')
  lang          text not null  check in ('en','es','he')   -- the language of `text`
  source_lang   text                     -- detected language of the original; null = unknown
  source_text   text not null            -- the ORIGINAL this was made from
  text          text not null            -- the translation (== source_text when source_lang = lang)
  model         text
  created_at, updated_at timestamptz
  unique (source_table, source_id, field, lang)
```

- A row is **current** iff `source_text` equals the row's field today. Clients compare strings;
  a mismatch means the original was edited and the translation is stale → show the original.
- Rows exist for every target language, including the source language itself (where
  `text = source_text`), so "translated, and it was already Spanish" is distinguishable from
  "not translated yet".
- Target languages for a camp = `{'en'}` ∪ the `preferred_language` of its active members.
- Read: camp members (`is_camp_member(camp_id)`). Write: service role only. In the
  `supabase_realtime` publication, REPLICA IDENTITY FULL.
- Fields: `issues.title`, `issues.description`, `issue_comments.body`,
  `issue_checklist_items.text`, `issue_checklist_items.note`.

### Edge function `translate-content` (backend agent)

- **Cron / trigger mode** — header `x-cron-secret`: drains `translation_queue`.
- **On-demand mode** — user JWT, `POST { refs: [{ source, id }], lang }` (≤ 50 refs): translates
  whatever is missing or stale for those rows into `lang` (and the camp's other target languages),
  after checking with a user-scoped client that the caller can read each row. Returns
  `{ translations: ContentTranslationRow[] }` (snake_case, as stored).
- Claude `claude-haiku-4-5`, with a glossary of the camp's own proper nouns (locations, crews,
  assets, people) that must not be translated.

### Web (content-translation agent) — `src/lib/contentTranslation.ts`, `src/components/i18n/TranslatedText.tsx`

```tsx
<TranslatedText source="issues" id={issue.id} field="title" text={issue.title} />            // cards, lists
<TranslatedText source="issue_comments" id={c.id} field="body" text={c.body} variant="block" /> // detail, comments
const lookup = useTranslationLookup();  lookup('issues', i.id, 'title', i.title)                 // search/sort/attrs
searchableText(original, lookup(...))                                                            // search both languages
```

Stubs exist and render the original, so screen agents use them now; the content-translation agent
makes them real. Never feed a translation into an edit input — edits edit the original.

### iOS (iOS agent) — same table, same semantics, cached for offline.

## Activity history

`issue_activity.action` stays an English sentence in the database (SQL reads it with
`ilike '%resolved%'`; iOS writes the same sentences). It is translated at display time by
`translateActivity()` in `src/i18n/activity.ts` (shell agent), which recognises the known
sentence shapes and falls back to the stored English. iOS mirrors it in Swift.

## Verification

- `npx tsc -b`, `npm run lint` (baseline 30 problems / 15 errors), `npm run test:unit`.
- The coordinator drives the browser (staging, Prospect QA) and the simulator in all three
  languages and reads the screenshots.

## Status — 2026-09-18 (built on staging, not yet on production)

- Web: every in-scope screen reads from its namespace in en/es/he; `npm run test:unit` holds the
  three languages to one key set. `e2e/multilingual.spec.ts` reads one Spanish work order in all
  three languages at laptop and phone widths.
- Server: `content_translations` + `translation_queue` + triggers + pg_net ping + 2-minute cron;
  `translate-content` runs **Opus 5 at low effort** (Haiku's Hebrew was unusable — "llave de paso"
  became a fire valve). `TRANSLATE_MODEL` overrides it. Push notifications use the recipient's
  language. Suite: `bash scripts/run-sql-tests.sh content_translations`.
- iOS: `Localizable.xcstrings` (check with `scripts/check-ios-strings.py`), runtime switching via
  root locale/layoutDirection + `L10n.tr`, window-level direction override for UIKit bars.
- Not translated yet: Pool, Safety, Compliance, Assets, Building, Commissary, Retreats, Trips,
  Receipts, Food requests, camp/team settings, admin, onboarding, the guest portal; iOS Pool,
  Assets, Building. Routine/template/vendor/location names are the camp's words and are not
  machine-translated. `open_reports_at` returns no ids, so the public form's "already reported"
  titles stay in the original language.
- To ship: apply the three migrations with `scripts/apply-production-migration.sh`, deploy
  `translate-content` and `push-send` (`--no-verify-jwt` on translate-content), confirm the Vault
  secrets `cron_secret`/`functions_base_url` and `ANTHROPIC_API_KEY` exist on production, then the
  web build, then an iOS build.
