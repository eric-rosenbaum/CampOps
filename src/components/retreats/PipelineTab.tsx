// The rental pipeline: a kanban of enquiries with next-actions and nothing else.
//
// A camp hosts fifteen to forty groups a year. That is not a CRM problem, so this is not a CRM:
// six stages, a follow-up strip, and two numbers that tell the director whether the rental side
// of the business is ahead of last year. Everything a real CRM adds beyond that — scoring,
// sequences, custom fields — would be maintenance the camp pays for and never uses.
import { useMemo, useState } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { Modal } from '@/components/shared/Modal';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import type { LeadStage, Retreat } from '@/lib/types';
import { LEAD_STAGES, LEAD_STAGE_LABELS } from '@/lib/types';
import { money, fmtDate, inputClass, labelClass, estimateRevenue } from './retreatUi';
import { todayStr } from '@/lib/utils';
import { LeadCard } from './LeadCard';
import { IntakePasteModal } from './IntakePasteModal';

/** What one lead is worth: what somebody typed, else what the rate card implies. */
function leadValue(r: Retreat): number {
  return r.estimatedValue ?? estimateRevenue(r, 0);
}

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** Stage column tints. Won is the only one that gets a colour — it is the only one that pays. */
const STAGE_TINT: Record<LeadStage, string> = {
  new: 'bg-cream-dark/40',
  qualifying: 'bg-cream-dark/40',
  proposal: 'bg-blue-bg/50',
  contract_out: 'bg-amber-bg/50',
  won: 'bg-green-muted-bg/60',
  lost: 'bg-cream-dark/30',
};

export function PipelineTab() {
  const {
    retreats, touchpoints, updateRetreat, enterRetreat,
  } = useRetreatStore();
  const { members } = useCampStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [lostFor, setLostFor] = useState<Retreat | null>(null);
  const [nextActionFor, setNextActionFor] = useState<Retreat | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const today = todayStr();

  // ── Derived, never in a selector ──────────────────────────────────────────
  // React 19 + zustand v5: a selector that allocates a new array or object every render
  // re-renders forever. Subscribe to the raw slices above, derive here.
  const ownerNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.userId, mem.displayName ?? mem.fullName);
    return m;
  }, [members]);

  const lastTouchByRetreat = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of touchpoints) {
      const seen = m.get(t.retreatId);
      if (!seen || t.occurredAt > seen) m.set(t.retreatId, t.occurredAt);
    }
    return m;
  }, [touchpoints]);

  const byStage = useMemo(() => {
    const out: Record<LeadStage, Retreat[]> = {
      new: [], qualifying: [], proposal: [], contract_out: [], won: [], lost: [],
    };
    for (const r of retreats) out[r.leadStage]?.push(r);
    // Inside a column, whatever is due soonest is what you should be doing. Leads with no
    // next action sink to the bottom, where their emptiness is visible.
    for (const s of LEAD_STAGES) {
      out[s].sort((a, b) => {
        if (a.nextActionOn && b.nextActionOn) return a.nextActionOn.localeCompare(b.nextActionOn);
        if (a.nextActionOn) return -1;
        if (b.nextActionOn) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
    }
    return out;
  }, [retreats]);

  const followUps = useMemo(() => (
    retreats
      .filter((r) => r.leadStage !== 'won' && r.leadStage !== 'lost'
        && r.nextActionOn != null && r.nextActionOn <= today)
      .sort((a, b) => (a.nextActionOn ?? '').localeCompare(b.nextActionOn ?? ''))
  ), [retreats, today]);

  // Pipeline value by month, this year against last. Both series use the identical filter
  // (every lead that is not lost) so the comparison is like for like — last year's leads have
  // simply all resolved by now, which is what makes it a benchmark.
  const monthly = useMemo(() => {
    const bucket = (y: number) => {
      const sums = new Array<number>(12).fill(0);
      for (const r of retreats) {
        if (!r.arrivalDate || r.leadStage === 'lost' || r.status === 'cancelled') continue;
        if (Number(r.arrivalDate.slice(0, 4)) !== y) continue;
        sums[Number(r.arrivalDate.slice(5, 7)) - 1] += leadValue(r);
      }
      return sums;
    };
    const thisYear = bucket(year);
    const lastYear = bucket(year - 1);
    return {
      thisYear, lastYear,
      max: Math.max(1, ...thisYear, ...lastYear),
      thisTotal: thisYear.reduce((a, b) => a + b, 0),
      lastTotal: lastYear.reduce((a, b) => a + b, 0),
    };
  }, [retreats, year]);

  // Undated leads have no month, so they cannot appear above. They are still real money and
  // saying so beats a chart that quietly under-reports the book.
  const undated = useMemo(() => {
    const open = retreats.filter((r) => !r.arrivalDate && r.leadStage !== 'lost' && r.leadStage !== 'won');
    return { count: open.length, value: open.reduce((s, r) => s + leadValue(r), 0) };
  }, [retreats]);

  const conversion = useMemo(() => {
    const inYear = retreats.filter((r) => new Date(r.createdAt).getFullYear() === year);
    const won = inYear.filter((r) => r.leadStage === 'won').length;
    const lost = inYear.filter((r) => r.leadStage === 'lost').length;
    const open = inYear.length - won - lost;
    // Won over DECIDED enquiries. Dividing by every enquiry ever received would make a camp
    // with a healthy full pipeline look like it is failing, which is the opposite of true.
    const decided = won + lost;
    return { won, lost, open, decided, pct: decided ? Math.round((won / decided) * 100) : null };
  }, [retreats, year]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function moveTo(r: Retreat, stage: LeadStage) {
    if (!canManage) return;
    // Losing a booking without recording why is how a camp loses the same booking twice.
    if (stage === 'lost') { setLostFor(r); return; }
    updateRetreat({
      ...r, leadStage: stage,
      lostReason: stage === 'won' ? null : r.lostReason,
      updatedAt: new Date().toISOString(),
    });
  }

  const delta = monthly.lastTotal > 0
    ? Math.round(((monthly.thisTotal - monthly.lastTotal) / monthly.lastTotal) * 100)
    : null;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-page-title font-bold text-forest">Pipeline</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-btn bg-white">
            <button
              type="button" onClick={() => setYear((y) => y - 1)}
              className="px-2.5 py-1.5 text-[13px] text-ink-soft hover:text-forest transition-colors"
              aria-label="Previous year"
            >‹</button>
            <span className="px-1 text-[13px] font-semibold text-forest tabular-nums">{year}</span>
            <button
              type="button" onClick={() => setYear((y) => y + 1)}
              className="px-2.5 py-1.5 text-[13px] text-ink-soft hover:text-forest transition-colors"
              aria-label="Next year"
            >›</button>
          </div>
          {canManage && (
            <Button onClick={() => setIntakeOpen(true)}>
              <Plus className="w-4 h-4" /> New enquiry
            </Button>
          )}
        </div>
      </div>

      {/* The two numbers ------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5">
        <StatCard
          label={`Pipeline value ${year}`}
          value={money(monthly.thisTotal)}
          variant={delta != null && delta < 0 ? 'amber' : 'green'}
          hint={monthly.lastTotal > 0
            ? `${money(monthly.lastTotal)} in ${year - 1} · ${delta != null && delta >= 0 ? '+' : ''}${delta}%`
            : `Nothing booked in ${year - 1} to compare against`}
        />
        <StatCard
          label="Enquiry → booked"
          value={conversion.pct == null ? '—' : `${conversion.pct}%`}
          hint={conversion.decided
            ? `${conversion.won} booked, ${conversion.lost} lost · ${conversion.open} still open`
            : `${conversion.open} enquiries still open, none decided yet`}
        />
      </div>

      {/* Value by month, this year against last.
          Two years side by side must not be a stacked chart — stacking would add them together
          and read as growth. Hence a purpose-built pair of bars rather than the shared
          ColumnChart, which stacks by design. */}
      <div className="bg-white border border-border rounded-card p-4 mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">
            Pipeline value by arrival month
          </p>
          <div className="flex items-center gap-3 text-[11px] text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-forest" />{year}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-sage-pale border border-sage/50" />{year - 1}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            <div className="flex items-end gap-1.5 h-[132px]">
              {MONTH_LABELS.map((_, i) => {
                const a = monthly.thisYear[i];
                const b = monthly.lastYear[i];
                const label = new Date(year, i, 1).toLocaleDateString('en-US', { month: 'long' });
                return (
                  <div key={i} className="flex-1 h-full flex items-end justify-center gap-[3px]">
                    <div
                      title={`${label} ${year}: ${money(a)}`}
                      className="w-[45%] bg-forest rounded-t-[2px] min-h-[2px]"
                      style={{ height: `${Math.max(a > 0 ? 3 : 1.5, (a / monthly.max) * 100)}%` }}
                    />
                    <div
                      title={`${label} ${year - 1}: ${money(b)}`}
                      className="w-[45%] bg-sage-pale border border-sage/40 border-b-0 rounded-t-[2px] min-h-[2px]"
                      style={{ height: `${Math.max(b > 0 ? 3 : 1.5, (b / monthly.max) * 100)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {MONTH_LABELS.map((m, i) => (
                <span key={i} className="flex-1 text-center text-[10px] text-ink-faint">{m}</span>
              ))}
            </div>
          </div>
        </div>

        {undated.count > 0 && (
          <p className="text-[11.5px] text-ink-soft mt-3 pt-3 border-t border-border">
            Plus <strong className="text-ink">{undated.count}</strong> open{' '}
            {undated.count === 1 ? 'enquiry' : 'enquiries'} worth{' '}
            <strong className="text-ink tabular-nums">{money(undated.value)}</strong> with no dates yet —
            they have no month to sit in.
          </p>
        )}
      </div>

      {/* Follow-ups due ------------------------------------------------------- */}
      {followUps.length > 0 && (
        <div className="bg-red-bg border border-red/25 rounded-card px-4 py-3 mb-5">
          <p className="flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-[0.14em] text-red mb-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Follow-ups due ({followUps.length})
          </p>
          <ul className="divide-y divide-red/15">
            {followUps.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => enterRetreat(r.id)}
                  className="w-full text-left py-1.5 flex flex-col sm:flex-row sm:items-baseline sm:gap-2 hover:opacity-70 transition-opacity"
                >
                  <span className="text-[12.5px] font-semibold text-forest">{r.groupName}</span>
                  <span className="text-[12.5px] text-ink flex-1 min-w-0">{r.nextAction ?? 'Follow up'}</span>
                  <span className="text-[11.5px] font-semibold text-red tabular-nums whitespace-nowrap">
                    {r.nextActionOn === today ? 'Today' : fmtDate(r.nextActionOn)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Board ---------------------------------------------------------------- */}
      {/* One scrolling row at every width. Six stacked columns on a phone would bury the last
          three; a swipe keeps them all one gesture away. */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        {LEAD_STAGES.map((stage) => {
          const list = byStage[stage];
          const value = list.reduce((s, r) => s + leadValue(r), 0);
          return (
            <div
              key={stage}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const r = retreats.find((x) => x.id === dragId);
                setDragId(null);
                if (r && r.leadStage !== stage) moveTo(r, stage);
              }}
              className={`w-[78vw] sm:w-[248px] flex-shrink-0 rounded-card border border-border ${STAGE_TINT[stage]}`}
            >
              <div className="px-3 py-2.5 border-b border-border">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-forest">
                    {LEAD_STAGE_LABELS[stage]}
                  </p>
                  <span className="text-[11px] text-ink-soft tabular-nums">{list.length}</span>
                </div>
                {value > 0 && (
                  <p className="text-[11px] text-ink-soft tabular-nums mt-0.5">{money(value)}</p>
                )}
              </div>
              <div className="p-2 space-y-2 min-h-[80px]">
                {list.map((r) => (
                  <LeadCard
                    key={r.id}
                    retreat={r}
                    ownerName={r.ownerId ? ownerNames.get(r.ownerId) ?? null : null}
                    lastTouchAt={lastTouchByRetreat.get(r.id) ?? null}
                    canManage={canManage}
                    onOpen={() => enterRetreat(r.id)}
                    onMove={(s) => moveTo(r, s)}
                    onEditNextAction={() => setNextActionFor(r)}
                    onDragStart={() => setDragId(r.id)}
                  />
                ))}
                {list.length === 0 && (
                  <p className="text-[11.5px] text-ink-faint text-center py-4">Nothing here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {intakeOpen && <IntakePasteModal onClose={() => setIntakeOpen(false)} />}
      {lostFor && (
        <LostReasonModal
          retreat={lostFor}
          onClose={() => setLostFor(null)}
          onSave={(reason) => {
            updateRetreat({
              ...lostFor, leadStage: 'lost', lostReason: reason,
              nextAction: null, nextActionOn: null, updatedAt: new Date().toISOString(),
            });
            setLostFor(null);
          }}
        />
      )}
      {nextActionFor && (
        <NextActionModal
          retreat={nextActionFor}
          owners={members.map((m) => ({ id: m.userId, name: m.displayName ?? m.fullName }))}
          onClose={() => setNextActionFor(null)}
          onSave={(patch) => {
            updateRetreat({ ...nextActionFor, ...patch, updatedAt: new Date().toISOString() });
            setNextActionFor(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Lost ─────────────────────────────────────────────────────────────────────
// The reasons a camp loses bookings are the most actionable data in the module — "too
// expensive" five times in a season is a rate-card conversation, not five separate shrugs.
const COMMON_LOST_REASONS = [
  'Price', 'Dates unavailable', 'Chose another venue', 'Group cancelled the event',
  'Facilities not a fit', 'Went quiet',
];

function LostReasonModal({ retreat, onClose, onSave }: {
  retreat: Retreat;
  onClose: () => void;
  onSave: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Modal title={`Mark “${retreat.groupName}” lost`} onClose={onClose} width="440px">
      <p className="text-[12.5px] text-ink-soft mb-3">
        Why did it not happen? Five “price” answers in a season is a rate-card conversation.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {COMMON_LOST_REASONS.map((r) => (
          <button
            key={r} type="button" onClick={() => setReason(r)}
            className={`px-2.5 py-1 rounded-pill text-[12px] border transition-colors ${
              reason === r ? 'bg-forest text-white border-forest' : 'bg-white border-border text-ink hover:border-sage'
            }`}
          >{r}</button>
        ))}
      </div>
      <label className={labelClass}>Reason</label>
      <input
        value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}
        placeholder="In their words, if you have them" autoFocus
      />
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={!reason.trim()} onClick={() => onSave(reason.trim())}>
          Mark lost
        </Button>
      </div>
    </Modal>
  );
}

// ─── Next action ──────────────────────────────────────────────────────────────
function NextActionModal({ retreat, owners, onClose, onSave }: {
  retreat: Retreat;
  owners: { id: string; name: string }[];
  onClose: () => void;
  onSave: (patch: Pick<Retreat, 'nextAction' | 'nextActionOn' | 'ownerId' | 'estimatedValue' | 'leadSource'>) => void;
}) {
  const [action, setAction] = useState(retreat.nextAction ?? '');
  const [on, setOn] = useState(retreat.nextActionOn ?? todayStr());
  const [owner, setOwner] = useState(retreat.ownerId ?? '');
  const [value, setValue] = useState(retreat.estimatedValue != null ? String(retreat.estimatedValue) : '');
  const [source, setSource] = useState(retreat.leadSource ?? '');

  return (
    <Modal title={retreat.groupName} onClose={onClose} width="440px">
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Next action</label>
          <input
            value={action} onChange={(e) => setAction(e.target.value)} className={inputClass}
            placeholder="e.g. Call Rabbi Stein about the Sunday departure" autoFocus
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>On</label>
            <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Owner</label>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass}>
              <option value="">Unassigned</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Estimated value</label>
            <input
              type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)}
              className={inputClass} placeholder="0"
            />
          </div>
          <div>
            <label className={labelClass}>Lead source</label>
            <input
              value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}
              placeholder="e.g. Returning group, referral"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between gap-2 mt-5">
        <Button
          variant="ghost"
          onClick={() => onSave({
            nextAction: null, nextActionOn: null,
            ownerId: owner || null,
            estimatedValue: value.trim() === '' ? null : Number(value),
            leadSource: source.trim() || null,
          })}
        >
          Clear action
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave({
              nextAction: action.trim() || null,
              nextActionOn: action.trim() ? on : null,
              ownerId: owner || null,
              estimatedValue: value.trim() === '' ? null : Number(value),
              leadSource: source.trim() || null,
            })}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
