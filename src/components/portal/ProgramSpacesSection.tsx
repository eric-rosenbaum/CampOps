import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Presentation, Loader2, AlertTriangle, Check, Trash2, Accessibility,
  Users, Clock, X, Lock,
} from 'lucide-react';
import {
  supabasePublic, cardClass, inputClass, labelClass, btnPrimary, btnGhost,
  type PortalRetreat,
} from '@/pages/portal/portalShared';
import { LAYOUT_LABELS, type SpaceLayout } from '@/lib/types';
import { parseDateStr, toDateStr, todayStr } from '@/lib/utils';

/**
 * "Where are we actually meeting, and how do you want the room?"
 *
 * This is the guest's end of the seam. What a coordinator types here becomes a work order in
 * the housekeeping queue the moment the camp approves it, with their sentence carried through
 * verbatim — so the setup-notes field is not a nice-to-have at the bottom of the form, it is
 * the feature. Everything else on the row exists to tell the crew which room, which day, and
 * roughly how many chairs.
 *
 * One row per space PER DAY, deliberately. A reset between a Friday session and a Saturday
 * session is two jobs for the person carrying the benches, so it is two rows here.
 *
 * The interaction is the rooming board's: pick a space, then pick the days. Days multi-select
 * because "the dining hall, every day" is the common ask and answering the same six questions
 * four times is how a coordinator gives up halfway. Select-then-place works on a phone on a
 * sofa, which is where this actually gets filled in.
 */

// ─── Shapes returned by the portal RPCs ──────────────────────────────────────
interface ProgramSpace {
  id: string;
  name: string;
  building: string | null;
  capacity_seated: number | null;
  accessible: boolean | null;
  notes: string | null;
}

interface SpaceRequestRow {
  id: string;
  location_id: string;
  location_name: string;
  day_date: string;
  start_label: string | null;
  end_label: string | null;
  purpose: string | null;
  expected_count: number | null;
  layout: SpaceLayout;
  layout_other: string | null;
  setup_notes: string | null;
  status: 'requested' | 'approved' | 'declined' | 'countered';
  response_message: string | null;
}

const STATUS_COPY: Record<SpaceRequestRow['status'], { label: string; cls: string; hint: string }> = {
  requested: {
    label: 'Sent to the camp', cls: 'bg-blue-bg text-blue-text',
    hint: 'Waiting for the camp to confirm.',
  },
  approved: {
    label: 'Approved', cls: 'bg-green-muted-bg text-green-muted-text',
    hint: 'The camp has this on their work list.',
  },
  declined: {
    label: 'Declined', cls: 'bg-red-bg text-red',
    hint: 'The camp could not give you this one.',
  },
  countered: {
    label: 'Needs another look', cls: 'bg-amber-bg text-amber-text',
    hint: 'You changed something after it was approved, so the camp needs to confirm it again.',
  },
};

const LAYOUT_ORDER: SpaceLayout[] = ['theater', 'rounds', 'classroom', 'open', 'other'];

function fmtDay(d: string): string {
  return parseDateStr(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Every calendar day of the stay, arrival and departure included. */
function stayDays(arrival: string, departure: string): string[] {
  const out: string[] = [];
  const end = parseDateStr(departure);
  const cur = parseDateStr(arrival);
  let guard = 0;
  while (cur <= end && guard++ < 60) {
    out.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const LOAD_ERROR = "We could not load the camp's program spaces. Please refresh and try again.";

async function fetchProgramSpaces(
  token: string,
): Promise<{ spaces: ProgramSpace[]; requests: SpaceRequestRow[] } | null> {
  const [sp, rq] = await Promise.all([
    supabasePublic.rpc('portal_program_spaces', { p_token: token }),
    supabasePublic.rpc('portal_space_requests', { p_token: token }),
  ]);
  if (sp.error || rq.error) return null;
  return {
    spaces: (sp.data as ProgramSpace[]) ?? [],
    requests: (rq.data as SpaceRequestRow[]) ?? [],
  };
}

interface Draft {
  locationId: string;
  /**
   * The days this one form is being filled in for. A group that wants the dining hall every
   * day of the stay should answer "how do you want the room?" once, not four times -- but it
   * still becomes one row per day, because a reset between Friday and Saturday is two jobs
   * for the person carrying the benches.
   */
  dayDates: string[];
  startLabel: string;
  endLabel: string;
  purpose: string;
  expectedCount: string;
  layout: SpaceLayout;
  layoutOther: string;
  setupNotes: string;
}

function draftFrom(row: SpaceRequestRow): Draft {
  return {
    locationId: row.location_id, dayDates: [row.day_date],
    startLabel: row.start_label ?? '', endLabel: row.end_label ?? '',
    purpose: row.purpose ?? '', expectedCount: row.expected_count?.toString() ?? '',
    layout: row.layout ?? 'open', layoutOther: row.layout_other ?? '',
    setupNotes: row.setup_notes ?? '',
  };
}

export function ProgramSpacesSection({
  token, retreat, onChanged,
}: {
  token: string;
  retreat: PortalRetreat;
  /** Called after any successful save or withdrawal, so the portal can refresh its checklist. */
  onChanged?: () => void | Promise<void>;
}) {
  const [spaces, setSpaces] = useState<ProgramSpace[]>([]);
  const [requests, setRequests] = useState<SpaceRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const today = todayStr();
  // The group has gone home. Their asks become a record of what happened, not a form.
  const departed = retreat.departure_date < today;
  const editable = !departed;
  // There is no separate deadline for spaces: the camp sets one date by which it wants the
  // group's rooming and program plans, and inventing a second one to miss helps nobody.
  const deadline = retreat.housing_deadline;
  const deadlinePassed = !!deadline && deadline < today && !departed;

  // The fetch lives outside the component and the effect runs it in an async IIFE — the same
  // shape the portal page uses, and the one that keeps state updates out of the effect body.
  const load = useCallback(async () => {
    const res = await fetchProgramSpaces(token);
    if (!res) { setError(LOAD_ERROR); setLoading(false); return; }
    setSpaces(res.spaces);
    setRequests(res.requests);
    setError(null);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetchProgramSpaces(token);
      if (!active) return;
      if (!res) { setError(LOAD_ERROR); setLoading(false); return; }
      setSpaces(res.spaces);
      setRequests(res.requests);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [token]);

  const [pickedDays, setPickedDays] = useState<string[]>([]);

  const days = useMemo(
    () => stayDays(retreat.arrival_date, retreat.departure_date),
    [retreat.arrival_date, retreat.departure_date],
  );

  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  // Requests grouped by day, in stay order. The day is the unit the camp works in, so it is
  // the unit the group reads back.
  const byDay = useMemo(() => {
    const m = new Map<string, SpaceRequestRow[]>();
    for (const r of requests) {
      (m.get(r.day_date) ?? m.set(r.day_date, []).get(r.day_date)!).push(r);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [requests]);

  /** Days for the selected space that have not been asked for yet — what "every day" means. */
  const freeDays = useMemo(
    () => (selectedSpace
      ? days.filter((d) => !requests.some((r) => r.location_id === selectedSpace && r.day_date === d))
      : []),
    [selectedSpace, days, requests],
  );

  const existingFor = useCallback(
    (locationId: string, day: string) => requests.find((r) => r.location_id === locationId && r.day_date === day) ?? null,
    [requests],
  );

  function openDraft(locationId: string, dayList: string[]) {
    // Editing exactly one day that already exists reopens that ask; anything else is new.
    const existing = dayList.length === 1 ? existingFor(locationId, dayList[0]) : null;
    setDraft(existing ? draftFrom(existing) : {
      locationId, dayDates: dayList, startLabel: '', endLabel: '', purpose: '',
      expectedCount: '', layout: 'open', layoutOther: '', setupNotes: '',
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(null);
    const count = draft.expectedCount.trim() === '' ? null : Number(draft.expectedCount);
    let err: { message?: string } | null = null;
    for (const day of draft.dayDates) {
      const res = await supabasePublic.rpc('portal_save_space_request', {
        p_token: token,
        p_location_id: draft.locationId,
        p_day_date: day,
        p_start_label: draft.startLabel.trim() || null,
        p_end_label: draft.endLabel.trim() || null,
        p_purpose: draft.purpose.trim() || null,
        p_expected_count: Number.isFinite(count) ? count : null,
        p_layout: draft.layout,
        p_layout_other: draft.layout === 'other' ? draft.layoutOther.trim() || null : null,
        p_setup_notes: draft.setupNotes.trim() || null,
      });
      if (res.error) { err = res.error; break; }
    }
    setBusy(false);
    if (err) { setError(err.message || 'Could not save that request. Please try again.'); return; }
    setDraft(null);
    setPickedDays([]);
    await load();
    await onChanged?.();
  }

  async function withdraw(id: string) {
    setBusy(true); setError(null);
    const { error: err } = await supabasePublic.rpc('portal_delete_space_request', { p_token: token, p_id: id });
    setBusy(false);
    if (err) { setError(err.message || 'Could not withdraw that request.'); return; }
    await load();
    await onChanged?.();
  }

  if (loading) {
    return (
      <div className={`${cardClass} p-6 flex items-center gap-2.5 text-[13px] text-ink-soft`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the camp's program spaces…
      </div>
    );
  }

  if (spaces.length === 0 && requests.length === 0) {
    return (
      <div className={`${cardClass} p-8 text-center`}>
        <Presentation className="w-8 h-8 text-ink-faint mx-auto mb-3" />
        <p className="text-[15px] font-semibold text-forest">No bookable spaces yet</p>
        <p className="text-[13px] text-ink-soft mt-1.5 max-w-sm mx-auto leading-relaxed">
          The camp hasn't opened any meeting or activity spaces for booking. Ask your
          coordinator if you need a room for a session.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {departed && (
        <div className="flex items-start gap-2.5 bg-cream-dark border border-border rounded-xl px-4 py-3">
          <Lock className="w-4 h-4 text-ink-soft flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-ink">
            Your stay has finished. These are a record of what you asked for.
          </p>
        </div>
      )}
      {deadlinePassed && (
        <div className="flex items-start gap-2.5 bg-amber-bg border border-amber/30 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-text flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-text">
            Your {fmtDay(deadline as string)} rooming deadline has passed. You can still ask
            for a space, but a late set-up may not reach the crew in time — ring the camp too.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 bg-red-bg border border-red/30 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-red">{error}</p>
        </div>
      )}

      {/* ── What you have asked for ── */}
      {byDay.length > 0 && (
        <div className="space-y-3">
          {byDay.map(([day, rows]) => (
            <div key={day} className={`${cardClass} p-4`}>
              <p className="text-[13px] font-bold uppercase tracking-wide text-ink-faint mb-3">{fmtDay(day)}</p>
              <div className="space-y-2.5">
                {rows.map((r) => (
                  <RequestRow
                    key={r.id}
                    row={r}
                    space={spaceById.get(r.location_id) ?? null}
                    editable={editable}
                    busy={busy}
                    onEdit={() => { setSelectedSpace(r.location_id); openDraft(r.location_id, [r.day_date]); }}
                    onWithdraw={() => withdraw(r.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pick a space, then pick a day ── */}
      {editable && spaces.length > 0 && (
        <div className={`${cardClass} p-4`}>
          <p className="text-[15px] font-bold text-forest">
            {requests.length === 0 ? 'Choose your program spaces' : 'Add another space'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {spaces.map((s) => {
              const on = selectedSpace === s.id;
              const booked = requests.filter((r) => r.location_id === s.id).length;
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSpace(on ? null : s.id); setPickedDays([]); }}
                  className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                    on ? 'bg-forest text-white border-forest' : 'bg-cream border-border hover:border-sage'
                  }`}
                >
                  <p className={`text-[14px] font-semibold flex items-center gap-1.5 ${on ? 'text-white' : 'text-forest'}`}>
                    {s.name}
                    {s.accessible && <Accessibility className={`w-3.5 h-3.5 ${on ? 'text-white' : 'text-blue'}`} />}
                  </p>
                  <p className={`text-[12px] mt-0.5 ${on ? 'text-white/75' : 'text-ink-soft'}`}>
                    {s.building ? `${s.building} · ` : ''}
                    {s.capacity_seated != null ? `seats ${s.capacity_seated}` : 'capacity not listed'}
                    {booked > 0 && ` · ${booked} day${booked === 1 ? '' : 's'} booked`}
                  </p>
                  {s.notes && (
                    <p className={`text-[11.5px] mt-1 ${on ? 'text-white/70' : 'text-ink-faint'}`}>{s.notes}</p>
                  )}
                </button>
              );
            })}
          </div>

          {selectedSpace && (
            <div className="mt-4 pt-4 border-t border-cream-dark">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                <p className="text-[13px] font-semibold text-forest">
                  Which days do you need {spaceById.get(selectedSpace)?.name}?
                </p>
                {freeDays.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPickedDays(
                      pickedDays.length === freeDays.length ? [] : freeDays,
                    )}
                    className="text-[12.5px] font-semibold text-forest hover:underline"
                  >
                    {pickedDays.length === freeDays.length ? 'Clear' : 'Every day'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {days.map((d) => {
                  const existing = existingFor(selectedSpace, d);
                  const picked = pickedDays.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => {
                        // A day already asked for opens that ask; the rest toggle.
                        if (existing) { openDraft(selectedSpace, [d]); return; }
                        setPickedDays(picked ? pickedDays.filter((x) => x !== d) : [...pickedDays, d]);
                      }}
                      className={`inline-flex items-center gap-1.5 text-[13px] rounded-full px-3 py-1.5 border transition-colors ${
                        existing
                          ? 'bg-sage-pale border-sage/40 text-forest'
                          : picked
                            ? 'bg-forest border-forest text-white font-semibold'
                            : 'bg-white border-border text-ink hover:border-sage'
                      }`}
                    >
                      {existing && <Check className="w-3.5 h-3.5" />}
                      {fmtDay(d)}
                    </button>
                  );
                })}
              </div>
              {pickedDays.length > 0 && (
                <button
                  type="button"
                  onClick={() => openDraft(selectedSpace, [...pickedDays].sort())}
                  className={`${btnPrimary} mt-3`}
                >
                  Set up {pickedDays.length} day{pickedDays.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {draft && (
        <RequestForm
          draft={draft}
          space={spaceById.get(draft.locationId) ?? null}
          existing={draft.dayDates.length === 1 ? existingFor(draft.locationId, draft.dayDates[0]) : null}
          busy={busy}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

// ─── One ask, as the group sees it back ──────────────────────────────────────
function RequestRow({
  row, space, editable, busy, onEdit, onWithdraw,
}: {
  row: SpaceRequestRow;
  space: ProgramSpace | null;
  editable: boolean;
  busy: boolean;
  onEdit: () => void;
  onWithdraw: () => void;
}) {
  const status = STATUS_COPY[row.status] ?? STATUS_COPY.requested;
  const time = [row.start_label, row.end_label].filter(Boolean).join(' – ');
  const cap = space?.capacity_seated ?? null;
  const over = cap != null && row.expected_count != null && row.expected_count > cap;
  // Only a group's own ask can be withdrawn, and only before it becomes somebody's work.
  const withdrawable = editable && (row.status === 'requested' || row.status === 'countered');

  return (
    <div className="rounded-xl border border-border bg-cream px-3.5 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-forest">{row.location_name}</p>
          <p className="text-[12.5px] text-ink-soft mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {time && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{time}</span>}
            {row.expected_count != null && (
              <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{row.expected_count}</span>
            )}
            <span>{row.layout === 'other' ? (row.layout_other || 'Something else') : LAYOUT_LABELS[row.layout]}</span>
          </p>
          {row.purpose && <p className="text-[12.5px] text-ink mt-1">{row.purpose}</p>}
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide flex-shrink-0 ${status.cls}`}>
          {status.label}
        </span>
      </div>

      {row.setup_notes && (
        <p className="text-[12.5px] text-ink mt-2 pl-3 border-l-2 border-sage/50 italic leading-relaxed">
          {row.setup_notes}
        </p>
      )}

      {over && (
        <p className="text-[12px] text-amber-text mt-2 inline-flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          You've said {row.expected_count} people and this room seats {cap}. The camp will
          still see the request — mention it to them if the number is right.
        </p>
      )}

      <p className="text-[12px] text-ink-soft mt-2">{status.hint}</p>
      {row.response_message && (
        <p className="text-[12.5px] text-ink mt-1.5 bg-white border border-border rounded-lg px-3 py-2 leading-relaxed">
          <span className="font-semibold text-forest">From the camp: </span>{row.response_message}
        </p>
      )}

      {editable && (
        <div className="flex gap-3 mt-2.5">
          <button onClick={onEdit} disabled={busy} className="text-[12.5px] font-semibold text-forest hover:opacity-70">
            Change this
          </button>
          {withdrawable && (
            <button
              onClick={onWithdraw}
              disabled={busy}
              className="text-[12.5px] font-semibold text-red hover:opacity-70 inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Withdraw
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── The form ────────────────────────────────────────────────────────────────
function RequestForm({
  draft, space, existing, busy, onChange, onCancel, onSave,
}: {
  draft: Draft;
  space: ProgramSpace | null;
  existing: SpaceRequestRow | null;
  busy: boolean;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  const cap = space?.capacity_seated ?? null;
  const count = Number(draft.expectedCount);
  const over = cap != null && draft.expectedCount.trim() !== '' && Number.isFinite(count) && count > cap;

  return (
    <div className={`${cardClass} p-4 space-y-3.5 border-sage/60`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold text-forest">{space?.name ?? 'Space'}</p>
          <p className="text-[12.5px] text-ink-soft mt-0.5">
            {draft.dayDates.length === 1
              ? fmtDay(draft.dayDates[0])
              : `${draft.dayDates.length} days · ${fmtDay(draft.dayDates[0])} – ${fmtDay(draft.dayDates[draft.dayDates.length - 1])}`}
            {cap != null && ` · seats ${cap}`}
          </p>
          {draft.dayDates.length > 1 && (
            <p className="text-[11.5px] text-ink-soft mt-1">
              Saved as one ask per day, so the camp can confirm each one.
            </p>
          )}
        </div>
        <button onClick={onCancel} className="text-ink-faint hover:text-forest" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {existing?.status === 'approved' && (
        <div className="flex items-start gap-2.5 bg-amber-bg border border-amber/30 rounded-xl px-3.5 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-text flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-amber-text leading-relaxed">
            The camp has already approved this one and put it on their work list. Changing the
            day, the layout, the numbers or your set-up notes sends it back to them to confirm
            again.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Starts</label>
          <input
            value={draft.startLabel}
            onChange={(e) => set('startLabel', e.target.value)}
            className={inputClass}
            placeholder="After dinner"
          />
        </div>
        <div>
          <label className={labelClass}>Ends</label>
          <input
            value={draft.endLabel}
            onChange={(e) => set('endLabel', e.target.value)}
            className={inputClass}
            placeholder="9:30ish"
          />
        </div>
      </div>
      <p className="text-[11.5px] text-ink-soft -mt-1.5">
        Write it however you say it. "After dinner" and "9:00–11:30" are both fine.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>What's happening</label>
          <input
            value={draft.purpose}
            onChange={(e) => set('purpose', e.target.value)}
            className={inputClass}
            placeholder="Saturday night song session"
          />
        </div>
        <div>
          <label className={labelClass}>How many people</label>
          <input
            value={draft.expectedCount}
            onChange={(e) => set('expectedCount', e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            className={inputClass}
            placeholder="45"
          />
        </div>
      </div>

      {over && (
        <p className="text-[12.5px] text-amber-text inline-flex items-start gap-1.5 -mt-1">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {space?.name} seats {cap}. You can still ask for it — the camp will decide whether
          it works.
        </p>
      )}

      <div>
        <label className={labelClass}>How should it be set up</label>
        <div className="flex flex-wrap gap-1.5">
          {LAYOUT_ORDER.map((l) => (
            <button
              key={l}
              onClick={() => set('layout', l)}
              className={`text-[13px] rounded-full px-3.5 py-1.5 border transition-colors ${
                draft.layout === l ? 'bg-forest text-white border-forest' : 'bg-white border-border text-ink hover:border-sage'
              }`}
            >
              {LAYOUT_LABELS[l]}
            </button>
          ))}
        </div>
        {draft.layout === 'other' && (
          <input
            value={draft.layoutOther}
            onChange={(e) => set('layoutOther', e.target.value)}
            className={`${inputClass} mt-2`}
            placeholder="Describe the shape you want"
          />
        )}
      </div>

      {/* The point of the whole screen. Given room to breathe, and asked for in the second
          person, because this sentence is read by the person carrying the benches. */}
      <div>
        <label className={labelClass}>Anything the crew should know</label>
        <textarea
          value={draft.setupNotes}
          onChange={(e) => set('setupNotes', e.target.value)}
          rows={4}
          className={`${inputClass} resize-y leading-relaxed`}
          placeholder="Three benches along the back wall, two tables at the front"
        />
        <p className="text-[11.5px] text-ink-soft mt-1.5">
          Say it in your own words. This goes straight to the person setting the room up,
          exactly as you write it.
        </p>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={busy} className={`${btnPrimary} flex-1`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Ask the camp'}
        </button>
        <button onClick={onCancel} disabled={busy} className={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}
