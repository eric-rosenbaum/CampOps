import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, Loader2, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useRetreatStore } from '@/store/retreatStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useLocationStore } from '@/store/locationStore';
import { useAuth } from '@/lib/auth';
import { dbGenerateTurnover } from '@/lib/retreatsDb';
import { fmtDateFull } from './retreatUi';

/**
 * The bigger job.
 *
 * Program set-ups are the visible half of a rental turnover; the larger, more repetitive one
 * is stripping and remaking beds after a group leaves. The system already knows which rooms
 * were assigned to whom and when they go home, so the crew's list for changeover day is a
 * derivation, not a data-entry task — which is the entire argument for one product rather
 * than a maintenance system sold next to a booking system.
 *
 * Generation is idempotent server-side, and the card says so, because the first thing anybody
 * wonders about a button like this is whether pressing it twice doubles the work.
 */
export function TurnoverCard({ retreatId }: { retreatId: string }) {
  const housing = useRetreatStore((s) => s.housing);
  const retreatById = useRetreatStore((s) => s.retreatById);
  // Subscribe to the raw slice and derive below. A selector returning a fresh array each
  // render infinite-loops under React 19 + zustand v5.
  const issues = useIssuesStore((s) => s.issues);
  const selectIssue = useIssuesStore((s) => s.selectIssue);
  const locations = useLocationStore((s) => s.locations);
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const [scope, setScope] = useState<'room' | 'building'>('room');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const retreat = retreatById(retreatId);
  const rows = useMemo(() => housing.filter((h) => h.retreatId === retreatId), [housing, retreatId]);

  // What the generator will actually walk: distinct assigned rooms, or the buildings they sit
  // in. A twelve-room lodge is one job for some camps and twelve for others, and both are
  // right — it depends whether one person does the whole building.
  const targets = useMemo(() => {
    const byId = new Map(locations.map((l) => [l.id, l]));
    const ids = new Set<string>();
    for (const h of rows) {
      if (!h.locationId) continue;
      const loc = byId.get(h.locationId);
      ids.add(scope === 'building' ? loc?.parentId ?? h.locationId : h.locationId);
    }
    return Array.from(ids).map((id) => byId.get(id)?.name ?? 'Room');
  }, [rows, locations, scope]);

  // Turnover orders are the housekeeping work the generator raised against this retreat. The
  // title prefix is the same marker the DB uses for its idempotency check, so what is listed
  // here is exactly what a second press would decline to duplicate.
  const turnovers = useMemo(
    () => issues
      .filter((i) => i.retreatId === retreatId && i.trade === 'housekeeping' && i.title.startsWith('Turn over'))
      .sort((a, b) => a.title.localeCompare(b.title)),
    [issues, retreatId],
  );

  const open = turnovers.filter((i) => i.status !== 'resolved').length;

  async function generate() {
    setBusy(true); setResult(null);
    const n = await dbGenerateTurnover(retreatId, scope);
    setBusy(false);
    setResult(
      n === 0
        ? 'Nothing new — every assigned room already has a turnover job. Pressing it again never doubles the list.'
        : `Created ${n} turnover work order${n === 1 ? '' : 's'}.`,
    );
  }

  return (
    <div className="bg-white rounded-card border border-border px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-btn bg-sage-pale text-forest flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-forest">Turning the beds over</p>
          <p className="text-[12.5px] text-ink-soft leading-relaxed mt-0.5">
            {rows.length === 0
              ? 'Nobody is in a room yet, so there is nothing to turn over. Place the group first.'
              : <>
                  {targets.length} {scope === 'building' ? (targets.length === 1 ? 'building' : 'buildings') : (targets.length === 1 ? 'room' : 'rooms')}
                  {' '}assigned to this group. One housekeeping work order each, due{' '}
                  {retreat?.departureDate ? fmtDateFull(retreat.departureDate) : 'on departure'}.
                </>}
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 mt-3.5">
            <div className="inline-flex rounded-btn border border-border overflow-hidden">
              {(['room', 'building'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`text-[12px] font-semibold px-3 py-1.5 transition-colors ${
                    scope === s ? 'bg-forest text-white' : 'bg-white text-ink hover:bg-cream'
                  }`}
                >
                  {s === 'room' ? 'One job per room' : 'One job per building'}
                </button>
              ))}
            </div>
            {canManage && (
              <Button size="sm" onClick={generate} disabled={busy}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {busy ? 'Generating…' : turnovers.length > 0 ? 'Generate again' : 'Generate turnover work'}
              </Button>
            )}
          </div>

          <p className="text-[11.5px] text-ink-faint mt-2 inline-flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
            Safe to press twice. Rooms that already have a turnover job are skipped.
          </p>

          {result && <p className="text-[12.5px] text-green-muted-text font-medium mt-2">{result}</p>}
        </>
      )}

      {turnovers.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-cream-dark">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint mb-2">
            {turnovers.length} turnover job{turnovers.length === 1 ? '' : 's'}
            {open > 0 ? ` · ${open} still open` : ' · all done'}
          </p>
          <div className="space-y-1.5">
            {turnovers.map((i) => (
              <Link
                key={i.id}
                to="/campground"
                onClick={() => selectIssue(i.id)}
                className="flex items-center gap-2.5 rounded-btn border border-border bg-cream px-3 py-2 hover:border-sage transition-colors"
              >
                <span className="text-[12.5px] text-forest truncate flex-1">{i.title}</span>
                <StatusBadge status={i.status} />
                <ArrowRight className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
