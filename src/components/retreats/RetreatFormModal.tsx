import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useAuth } from '@/lib/auth';
import { generateId, todayStr } from '@/lib/utils';
import type { Retreat, RetreatStatus, RetreatPricingModel } from '@/lib/types';
import { inputClass, labelClass, GROUP_TYPE_OPTIONS, STATUS_LABELS, PRICING_MODEL_OPTIONS, fieldClass } from './retreatUi';
import { isValidEmail } from '@/lib/email';

const STATUS_ORDER: RetreatStatus[] = ['inquiry', 'confirmed', 'ready', 'active', 'complete', 'cancelled'];

/** Add days to a YYYY-MM-DD date. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function RetreatFormModal({ retreatId }: { retreatId?: string }) {
  const currentCamp = useCampStore((s) => s.currentCamp);
  const { retreatById, addRetreat, updateRetreat, deleteRetreat, closeModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const existing = retreatId ? retreatById(retreatId) : null;
  const editing = !!existing;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [alsoWorkOrders, setAlsoWorkOrders] = useState(true);
  // Set-ups, strikes and turnovers this booking generated. They outlive it unless taken too,
  // because issues.retreat_id is ON DELETE SET NULL.
  const retreatWorkOrders = useIssuesStore(
    (s) => s.issues.filter((i) => i.retreatId === retreatId).length);

  const [groupName, setGroupName] = useState(existing?.groupName ?? '');
  const [groupType, setGroupType] = useState(existing?.groupType ?? '');
  const [arrivalDate, setArrivalDate] = useState(existing?.arrivalDate ?? '');
  const [departureDate, setDepartureDate] = useState(existing?.departureDate ?? '');
  const [arrivalTime, setArrivalTime] = useState(existing?.arrivalTime?.slice(0, 5) ?? '');
  const [departureTime, setDepartureTime] = useState(existing?.departureTime?.slice(0, 5) ?? '');
  const [headcount, setHeadcount] = useState(existing ? String(existing.headcount) : '');
  // A new booking starts on the camp's own rate card rather than empty, which is what made
  // every fresh proposal quote zero.
  const [pricingModel, setPricingModel] = useState<RetreatPricingModel>(
    existing?.pricingModel
    ?? (currentCamp?.defaultPricingModel as RetreatPricingModel | undefined)
    ?? 'per_person_night');
  const [rate, setRate] = useState(() => {
    const v = existing?.ratePerPersonNight ?? (existing ? null : currentCamp?.defaultRatePerPersonNight);
    return v != null ? String(v) : '';
  });
  const [flatRate, setFlatRate] = useState(existing?.flatRate != null ? String(existing.flatRate) : '');
  const [deposit, setDeposit] = useState(existing?.depositRequired != null ? String(existing.depositRequired) : '');
  const [depositDue, setDepositDue] = useState(existing?.depositDue ?? '');
  const [coordName, setCoordName] = useState(existing?.coordinatorName ?? '');
  const [coordEmail, setCoordEmail] = useState(existing?.coordinatorEmail ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [coordPhone, setCoordPhone] = useState(existing?.coordinatorPhone ?? '');
  const [housingDeadline, setHousingDeadline] = useState(existing?.housingDeadline ?? '');
  const [headcountCutoff, setHeadcountCutoff] = useState(existing?.headcountCutoff ?? '');
  const [status, setStatus] = useState<RetreatStatus>(existing?.status ?? 'confirmed');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const valid = groupName.trim() && groupType && arrivalDate && departureDate && Number(headcount) > 0 && departureDate >= arrivalDate;

  /**
   * The deadlines the reminder emails are anchored to.
   *
   * Every one of these was optional, and camps left them all blank -- so the agreement, deposit
   * and rooming reminders were written, wired up, and never queued once, because each waits on a
   * date nobody filled in. The reminders that DID fire were the two anchored to the arrival date.
   *
   * So they default, visibly, in this form: the camp sees the date, can change it, and the email
   * that eventually goes out quotes a deadline the camp actually agreed to rather than one the
   * platform invented behind them.
   *
   * Floored at today, because a group booked four days out cannot have a deadline three weeks
   * ago -- that would either be nonsense on screen or a reminder that fires the instant it is
   * created.
   */
  const deadlineBefore = (days: number) => {
    if (!arrivalDate) return '';
    const derived = addDays(arrivalDate, -days);
    return derived < todayStr() ? todayStr() : derived;
  };
  const defaultHeadcountCutoff = deadlineBefore(14);
  const defaultHousingDeadline = deadlineBefore(14);
  const defaultDepositDue = deadlineBefore(30);
  const effectiveHeadcountCutoff = headcountCutoff || defaultHeadcountCutoff;
  const effectiveHousingDeadline = housingDeadline || defaultHousingDeadline;
  const effectiveDepositDue = depositDue || defaultDepositDue;

  const perPerson = pricingModel === 'per_person_night';
  const rateValue = perPerson ? rate : flatRate;
  const setRateValue = perPerson ? setRate : setFlatRate;
  const rateLabel = perPerson ? 'Rate ($/person/night)'
    : pricingModel === 'per_cabin_night' ? 'Rate ($/cabin/night)'
    : 'Flat facility fee ($ total)';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !canManage) return;
    // This address is where every reminder, proposal and portal code goes. A typo here is
    // silent until the day someone needs it to work.
    if (coordEmail.trim() && !isValidEmail(coordEmail)) {
      setEmailError('That does not look like an email address — check for a missing dot.');
      return;
    }
    setEmailError(null);
    const now = new Date().toISOString();

    if (editing && existing) {
      const updated: Retreat = {
        ...existing,
        groupName: groupName.trim(),
        groupType,
        arrivalDate,
        departureDate,
        arrivalTime: arrivalTime || null,
        departureTime: departureTime || null,
        headcount: Number(headcount),
        pricingModel,
        ratePerPersonNight: rate ? Number(rate) : null,
        flatRate: flatRate ? Number(flatRate) : null,
        depositRequired: deposit ? Number(deposit) : null,
        depositDue: effectiveDepositDue || null,
        coordinatorName: coordName.trim() || null,
        coordinatorEmail: coordEmail.trim() || null,
        coordinatorPhone: coordPhone.trim() || null,
        housingDeadline: effectiveHousingDeadline || null,
        headcountCutoff: effectiveHeadcountCutoff || null,
        status,
        notes: notes.trim() || null,
        updatedAt: now,
      };
      updateRetreat(updated);
    } else {
      const r: Retreat = {
        // A retreat created from this form is a real booking, not a lead. Enquiries come in
        // through the pipeline (or the intake paste) and start at 'new'.
        leadStage: 'won', leadSource: null, lostReason: null,
        nextAction: null, nextActionOn: null, ownerId: null,
        estimatedValue: null, dateFlexibility: null, intakeNotes: null,
        id: generateId(),
        campId: '',
        groupName: groupName.trim(),
        groupType,
        arrivalDate,
        departureDate,
        arrivalTime: arrivalTime || null,
        departureTime: departureTime || null,
        headcount: Number(headcount),
        pricingModel,
        ratePerPersonNight: rate ? Number(rate) : null,
        flatRate: flatRate ? Number(flatRate) : null,
        depositRequired: deposit ? Number(deposit) : null,
        depositReceived: null,
        depositDue: effectiveDepositDue || null,
        coordinatorName: coordName.trim() || null,
        coordinatorEmail: coordEmail.trim() || null,
        coordinatorPhone: coordPhone.trim() || null,
        status: 'confirmed',
        housingDeadline: effectiveHousingDeadline || null,
        headcountCutoff: effectiveHeadcountCutoff || null,
        finalHeadcount: null,
        finalHeadcountAt: null,
        finalHeadcountBy: null,
        housingSubmittedAt: null,
        housingSubmittedBy: null,
        dietaryFlags: null,
        notes: notes.trim() || null,
        portalToken: generateId() + generateId(),
        menuPublished: false,
        changeRequestsEnabled: true,
        feedbackOpens: null,
        createdAt: now,
        updatedAt: now,
      };
      addRetreat(r);
    }
    closeModal();
  }

  function confirmDelete() {
    if (!existing || !canManage) return;
    deleteRetreat(existing.id, alsoWorkOrders);
    closeModal();
  }

  return (
    <Modal title={editing ? 'Edit retreat' : 'New retreat'} onClose={closeModal} width="560px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Group name</label>
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} className={inputClass} placeholder="e.g. Congregation Beth Shalom Shabbaton" autoFocus />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Group type</label>
            <select value={groupType} onChange={(e) => setGroupType(e.target.value)} className={inputClass}>
              <option value="" disabled>Select…</option>
              {GROUP_TYPE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Headcount</label>
            <input type="number" min="1" value={headcount} onChange={(e) => setHeadcount(e.target.value)} className={inputClass} placeholder="0" />
          </div>
        </div>

        {/* Time beside date. "They get in at 7pm Wednesday" decides whether dinner is cooked that
            night and whether the cabins have to be ready by lunchtime -- it used to live in
            somebody's head. Blank still means "some time that day", which is a real answer.
            Each pair on its own row: a date input and a time input have genuine intrinsic widths
            and will not share a half-width column without overflowing it. */}
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Arrival</label>
            <div className="flex min-w-0 gap-2">
              <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)}
                     className={`${fieldClass} min-w-0 flex-1`} />
              <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)}
                     disabled={!arrivalDate} aria-label="Arrival time"
                     className={`${fieldClass} w-28 flex-none disabled:opacity-50`} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Departure</label>
            <div className="flex min-w-0 gap-2">
              <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)}
                     className={`${fieldClass} min-w-0 flex-1`} />
              <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)}
                     disabled={!departureDate} aria-label="Departure time"
                     className={`${fieldClass} w-28 flex-none disabled:opacity-50`} />
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>Pricing model</label>
          <select value={pricingModel} onChange={(e) => setPricingModel(e.target.value as RetreatPricingModel)} className={inputClass}>
            {PRICING_MODEL_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{rateLabel}</label>
            <input type="number" min="0" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} className={inputClass} placeholder="0.00" />
          </div>
          <div>
            <label className={labelClass}>Deposit required ($)</label>
            <input type="number" min="0" step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} className={inputClass} placeholder="0.00" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Deposit due</label>
            <input type="date" value={depositDue} onChange={(e) => setDepositDue(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-ink-faint mt-1">Shown in the guest portal, paying the deposit holds their dates.</p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Coordinator name</label>
          <input value={coordName} onChange={(e) => setCoordName(e.target.value)} className={inputClass} placeholder="e.g. Rachel Green" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Coordinator email</label>
            <input
              type="email" value={coordEmail}
              onChange={(e) => { setCoordEmail(e.target.value); setEmailError(null); }}
              className={`${inputClass} ${emailError ? 'border-red' : ''}`} placeholder="name@org.com"
            />
            {emailError && <p className="text-[11.5px] text-red mt-1">{emailError}</p>}
          </div>
          <div>
            <label className={labelClass}>Coordinator phone</label>
            <input value={coordPhone} onChange={(e) => setCoordPhone(e.target.value)} className={inputClass} placeholder="914-555-0182" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Housing deadline</label>
            <input type="date" value={housingDeadline} onChange={(e) => setHousingDeadline(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-ink-faint mt-1">Portal default: 1 week before arrival.</p>
          </div>
          <div>
            <label className={labelClass}>Final headcount due</label>
            <input type="date" value={effectiveHeadcountCutoff} onChange={(e) => setHeadcountCutoff(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-ink-faint mt-1">When the group confirms their final number, defaults to 2 weeks before arrival.</p>
          </div>
          {editing && (
            <div>
              <label className={labelClass}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as RetreatStatus)} className={inputClass}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} min-h-[70px] resize-y`} placeholder="Anything the ops team should know…" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!valid || !canManage}>
            {editing ? 'Save changes' : 'Create retreat'}
          </Button>
          {editing ? (
            <Button type="button" variant="danger" onClick={() => setConfirmingDelete(true)} disabled={!canManage}>Delete</Button>
          ) : (
            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
          )}
        </div>
      </form>
      {confirmingDelete && existing && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-card border border-border bg-white p-5 shadow-lg">
            <h3 className="font-display text-[16px] font-bold text-forest">
              Delete “{existing.groupName}”?
            </h3>
            <p className="mt-1.5 text-[13px] text-ink-soft">
              The booking, its rooming, documents, invoices and requests all go.
            </p>

            {retreatWorkOrders > 0 && (
              <label className="mt-3 flex items-start gap-2.5 rounded-card border border-border bg-cream px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoWorkOrders}
                  onChange={(e) => setAlsoWorkOrders(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[13px] text-ink">
                  Also delete the {retreatWorkOrders} work order{retreatWorkOrders === 1 ? '' : 's'} for this group
                  <span className="block text-[12px] text-ink-soft mt-0.5">
                    Set-ups, strikes and turnovers. Unticked, they stay on the board with no group.
                  </span>
                </span>
              </label>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}

    </Modal>
  );
}
