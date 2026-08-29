# Repairing the production migration ledger

## What is wrong

Fifty-two migration files in `supabase/migrations/` are not recorded in production's
`supabase_migrations.schema_migrations` table. Their contents **are** applied to the
production database - they went in through the Supabase MCP, which stamps its own version
string rather than the filename's. So production's schema is correct, but production does
not know it already ran these files.

The consequence: `supabase db push` against production will try to re-apply all fifty-two.
Most would fail on an object that already exists, and the ones that did not fail could
re-run a data backfill. Do not push to production until this is repaired.

Staging does not have this problem. Its ledger has one row per file, which is why staging
can be rebuilt from the repo and production currently cannot.

## The repair

`migration repair --status applied` writes the ledger row without running the file. It
changes no schema. Run it against production, then confirm with `migration list`.

Take a database backup first. Then:

```bash
PROD_DB_URL="postgresql://postgres:<password>@db.fbfxeupqguzxrbyqojyg.supabase.co:5432/postgres"

supabase migration repair --status applied \
  20260719120000 20260719120100 20260719120200 20260719120300 20260719120400 20260719140000 20260724161630 20260727130000 20260727140000 20260727150000 20260727160000 20260727170000 20260727170500 20260728100000 20260728110000 20260729100000 20260729100500 20260729101000 20260729101500 20260729110000 20260729120000 20260730120000 20260730130000 20260731120000 20260731130000 20260731140000 20260802120000 20260802130000 20260802140000 20260802150000 20260802160000 20260812120000 20260812140000 20260812150000 20260812160000 20260813120000 20260817120000 20260818120000 20260819120000 20260820120000 20260820140000 20260824120000 20260824140000 20260825120000 20260825130000 20260825140000 20260825141000 20260825150000 20260825160000 20260826120000 20260826130000 20260826140000 \
  --db-url "$PROD_DB_URL"
```

Then verify that the local and remote lists agree:

```bash
supabase migration list --db-url "$PROD_DB_URL"
```

Every row should show a version in both the Local and Remote columns. Only once that is
true is `supabase db push` safe against production.

## Then, separately, the compliance migrations

The nine `20260829*` compliance migrations have **not** been applied to production at all.
They are new work, currently live on staging only. After the ledger is repaired, a normal
`supabase db push` will apply them.

## How to avoid this recurring

Use files and `supabase db push` for schema changes. The MCP's `apply_migration` writes a
version the repo cannot match, and mixing the two is what produced this gap.
