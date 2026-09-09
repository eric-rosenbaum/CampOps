import { useMemo, useState } from 'react';
import { AlertTriangle, Wrench } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useLocationStore } from '@/store/locationStore';
import { useCampStore } from '@/store/campStore';
import { dbAddSpaceRequest, dbUpdateSpaceRequest } from '@/lib/retreatsDb';
import { generateId, parseDateStr, toDateStr } from '@/lib/utils';
import { LAYOUT_LABELS, type RetreatSpaceRequest, type SpaceLayout } from '@/lib/types';
import { inputClass, labelClass } from './retreatUi';

/**
 * The camp logging or editing a space request itself.
 *
 * Most of these arrive through the guest portal, but a coordinator rings up as often as not,
 * and a booking system that can only receive asks through one channel quietly pushes the
 * phone calls onto a sticky note. Same row, same work orders, whoever typed it.
 *
 * Two rules the form enforces because the database does:
 *  · an out-of-service space cannot be approved, so it is not offered here either;
 *  · changing the day, layout, headcount or the group's set-up notes on an ALREADY APPROVED
 *    request reopens it as `countered` (a trigger does this and comments on the work order).
 *    That is surfaced before saving, not discovered afterwards.
 */

const LAYOUT_ORDER: SpaceLayout[] = ['theater', 'rounds', 'classroom', 'open', 'other'];

export function SpaceRequestModal({
  retreatId, requestId, onClose,
}: {
  retreatId: string;
  /** Omit to log a new ask. */
  requestId?: string;
  onClose: () => void;
}) {
  const spaceRequests = useRetreatStore((s) => s.spaceRequests);
  const setSpaceRequests = useRetreatStore((s) => s.setSpaceRequests);
  const retreatById = useRetreatStore((s) => s.retreatById);
  // Subscribe to the stable array and derive: a selector that builds a new array each render
  // infinite-loops under React 19 + zustand v5.
  const locations = useLocationStore((s) => s.locations);
  const currentCamp = useCampStore((s) => s.currentCamp);

  const existing = requestId ? spaceRequests.find((r) => r.id === requestId) ?? null : null;
  const retreat = retreatById(retreatId);

  const spaces = useMemo(
    () => locations
      .filter((l) => l.programSpace && l.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [locations],
  );
  const buildingName = useMemo(() => {
    const byId = new Map(locations.map((l) => [l.id, l.name]));
    return (parentId: string | null) => (parentId ? byId.get(parentId) ?? null : null);
  }, [locations]);

  const [locationId, setLocationId] = useState(existing?.locationId ?? spaces.find((s) => s.serviceStatus !== 'out_of_service')?.id ?? '');
  const [dayDate, setDayDate] = useState(existing?.dayDate ?? retreat?.arrivalDate ?? toDateStr(new Date()));
  // A group that has the room all week is one ask, not five. Blank means the same day.
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [startLabel, setStartLabel] = useState(existing?.startLabel ?? '');
  const [endLabel, setEndLabel] = useState(existing?.endLabel ?? '');
  const [purpose, setPurpose] = useState(existing?.purpose ?? '');
  const [expectedCount, setExpectedCount] = useState(existing?.expectedCount?.toString() ?? '');
  const [layout, setLayout] = useState<SpaceLayout>(existing?.layout ?? 'open');
  const [layoutOther, setLayoutOther] = useState(existing?.layoutOther ?? '');
  const [setupNotes, setSetupNotes] = useState(existing?.setupNotes ?? '');
  const [campNotes, setCampNotes] = useState(existing?.campNotes ?? '');
  const [saving, setSaving] = useState(false);

  const space = spaces.find((s) => s.id === locationId) ?? null;
  const cap = space?.capacitySeated ?? null;
  const count = expectedCount.trim() === '' ? null : Number(expectedCount);
  const over = cap != null && count != null && Number.isFinite(count) && count > cap;
  const outOfService = space?.serviceStatus === 'out_of_service';

  // The exact set of fields the DB trigger watches. Saying "this reopens it" when nothing
  // material changed would train people to ignore the warning.
  const reopens = existing?.status === 'approved' && (
    dayDate !== existing.dayDate
    || (endDate || dayDate) !== existing.endDate
    || layout !== existing.layout
    || (setupNotes.trim() || null) !== existing.setupNotes
    || (count ?? null) !== existing.expectedCount
  );

  const dup = spaceRequests.find(
    (r) => r.retreatId === retreatId && r.locationId === locationId
      && r.dayDate === dayDate && r.id !== existing?.id,
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId || outOfService || dup) return;
    setSaving(true);

    const now = new Date().toISOString();
    const base: RetreatSpaceRequest = {
      id: existing?.id ?? generateId(),
      campId: existing?.campId ?? currentCamp?.id ?? '',
      retreatId,
      locationId,
      dayDate,
      endDate: endDate && endDate >= dayDate ? endDate : dayDate,
      startLabel: startLabel.trim() || null,
      endLabel: endLabel.trim() || null,
      purpose: purpose.trim() || null,
      expectedCount: count != null && Number.isFinite(count) ? count : null,
      layout,
      layoutOther: layout === 'other' ? layoutOther.trim() || null : null,
      setupNotes: setupNotes.trim() || null,
      campNotes: campNotes.trim() || null,
      // The trigger will move an edited approved row to `countered` server-side; mirroring it
      // locally keeps the list honest until the realtime reload lands.
      status: reopens ? 'countered' : existing?.status ?? 'requested',
      responseMessage: existing?.responseMessage ?? null,
      respondedBy: existing?.respondedBy ?? null,
      respondedAt: existing?.respondedAt ?? null,
      workOrderId: existing?.workOrderId ?? null,
      strikeOrderId: existing?.strikeOrderId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      setSpaceRequests(spaceRequests.map((r) => (r.id === base.id ? base : r)));
      await dbUpdateSpaceRequest(base);
    } else {
      setSpaceRequests([...spaceRequests, base]);
      await dbAddSpaceRequest(base);
    }
    setSaving(false);
    onClose();
  }

  return (
    <Modal title={existing ? 'Edit space request' : 'Log a space request'} onClose={onClose} width="560px">
      <form onSubmit={save} className="space-y-4">
        {retreat && (
          <p className="text-[12px] text-ink-soft -mt-2">
            {retreat.groupName}
            {retreat.arrivalDate && retreat.departureDate
              && ` · ${parseDateStr(retreat.arrivalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${parseDateStr(retreat.departureDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </p>
        )}

        {reopens && (
          <div className="flex items-start gap-2.5 bg-amber-bg border border-amber/30 rounded-card px-3.5 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-text flex-shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-amber-text leading-relaxed">
              This request is already approved and has work orders against it. Saving these
              changes reopens it as <strong>needs re-approval</strong> and leaves a note on the
              set-up work order. Approve it again to update the crew's instructions.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Space</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass}>
              {spaces.length === 0 && <option value="">No program spaces defined</option>}
              {spaces.map((s) => {
                const b = buildingName(s.parentId);
                return (
                  <option key={s.id} value={s.id} disabled={s.serviceStatus === 'out_of_service'}>
                    {b ? `${b} · ` : ''}{s.name}
                    {s.capacitySeated != null ? ` (seats ${s.capacitySeated})` : ''}
                    {s.serviceStatus === 'out_of_service' ? ' — out of service' : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className={labelClass}>First day</label>
            <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Last day</label>
            <input
              type="date" value={endDate} min={dayDate}
              onChange={(e) => setEndDate(e.target.value)} className={inputClass}
            />
            <p className="text-[11.5px] text-ink-soft mt-1">
              Leave blank for a single day. A run is set up once and reset once.
            </p>
          </div>
        </div>

        {outOfService && (
          <div className="flex items-start gap-2.5 bg-red-bg border border-red/30 rounded-card px-3.5 py-2.5">
            <Wrench className="w-4 h-4 text-red flex-shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-red leading-relaxed">
              {space?.name} is out of service{space?.outOfServiceReason ? ` — ${space.outOfServiceReason}` : ''}.
              Put it back in service in Locations before booking a group into it.
            </p>
          </div>
        )}

        {dup && (
          <div className="flex items-start gap-2.5 bg-amber-bg border border-amber/30 rounded-card px-3.5 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-text flex-shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-amber-text leading-relaxed">
              This group already has {space?.name ?? 'this space'} on that day. Edit that
              request rather than adding a second one — one row per space per day is what keeps
              set-up and strike from being generated twice.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Starts</label>
            <input value={startLabel} onChange={(e) => setStartLabel(e.target.value)} className={inputClass} placeholder="After dinner" />
          </div>
          <div>
            <label className={labelClass}>Ends</label>
            <input value={endLabel} onChange={(e) => setEndLabel(e.target.value)} className={inputClass} placeholder="9:30ish" />
          </div>
        </div>
        <p className="text-[11px] text-ink-faint -mt-2">
          Free text on purpose. Camps run on "after dinner", not on timestamps.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>What it's for</label>
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputClass} placeholder="Saturday night song session" />
          </div>
          <div>
            <label className={labelClass}>Expected count</label>
            <input
              value={expectedCount}
              onChange={(e) => setExpectedCount(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric" className={inputClass} placeholder="45"
            />
            {over && (
              <p className="text-[11px] text-amber-text mt-1">
                Over the seated capacity of {cap}. Allowed — the camp decides.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className={labelClass}>Layout</label>
          <div className="flex flex-wrap gap-1.5">
            {LAYOUT_ORDER.map((l) => (
              <button
                key={l} type="button" onClick={() => setLayout(l)}
                className={`text-[12.5px] rounded-pill px-3 py-1.5 border transition-colors ${
                  layout === l ? 'bg-forest text-white border-forest' : 'bg-white border-border text-ink hover:border-sage'
                }`}
              >
                {LAYOUT_LABELS[l]}
              </button>
            ))}
          </div>
          {layout === 'other' && (
            <input value={layoutOther} onChange={(e) => setLayoutOther(e.target.value)} className={`${inputClass} mt-2`} placeholder="Describe the shape" />
          )}
        </div>

        <div>
          <label className={labelClass}>The group's words</label>
          <textarea
            value={setupNotes} onChange={(e) => setSetupNotes(e.target.value)} rows={3}
            className={`${inputClass} resize-y`}
            placeholder="Three benches along the back wall, two tables at the front"
          />
          <p className="text-[11px] text-ink-faint mt-1">
            Goes to the crew verbatim on the work order. Type what the coordinator said, not a
            paraphrase of it.
          </p>
        </div>

        <div>
          <label className={labelClass}>Camp notes</label>
          <textarea
            value={campNotes} onChange={(e) => setCampNotes(e.target.value)} rows={2}
            className={`${inputClass} resize-y`}
            placeholder="Chairs are stacked in the back closet…"
          />
          <p className="text-[11px] text-ink-faint mt-1">Added beside the group's words.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={saving || !locationId || outOfService || !!dup}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Log request'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
