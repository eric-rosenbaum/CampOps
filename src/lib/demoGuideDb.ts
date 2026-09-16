/**
 * Supabase access for the Demo Guide: the brief a founder wrote, and the "did they actually do
 * it" checks behind each step's tick.
 */
import { supabase } from '@/lib/supabase';
import { qrToSvg } from '@/lib/qr';
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

type CountQuery = (campId: string, since: string) => PromiseLike<{ count: number | null; error: unknown }>;

const count = (table: string, apply?: (q: ReturnType<typeof base>) => ReturnType<typeof base>): CountQuery =>
  (campId, since) => {
    let q = base(table).eq('camp_id', campId).gte('created_at', since);
    if (apply) q = apply(q);
    return q;
  };
const base = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true });

/**
 * One query per check. A check whose table does not exist (a module this build lacks) or that the
 * visitor cannot read simply stays unticked — a guide must never error because of a tick.
 */
const AUTO_CHECKS: Record<AutoCheckId, CountQuery> = {
  food_request_from_link: count('food_requests', (q) => q.eq('source', 'link')),
  food_request_decided: (campId, since) => base('food_requests').eq('camp_id', campId)
    .gte('decided_at', since),
  food_request_picked_up: (campId, since) => base('food_requests').eq('camp_id', campId)
    .gte('picked_up_at', since),
  trip_seat_claimed: count('trip_seats'),
  trip_errand_added: count('trip_errands'),
  trip_planned: count('trips'),
  receipt_saved: count('receipts'),
  statement_imported: count('card_statements'),
  receipts_exported: count('expense_exports'),
};

export async function runAutoChecks(campId: string, since: string, ids: AutoCheckId[]): Promise<Set<AutoCheckId>> {
  const done = new Set<AutoCheckId>();
  await Promise.all([...new Set(ids)].map(async (id) => {
    try {
      const { count: n, error } = await AUTO_CHECKS[id](campId, since);
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
  const { error } = await supabase.rpc('seed_demo_data', { p_camp_id: campId, p_keys: keys });
  if (error) throw new Error(error.message);
}
