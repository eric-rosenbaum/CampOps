#!/usr/bin/env node
/**
 * Run a .sql file against a Postgres database and print its NOTICE output.
 *
 * Exists because the test suite reports through `raise notice` / `raise exception`, and the
 * Supabase CLI has no "just run this file" command. Point it at STAGING, never production:
 *
 *   STAGING_DB_URL='postgresql://...' node scripts/runsql.js supabase/tests/compliance_engine_test.sql
 *
 * The direct host (db.<ref>.supabase.co) resolves to IPv6 only. On a network without working
 * IPv6 it does not fail fast, it hangs until the TCP timeout, which reads like a broken test
 * run rather than a broken route. The pooler is dual-stack, so reach for it instead:
 *
 *   postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
 *
 * Exits non-zero if the SQL raises, so it works in CI.
 */
import fs from 'node:fs';
import pg from 'pg';

const { Client } = pg;

const file = process.argv[2];
const url = process.env.STAGING_DB_URL || process.env.DATABASE_URL;

if (!file) {
  console.error('Usage: node scripts/runsql.js <file.sql>');
  process.exit(2);
}
if (!url) {
  console.error('Set STAGING_DB_URL (or DATABASE_URL) to the database connection string.');
  process.exit(2);
}
if (/(^|[^a-z])prod(uction)?([^a-z]|$)/i.test(url)) {
  console.error('Refusing to run: that connection string looks like production.');
  process.exit(2);
}

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  client.on('notice', (n) => console.log(`[${n.severity}] ${n.message}`));
  await client.connect();
  try {
    await client.query(fs.readFileSync(file, 'utf8'));
    console.log('\nOK');
  } catch (err) {
    console.error(`\nFAILED\n${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
