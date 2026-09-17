#!/usr/bin/env node
/**
 * Scores the deployed STAGING `read-receipt` function against the twelve rendered fixtures.
 *
 *   node scripts/eval-receipts.mjs            # accuracy + the 401 / 413 / 429 checks
 *   node scripts/eval-receipts.mjs 06 12      # only fixtures whose file name contains these
 *
 * Signs in as the Prospect QA card holder, clears the camp's AI usage for today first (the QA
 * camp is a trial camp with 25 reads a day), and reports per-field accuracy.
 *
 * Acceptance (docs/plans/prospect-build-food-requests-trips-receipts.md, C.5):
 *   - total exactly right on at least 11 of 12
 *   - a wrong total is always flagged: math_mismatch or total confidence below 0.65
 *   - the non-receipt comes back readable:false
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const LOW = 0.65;
const QA_CAMP = '0d7d9bf2-0805-4bb5-aa97-16420c6eeeb2';
const dir = path.resolve('test-fixtures/receipts');
const env = Object.fromEntries(
  ['.env.staging', '.env.e2e'].flatMap((f) => fs.readFileSync(f, 'utf8').split('\n'))
    .filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const url = env.VITE_SUPABASE_URL;
if (!url.includes('mvxnpofopbmljzpgnycg')) throw new Error('refusing: not staging');
const fnUrl = `${url}/functions/v1/read-receipt`;

const sql = (q) => execFileSync('scripts/staging-sql.sh', ['-c', q], { encoding: 'utf8' });

const supabase = createClient(url, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error } = await supabase.auth.signInWithPassword({ email: 'qa-holder@example.com', password: env.E2E_PASSWORD });
if (error) throw error;
const token = auth.session.access_token;

async function call(body, headers = {}) {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON gateway error */ }
  return { status: res.status, json };
}

const norm = (s) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|ltd|inc)\b/g, '').trim();
const cents = (n) => (n == null ? null : Math.round(n * 100));
const taxMap = (taxes) => {
  const m = {};
  for (const t of taxes ?? []) m[t.type] = (m[t.type] ?? 0) + cents(t.amount);
  return m;
};
const sameTaxes = (got, want) => {
  const g = taxMap(got);
  const w = Object.fromEntries(Object.entries(want).map(([k, v]) => [k, cents(v)]));
  const keys = new Set([...Object.keys(g), ...Object.keys(w)]);
  return [...keys].every((k) => (g[k] ?? 0) === (w[k] ?? 0));
};

const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
const only = process.argv.slice(2);
const files = Object.keys(expected).filter((f) => !only.length || only.some((o) => f.includes(o)));

sql(`delete from ai_usage where camp_id = '${QA_CAMP}';`);

const fields = ['readable', 'vendor', 'date', 'subtotal', 'taxes', 'tip', 'total', 'currency'];
const score = Object.fromEntries(fields.map((f) => [f, [0, 0]]));
const rows = [];
let totalsRight = 0; let totalsScored = 0; let confidentlyWrong = 0; let nonReceiptOk = true;

for (const file of files) {
  const exp = expected[file];
  const b64 = fs.readFileSync(path.join(dir, file)).toString('base64');
  const started = Date.now();
  const { status, json: got } = await call({ campId: QA_CAMP, fileBase64: b64 });
  const ms = Date.now() - started;
  const r = { file, status, ms, notes: [] };
  if (status !== 200 || !got) { r.notes.push(`HTTP ${status} ${got?.error ?? ''}`); rows.push(r); continue; }

  const ok = {};
  ok.readable = got.readable === exp.readable;
  if (!exp.readable) {
    if (got.readable) nonReceiptOk = false;
    score.readable[0] += ok.readable ? 1 : 0; score.readable[1]++;
    r.ok = ok; r.got = got.readable ? `readable (total ${got.total})` : `unreadable: ${got.error}`;
    rows.push(r);
    continue;
  }
  ok.vendor = !!got.vendor && (norm(got.vendor).includes(norm(exp.vendor)) || norm(exp.vendor).includes(norm(got.vendor)));
  ok.date = exp.dateHidden ? (got.purchaseDate == null || (got.confidence?.date ?? 0) < LOW || got.purchaseDate === exp.date) : got.purchaseDate === exp.date;
  ok.subtotal = cents(got.subtotal) === cents(exp.subtotal);
  ok.taxes = sameTaxes(got.taxes, exp.taxes);
  ok.tip = cents(got.tip) === cents(exp.tip);
  ok.total = cents(got.total) === cents(exp.total);
  ok.currency = got.currency === exp.currency;
  for (const f of fields) { score[f][0] += ok[f] ? 1 : 0; score[f][1]++; }

  totalsScored++;
  if (ok.total) totalsRight++;
  else {
    const flagged = got.flags?.mathMismatch || (got.confidence?.total ?? 0) < LOW;
    if (!flagged) confidentlyWrong++;
    r.notes.push(`total ${got.total} vs ${exp.total}${flagged ? ' (flagged)' : ' (NOT FLAGGED)'}`);
  }
  if (exp.dateHidden) r.notes.push(`hidden date → ${got.purchaseDate ?? 'null'} @ ${got.confidence?.date}`);
  const low = Object.entries(got.confidence ?? {}).filter(([, v]) => v < LOW).map(([k]) => k);
  if (low.length) r.notes.push(`amber: ${low.join(', ')}`);
  if (got.flags?.mathMismatch) r.notes.push('math_mismatch');
  for (const f of fields) if (!ok[f]) r.notes.push(`✗ ${f}: got ${JSON.stringify(f === 'taxes' ? got.taxes : f === 'date' ? got.purchaseDate : got[f])}`);
  r.ok = ok;
  rows.push(r);
}

console.log('\nread-receipt eval against staging\n');
for (const r of rows) {
  const marks = r.ok ? fields.filter((f) => f in r.ok).map((f) => (r.ok[f] ? '✓' : '✗')).join('') : '';
  console.log(`${r.file.padEnd(26)} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(6)}ms  ${marks.padEnd(8)}  ${r.got ?? ''} ${r.notes.join(' · ')}`);
}
console.log('\nper-field accuracy');
for (const f of fields) console.log(`  ${f.padEnd(9)} ${score[f][0]}/${score[f][1]}`);
console.log(`\ntotals exactly right: ${totalsRight}/${totalsScored} readable receipts`);
console.log(`confidently wrong totals: ${confidentlyWrong}`);
console.log(`non-receipt rejected: ${nonReceiptOk}`);

// ── Edge behaviour ─────────────────────────────────────────────────────────
const checks = [];
if (!only.length) {
  const unauth = await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  checks.push(['unauthenticated → 401', unauth.status === 401, unauth.status]);
  const anonOnly = await call({ campId: QA_CAMP }, { Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` });
  checks.push(['anon key, no user → 401', anonOnly.status === 401, anonOnly.status]);
  const big = await call(JSON.stringify({ campId: QA_CAMP, fileBase64: '/9j/' + 'A'.repeat(7_100_000) }));
  checks.push(['oversize → 413', big.status === 413, big.status]);
  const notAFile = await call({ campId: QA_CAMP, fileBase64: Buffer.from('hello, this is text').toString('base64') });
  checks.push(['not an image or PDF → 415', notAFile.status === 415, notAFile.status]);
  // Fill today's allowance, then one more read must be refused before the model is called.
  sql(`insert into ai_usage (camp_id, function) select '${QA_CAMP}', 'read-receipt' from generate_series(1, 30);`);
  const over = await call({ campId: QA_CAMP, fileBase64: fs.readFileSync(path.join(dir, '02-on-hst.jpg')).toString('base64') });
  checks.push(['over quota → 429', over.status === 429, `${over.status} ${over.json?.error ?? ''}`]);
  sql(`delete from ai_usage where camp_id = '${QA_CAMP}';`);
  const otherCamp = await call({ campId: '33333333-3333-4333-8333-333333333333', fileBase64: 'iVBORw0KGgo=' });
  checks.push(['another camp → 403', otherCamp.status === 403, otherCamp.status]);
  console.log('\nedge checks');
  for (const [name, pass, detail] of checks) console.log(`  ${pass ? '✓' : '✗'} ${name} (${detail})`);
}

const pass = (!files.length || only.length || (totalsRight >= 11 && totalsScored >= 11)) && confidentlyWrong === 0 && nonReceiptOk && checks.every((c) => c[1]);
console.log(`\n${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
