#!/usr/bin/env node
/**
 * Prints the VALUES rows of seed_demo_receipts_internal() from scripts/demo-receipts.mjs, so the
 * migration's data is generated from the same list as the photos rather than retyped.
 *   node scripts/demo-receipts-sql.mjs
 */
import { DEMO_RECEIPTS, demoReceiptMoney, demoPhotoFile } from './demo-receipts.mjs';

const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const n = (x) => (x == null ? 'null::numeric' : x.toFixed(2));
const rows = DEMO_RECEIPTS.map((r) => {
  const src = r.copyOf ? DEMO_RECEIPTS.find((x) => x.k === r.copyOf) : r;
  const m = demoReceiptMoney(r);
  // month: 'last' (the seed's month), 'this' (the month after it), or null for an undated receipt.
  const month = src.nextMonthDay != null ? `'this'` : src.day == null ? 'null' : `'last'`;
  const dayNum = src.nextMonthDay ?? src.day ?? null;
  return `    (${r.k}, '${r.card}', ${month}, ${dayNum ?? 'null'}, ${q(src.vendor)}, ${n(m.subtotal)}, ${q(JSON.stringify(m.taxes))}, ${n(m.tip)}, ${n(m.total)}, ${q(src.code)}, ${q(r.review ? null : src.purpose)}, ${r.review ? "'needs_review'" : "'ready'"}, ${src.conf != null ? src.conf.toFixed(2) : 'null'}, ${q(demoPhotoFile(r))})`;
});
console.log(rows.join(',\n'));
