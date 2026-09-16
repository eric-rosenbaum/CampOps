/**
 * Data layer for Receipts.
 *
 * Same house rules as campgroundDb: row → camelCase mappers, one bulk loader, realtime through
 * the sync guard. One deliberate difference: writers here are awaited and return an error
 * message instead of firing and forgetting. This module's writes are money that ends up in the
 * books, and "it looked saved" is not good enough — the screen says when a save failed.
 *
 * Row-level security decides what comes back. A card holder's load simply has fewer receipts in
 * it and no statements at all, so nothing here filters by role.
 */
import { supabase } from './supabase';
import { campError, campLog } from './campLog';
import { assertLoaded } from './db';
import { loadAndApply, debounce, WAL_DEBOUNCE_MS } from './syncGuard';
import { uploadToBucket } from './storageUpload';
import type {
  BudgetCode, CardStatement, ExpenseCard, ExpenseExport, ExportFormat, MatchState, Receipt,
  ReceiptAiResult, ReceiptSplit, StatementLine, TaxLine, TaxRule, TaxSettings,
} from './receiptTypes';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

export const RECEIPTS_BUCKET = 'receipts';

// ─── Row → type ───────────────────────────────────────────────────────────────

export function rowToReceipt(r: Row): Receipt {
  return {
    id: r.id as string, campId: r.camp_id as string, cardId: s(r.card_id),
    submittedBy: s(r.submitted_by), submitterName: s(r.submitter_name),
    filePath: s(r.file_path), fileName: s(r.file_name), fileType: s(r.file_type),
    vendor: s(r.vendor), purchaseDate: s(r.purchase_date),
    subtotal: n(r.subtotal),
    taxes: Array.isArray(r.taxes) ? (r.taxes as Row[]).map((t) => ({
      type: (t.type as TaxLine['type']) ?? 'other',
      ratePct: n(t.rate_pct),
      amount: Number(t.amount ?? 0),
    })) : [],
    tip: n(r.tip), total: n(r.total),
    currency: (r.currency as Receipt['currency']) ?? 'CAD',
    budgetCodeId: s(r.budget_code_id),
    splits: Array.isArray(r.splits) ? (r.splits as Row[]).map((x) => ({
      budgetCodeId: String(x.budget_code_id), amount: Number(x.amount ?? 0),
    })) : [],
    purpose: s(r.purpose),
    status: (r.status as Receipt['status']) ?? 'needs_review',
    aiResult: (r.ai_result as ReceiptAiResult) ?? null,
    aiMinConfidence: n(r.ai_min_confidence),
    reviewedBy: s(r.reviewed_by), reviewedAt: s(r.reviewed_at),
    possibleDuplicateOf: s(r.possible_duplicate_of),
    duplicateDismissed: Boolean(r.duplicate_dismissed),
    exportId: s(r.export_id), exportedAt: s(r.exported_at),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function rowToCard(r: Row): ExpenseCard {
  return {
    id: r.id as string, campId: r.camp_id as string, label: r.label as string,
    holderMemberId: s(r.holder_member_id), holderName: s(r.holder_name), holderEmail: s(r.holder_email),
    last4: s(r.last4), defaultBudgetCodeId: s(r.default_budget_code_id), active: r.active !== false,
  };
}

export function rowToCode(r: Row): BudgetCode {
  return {
    id: r.id as string, campId: r.camp_id as string, code: r.code as string, name: r.name as string,
    qbAccount: s(r.qb_account), active: r.active !== false, sortOrder: Number(r.sort_order ?? 0),
  };
}

export function rowToTaxSettings(r: Row): TaxSettings {
  return {
    campId: r.camp_id as string,
    currency: (r.currency as TaxSettings['currency']) ?? 'CAD',
    province: s(r.province),
    taxRules: Array.isArray(r.tax_rules) ? (r.tax_rules as Row[]).map((x) => ({
      type: x.type as TaxRule['type'], recoverablePct: Number(x.recoverable_pct ?? 0),
    })) : [],
    confirmedAt: s(r.confirmed_at),
  };
}

export function rowToStatement(r: Row): CardStatement {
  return {
    id: r.id as string, campId: r.camp_id as string, cardId: r.card_id as string,
    periodMonth: r.period_month as string, statementTotal: n(r.statement_total),
    fileName: s(r.file_name), createdAt: r.created_at as string,
  };
}

export function rowToLine(r: Row): StatementLine {
  return {
    id: r.id as string, statementId: r.statement_id as string, campId: r.camp_id as string,
    postedDate: r.posted_date as string, description: (r.description as string) ?? '',
    amount: Number(r.amount ?? 0), matchState: (r.match_state as MatchState) ?? 'unmatched',
    receiptId: s(r.receipt_id), note: s(r.note), remindedAt: s(r.reminded_at),
  };
}

export function rowToExport(r: Row): ExpenseExport {
  return {
    id: r.id as string, campId: r.camp_id as string, periodFrom: s(r.period_from), periodTo: s(r.period_to),
    cardIds: (r.card_ids as string[]) ?? [], format: r.format as ExportFormat, fileName: s(r.file_name),
    includeExported: Boolean(r.include_exported), rowCount: Number(r.row_count ?? 0), total: Number(r.total ?? 0),
    createdByName: s(r.created_by_name), createdAt: r.created_at as string,
  };
}

// ─── Load + subscribe ─────────────────────────────────────────────────────────

export interface ReceiptsData {
  receipts: Receipt[];
  cards: ExpenseCard[];
  codes: BudgetCode[];
  taxSettings: TaxSettings | null;
  statements: CardStatement[];
  lines: StatementLine[];
  exports: ExpenseExport[];
}

const RECEIPT_TABLES = [
  'receipts', 'expense_cards', 'expense_budget_codes', 'expense_tax_settings',
  'card_statements', 'statement_lines', 'expense_exports',
];

async function loadInner(campId: string): Promise<ReceiptsData> {
  const q = (t: string) => supabase.from(t).select('*').eq('camp_id', campId);
  const [rec, cards, codes, tax, stmts, lines, exps] = await Promise.all([
    q('receipts').order('purchase_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }),
    q('expense_cards').order('label'),
    q('expense_budget_codes').order('sort_order').order('code'),
    q('expense_tax_settings').maybeSingle(),
    q('card_statements').order('period_month', { ascending: false }),
    q('statement_lines').order('posted_date').order('created_at'),
    q('expense_exports').order('created_at', { ascending: false }),
  ]);
  assertLoaded('receipts', rec, cards, codes, tax, stmts, lines, exps);
  return {
    receipts: (rec.data ?? []).map((r) => rowToReceipt(r as Row)),
    cards: (cards.data ?? []).map((r) => rowToCard(r as Row)),
    codes: (codes.data ?? []).map((r) => rowToCode(r as Row)),
    taxSettings: tax.data ? rowToTaxSettings(tax.data as Row) : null,
    statements: (stmts.data ?? []).map((r) => rowToStatement(r as Row)),
    lines: (lines.data ?? []).map((r) => rowToLine(r as Row)),
    exports: (exps.data ?? []).map((r) => rowToExport(r as Row)),
  };
}

export async function loadReceipts(campId: string): Promise<ReceiptsData | null> {
  try { return await loadInner(campId); }
  catch (e) { campError('[Supabase] loadReceipts threw:', e); return null; }
}

/** Re-read now, through the guard. For after an RPC whose WAL events have not arrived yet. */
export function refreshReceipts(campId: string, onUpdate: (d: ReceiptsData) => void): Promise<boolean> {
  return loadAndApply('receipts', () => loadInner(campId), onUpdate);
}

let channelCount = 0;
export function subscribeToReceipts(campId: string, onUpdate: (d: ReceiptsData) => void): () => void {
  const reload = () => loadAndApply('receipts', () => loadInner(campId), onUpdate);
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  let channel = supabase.channel(`receipts-${++channelCount}`);
  for (const table of RECEIPT_TABLES) {
    channel = channel.on('postgres_changes',
      { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, onWal);
  }
  let everSubscribed = false;
  channel.subscribe((status) => {
    campLog('[CampOps] receipts channel status:', status);
    if (status === 'SUBSCRIBED') {
      // A resubscribe means events were missed while the socket was down.
      if (everSubscribed) setTimeout(() => reload(), 2000);
      else everSubscribed = true;
    }
  });
  return () => { supabase.removeChannel(channel); };
}

// ─── Writers ──────────────────────────────────────────────────────────────────

type Result = { error: string | null };
const ok: Result = { error: null };
const fail = (label: string, message: string): Result => {
  campError(`[receipts] ${label}`, message);
  return { error: friendly(message) };
};

/** Postgres raises sentences for the rules people can break; pass those through. */
function friendly(message: string): string {
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/statement_lines_one_line_per_receipt|already matched/i.test(message)) return 'That receipt is already matched to another charge.';
  return message.replace(/^.*?ERROR:\s*/, '');
}

export function receiptToRow(r: Receipt): Row {
  return {
    id: r.id, camp_id: r.campId, card_id: r.cardId, submitted_by: r.submittedBy, submitter_name: r.submitterName,
    file_path: r.filePath, file_name: r.fileName, file_type: r.fileType,
    vendor: r.vendor, purchase_date: r.purchaseDate, subtotal: r.subtotal,
    taxes: r.taxes.map((t) => ({ type: t.type, rate_pct: t.ratePct, amount: t.amount })),
    tip: r.tip, total: r.total, currency: r.currency, budget_code_id: r.budgetCodeId,
    splits: r.splits.map((x: ReceiptSplit) => ({ budget_code_id: x.budgetCodeId, amount: x.amount })),
    purpose: r.purpose, status: r.status, ai_result: r.aiResult, ai_min_confidence: r.aiMinConfidence,
    reviewed_by: r.reviewedBy, reviewed_at: r.reviewedAt,
    possible_duplicate_of: r.possibleDuplicateOf, duplicate_dismissed: r.duplicateDismissed,
  };
}

export async function dbInsertReceipt(r: Receipt): Promise<Result> {
  const { error } = await supabase.from('receipts').insert(receiptToRow(r));
  return error ? fail('insert receipt', error.message) : ok;
}

/** Everything a person edits on the review form. Export columns are never sent from here. */
export async function dbUpdateReceipt(r: Receipt): Promise<Result> {
  const row = receiptToRow(r);
  delete row.id; delete row.camp_id; delete row.submitted_by;
  const { error } = await supabase.from('receipts').update(row).eq('id', r.id);
  return error ? fail('update receipt', error.message) : ok;
}

export async function dbPatchReceipts(ids: string[], patch: Row): Promise<Result> {
  if (!ids.length) return ok;
  const { error } = await supabase.from('receipts').update(patch).in('id', ids);
  return error ? fail('patch receipts', error.message) : ok;
}

export async function dbDeleteReceipt(r: Pick<Receipt, 'id' | 'filePath'>): Promise<Result> {
  // The row first: once it is gone the file is unreachable through every policy anyway, and a
  // file that outlives its row is only storage, where a row that outlives its file is a broken
  // receipt on somebody's screen.
  const { error } = await supabase.from('receipts').delete().eq('id', r.id);
  if (error) return fail('delete receipt', error.message);
  if (r.filePath) {
    const { error: e2 } = await supabase.storage.from(RECEIPTS_BUCKET).remove([r.filePath]);
    if (e2) campError('[receipts] remove file', e2.message);
  }
  return ok;
}

export async function uploadReceiptFile(path: string, file: File): Promise<string> {
  return uploadToBucket(supabase, RECEIPTS_BUCKET, path, file);
}

/** Short-lived signed URLs for thumbnails. Missing or forbidden paths are simply absent. */
export async function signReceiptUrls(paths: string[], seconds = 3600): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrls(unique, seconds);
  if (error) { campError('[receipts] sign urls', error.message); return {}; }
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
  return out;
}

/**
 * Ask the AI to read a stored receipt.
 *
 * Plain fetch rather than supabase.functions.invoke, on purpose. The client's fetch wrapper
 * retries 429 and 5xx, which is right for a table read and wrong here: a refused quota would be
 * asked three times, and a model failure would be paid for three times. It would also raise the
 * "a change didn't save" banner over a read that saves nothing.
 */
export async function readReceiptWithAi(campId: string, path: string): Promise<{ result: ReceiptAiResult | null; error: string | null; status: number }> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { result: null, error: 'Your session expired. Sign in again.', status: 401 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/read-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ campId, path }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null) as (ReceiptAiResult & { error?: string }) | null;
    if (!res.ok) return { result: null, error: body?.error ?? `Reading failed (${res.status}).`, status: res.status };
    if (!body?.readable) return { result: body, error: body?.error ?? 'This could not be read as a receipt.', status: res.status };
    return { result: body, error: null, status: res.status };
  } catch (e) {
    campError('[receipts] read-receipt', String(e));
    return { result: null, error: 'Reading took too long. Enter the details by hand, or try again.', status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// Cards, codes, tax settings ---------------------------------------------------

export async function dbUpsertCard(c: ExpenseCard): Promise<Result> {
  const { error } = await supabase.from('expense_cards').upsert({
    id: c.id, camp_id: c.campId, label: c.label, holder_member_id: c.holderMemberId, holder_name: c.holderName,
    holder_email: c.holderEmail, last4: c.last4, default_budget_code_id: c.defaultBudgetCodeId, active: c.active,
  });
  return error ? fail('save card', error.message) : ok;
}

export async function dbDeleteCard(id: string): Promise<Result> {
  const { error } = await supabase.from('expense_cards').delete().eq('id', id);
  return error ? fail('delete card', error.message) : ok;
}

export async function dbUpsertCode(c: BudgetCode): Promise<Result> {
  const { error } = await supabase.from('expense_budget_codes').upsert({
    id: c.id, camp_id: c.campId, code: c.code, name: c.name, qb_account: c.qbAccount, active: c.active, sort_order: c.sortOrder,
  });
  if (error && /duplicate key/i.test(error.message)) return { error: `The code "${c.code}" is already used.` };
  return error ? fail('save budget code', error.message) : ok;
}

export async function dbDeleteCode(id: string): Promise<Result> {
  const { error } = await supabase.from('expense_budget_codes').delete().eq('id', id);
  return error ? fail('delete budget code', error.message) : ok;
}

export async function dbSaveTaxSettings(t: TaxSettings, confirmed: boolean): Promise<Result> {
  const { data: sess } = await supabase.auth.getSession();
  const { error } = await supabase.from('expense_tax_settings').upsert({
    camp_id: t.campId, currency: t.currency, province: t.province,
    tax_rules: t.taxRules.map((r) => ({ type: r.type, recoverable_pct: r.recoverablePct })),
    confirmed_at: confirmed ? new Date().toISOString() : null,
    confirmed_by: confirmed ? sess.session?.user.id ?? null : null,
  });
  return error ? fail('save tax settings', error.message) : ok;
}

// Statements ----------------------------------------------------------------

export async function dbImportStatement(input: {
  cardId: string; periodMonth: string; statementTotal: number; fileName: string | null;
  lines: { postedDate: string; description: string; amount: number }[]; replace: boolean;
}): Promise<Result & { id?: string }> {
  const { data, error } = await supabase.rpc('import_card_statement', {
    p_card_id: input.cardId, p_period_month: input.periodMonth, p_statement_total: input.statementTotal,
    p_file_name: input.fileName,
    p_lines: input.lines.map((l) => ({ posted_date: l.postedDate, description: l.description, amount: l.amount })),
    p_replace: input.replace,
  });
  if (error) return fail('import statement', error.message);
  return { error: null, id: data as string };
}

export async function dbDeleteStatement(id: string): Promise<Result> {
  const { error } = await supabase.from('card_statements').delete().eq('id', id);
  return error ? fail('delete statement', error.message) : ok;
}

export interface LineChange { lineId: string; matchState: MatchState; receiptId?: string | null; note?: string | null }

export async function dbResolveLines(changes: LineChange[]): Promise<Result> {
  if (!changes.length) return ok;
  const { error } = await supabase.rpc('resolve_statement_lines', {
    p_changes: changes.map((c) => ({
      line_id: c.lineId, match_state: c.matchState, receipt_id: c.receiptId ?? null,
      ...(c.note !== undefined ? { note: c.note } : {}),
    })),
  });
  return error ? fail('resolve lines', error.message) : ok;
}

export async function dbRemindHolder(lineId: string): Promise<Result & { toEmail?: string; bodyText?: string; queued?: boolean }> {
  const { data, error } = await supabase.rpc('remind_card_holder', { p_line_id: lineId });
  if (error) return fail('remind holder', error.message);
  const d = data as { queued: boolean; reason?: string; to_email?: string; body_text?: string };
  if (!d.queued && d.reason === 'no_email') return { error: 'This card has no holder email. Add one in Settings.' };
  return { error: null, queued: d.queued, toEmail: d.to_email, bodyText: d.body_text };
}

export async function dbExportReceipts(input: {
  campId: string; receiptIds: string[]; periodFrom: string | null; periodTo: string | null; cardIds: string[];
  format: ExportFormat; fileName: string; includeExported: boolean;
}): Promise<Result & { exportId?: string }> {
  const { data, error } = await supabase.rpc('export_receipts', {
    p_camp_id: input.campId, p_receipt_ids: input.receiptIds, p_period_from: input.periodFrom, p_period_to: input.periodTo,
    p_card_ids: input.cardIds, p_format: input.format, p_file_name: input.fileName, p_include_exported: input.includeExported,
  });
  if (error) return fail('export receipts', error.message);
  return { error: null, exportId: (data as { export_id: string }).export_id };
}
