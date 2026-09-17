/**
 * Supabase access for the Demo Guide: the brief a founder wrote, and the "did they actually do
 * it" checks behind each step's tick.
 */
import { supabase } from '@/lib/supabase';
import { qrToSvg } from '@/lib/qr';
import { todayInZone } from '@/lib/foodRequests';
import { samplePhotoForReceipt } from '@/lib/demoReceiptPhotos';
import type { AutoCheckId, BriefSpotlight, DemoBrief } from '@/lib/demoSpotlights';

function rowToBrief(r: Record<string, unknown>): DemoBrief {
  return {
    campId: r.camp_id as string,
    prospectName: (r.prospect_name as string) ?? null,
    headline: (r.headline as string) ?? null,
    intro: (r.intro as string) ?? null,
    spotlights: Array.isArray(r.spotlights) ? (r.spotlights as BriefSpotlight[]) : [],
    founderName: (r.founder_name as string) ?? null,
    founderEmail: (r.founder_email as string) ?? null,
  };
}

/** Null when the camp has no brief (a plain demo, or any customer camp). */
export async function loadDemoBrief(campId: string): Promise<DemoBrief | null> {
  const { data, error } = await supabase.from('demo_briefs').select('*').eq('camp_id', campId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToBrief(data) : null;
}

export async function saveDemoBrief(brief: DemoBrief): Promise<void> {
  const { error } = await supabase.rpc('admin_set_demo_brief', {
    p_camp_id: brief.campId,
    p_brief: {
      prospect_name: brief.prospectName,
      headline: brief.headline,
      intro: brief.intro,
      spotlights: brief.spotlights,
      founder_name: brief.founderName,
      founder_email: brief.founderEmail,
    },
  });
  if (error) throw new Error(error.message);
}

/**
 * When this visitor joined the demo. A tick only counts work done after it, so a guide opened by
 * the next person on the same link does not arrive pre-ticked by the last one's clicks or by the
 * seed data.
 */
export async function loadJoinedAt(campId: string, userId: string): Promise<string | null> {
  const { data } = await supabase.from('camp_members').select('created_at')
    .eq('camp_id', campId).eq('user_id', userId).maybeSingle();
  return (data?.created_at as string) ?? null;
}

type CountQuery = (campId: string, since: string, userId: string) => PromiseLike<{ count: number | null; error: unknown }>;

/**
 * Rows in this camp since the visitor joined, and -- where the row records who did it -- done by
 * this visitor. A demo link is shared, so a camp-wide count ticked one director's guide for what
 * another director had clicked.
 */
const count = (table: string, byColumn?: string, apply?: (q: ReturnType<typeof base>) => ReturnType<typeof base>): CountQuery =>
  (campId, since, userId) => {
    let q = base(table).eq('camp_id', campId).gte('created_at', since);
    if (byColumn) q = q.eq(byColumn, userId);
    if (apply) q = apply(q);
    return q;
  };
const base = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true });

/**
 * One query per check. A check whose table does not exist (a module this build lacks) or that the
 * visitor cannot read simply stays unticked — a guide must never error because of a tick.
 */
const AUTO_CHECKS: Record<AutoCheckId, CountQuery> = {
  // A public-link request has no account behind it; the counselor is whoever holds the phone.
  food_request_from_link: count('food_requests', undefined, (q) => q.eq('source', 'link')),
  food_request_decided: (campId, since, userId) => base('food_requests').eq('camp_id', campId)
    .gte('decided_at', since).eq('decided_by', userId),
  food_request_picked_up: (campId, since) => base('food_requests').eq('camp_id', campId)
    .gte('picked_up_at', since),
  trip_seat_claimed: count('trip_seats', 'rider_user_id'),
  trip_errand_added: count('trip_errands', 'requested_by'),
  trip_planned: count('trips', 'created_by'),
  receipt_saved: (campId, since, userId) => base('receipts').eq('camp_id', campId)
    .gte('reviewed_at', since).eq('reviewed_by', userId),
  statement_imported: count('card_statements', 'uploaded_by'),
  receipts_exported: count('expense_exports', 'created_by'),
};

export async function runAutoChecks(campId: string, since: string, userId: string, ids: AutoCheckId[]): Promise<Set<AutoCheckId>> {
  const done = new Set<AutoCheckId>();
  await Promise.all([...new Set(ids)].map(async (id) => {
    try {
      const { count: n, error } = await AUTO_CHECKS[id](campId, since, userId);
      if (!error && (n ?? 0) > 0) done.add(id);
    } catch { /* unticked */ }
  }));
  return done;
}

/** Values the guide's step links and panels are filled from. Any of them may be missing. */
export interface GuideContext {
  /** The no-login /try/ link, for "share this demo with your director". */
  shareUrl?: string | null;
  /** A program's public food-request link, its name, and a QR code of the link. */
  foodLink?: string | null;
  foodProgramName?: string | null;
  foodLinkQr?: string | null;
  /** Reconcile deep links: the card with last month's statement, and the card still without one. */
  reconcileStatement?: string | null;
  reconcileImport?: string | null;
}

export async function loadGuideContext(campId: string): Promise<GuideContext> {
  const origin = window.location.origin;
  const ctx: GuideContext = {};
  const [campRes, programRes] = await Promise.all([
    supabase.from('camps').select('share_token').eq('id', campId).maybeSingle(),
    // The guide prefers the program the seed data names first; any active program will do.
    supabase.from('food_programs').select('name, request_token').eq('camp_id', campId).eq('active', true)
      .order('sort_order', { ascending: true }).limit(1),
  ]);
  // The reconcile steps open the exact card and month the seed prepared. Without sample cards
  // they still open the screen, just not a particular card.
  ctx.reconcileStatement = '/receipts/reconcile';
  ctx.reconcileImport = '/receipts/reconcile';
  const [lastMonth, { data: cards }] = await Promise.all([
    campLastMonth(campId),
    supabase.from('expense_cards').select('id, last4').eq('camp_id', campId).in('last4', ['4821', '1156']),
  ]);
  for (const c of cards ?? []) {
    const href = `/receipts/reconcile?card=${c.id as string}&month=${lastMonth}`;
    if (c.last4 === '4821') ctx.reconcileStatement = href;
    if (c.last4 === '1156') ctx.reconcileImport = href;
  }
  const share = campRes.data?.share_token as string | undefined;
  if (share) ctx.shareUrl = `${origin}/try/${share}`;
  const program = programRes.error ? null : programRes.data?.[0];
  if (program?.request_token) {
    ctx.foodLink = `${origin}/food/${program.request_token as string}`;
    ctx.foodProgramName = (program.name as string) ?? null;
    ctx.foodLinkQr = `data:image/svg+xml;utf8,${encodeURIComponent(qrToSvg(ctx.foodLink, { quietZone: 2 }))}`;
  }
  return ctx;
}

/**
 * Restores sample data for the given spotlights in a demo camp (platform admins only; the RPC
 * refuses any camp that is not a demo, because seeding into a real camp has destroyed rows here
 * before).
 */
export async function seedDemoData(campId: string, keys: string[]): Promise<void> {
  const { data, error } = await supabase.rpc('seed_demo_data', { p_camp_id: campId, p_keys: keys });
  if (error) throw new Error(error.message);
  await uploadSamplePhotos(data);
}

/**
 * The visitor's own "put the sample data back" -- same seeds, allowed for any admin of a demo
 * camp (every /try/ visitor), refused for every other camp by the RPC.
 */
export async function resetDemoSampleData(campId: string, keys: string[]): Promise<void> {
  const { data, error } = await supabase.rpc('reset_demo_sample_data', { p_camp_id: campId, p_keys: keys });
  if (error) throw new Error(error.message);
  await uploadSamplePhotos(data);
}

async function uploadSamplePhotos(data: unknown): Promise<void> {
  // Storage can't be written from SQL, so the receipts seed returns which rows need a photo and
  // the sample image each one shows; the images ship with the app under /demo/receipts/.
  const files = ((data as { receipt_files?: { receipt_id: string; file_path: string; sample_file: string }[] } | null)?.receipt_files) ?? [];
  const failed: string[] = [];
  for (const f of files) {
    try {
      const res = await fetch(`/demo/receipts/${f.sample_file}`);
      if (!res.ok) throw new Error(String(res.status));
      // The sample photos print one month; redraw the date to the receipt row's own date, or a
      // demo seeded in another month shows photos that contradict their receipts.
      const blob = await samplePhotoForReceipt(await res.blob(), f.sample_file, f.receipt_id);
      // Re-seeding re-uploads: remove first, because an upsert needs a read policy check the
      // uploader may not pass.
      await supabase.storage.from('receipts').remove([f.file_path]);
      const { error: upErr } = await supabase.storage.from('receipts')
        .upload(f.file_path, blob, { contentType: 'image/jpeg' });
      if (upErr) throw upErr;
    } catch {
      failed.push(f.sample_file);
    }
  }
  if (failed.length > 0) {
    throw new Error(`Sample data added, but ${failed.length} receipt photo(s) did not upload: ${failed.join(', ')}`);
  }
}

/**
 * A card statement for the demo's third card, built from that card's own sample receipts for last
 * month plus one charge with no receipt, so "import a statement yourself" works and matches.
 * Returned as CSV text in the shape a Canadian bank export takes.
 */
export async function buildSampleStatementCsv(campId: string): Promise<{ csv: string; fileName: string; total: number } | null> {
  const { data: card } = await supabase.from('expense_cards').select('id, last4')
    .eq('camp_id', campId).eq('last4', '1156').maybeSingle();
  if (!card) return null;
  const { data: rows } = await supabase.from('receipts').select('vendor, purchase_date, total')
    .eq('camp_id', campId).eq('card_id', card.id).in('status', ['ready', 'needs_review'])
    .not('purchase_date', 'is', null).order('purchase_date');
  if (!rows || rows.length === 0) return null;
  // Last month in the camp's time zone -- the month the seed dates this card's receipts in, and
  // the month the guide's "import it yourself" link opens.
  const month = await campLastMonth(campId);
  const monthRows = rows.filter((r) => (r.purchase_date as string).startsWith(month));
  if (monthRows.length === 0) return null;
  const lines = monthRows.map((r) => {
    const [y, m, d] = (r.purchase_date as string).split('-').map(Number);
    const posted = new Date(Date.UTC(y, m - 1, d + 1));
    const mm = String(posted.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(posted.getUTCDate()).padStart(2, '0');
    return `${mm}/${dd}/${posted.getUTCFullYear()},"${String(r.vendor).toUpperCase()}",${Number(r.total).toFixed(2)},`;
  });
  const [y, m] = month.split('-');
  lines.push(`${m}/28/${y},"CEDAR PARK PARKING",14.00,`);
  return {
    csv: ['Transaction Date,Description,Debit,Credit', ...lines].join('\r\n') + '\r\n',
    fileName: `visa-${card.last4}-${y}-${m}.csv`,
    // The import asks for the bill's total; the guide shows it so a visitor has one to type.
    total: monthRows.reduce((n, r) => n + Math.round(Number(r.total) * 100), 0) / 100 + 14,
  };
}

/** `YYYY-MM` of last month in the camp's own time zone. */
async function campLastMonth(campId: string): Promise<string> {
  const { data } = await supabase.from('camps').select('timezone').eq('id', campId).maybeSingle();
  const today = todayInZone((data?.timezone as string) || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [y, m] = today.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
