import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { Retreat, RetreatStatus, RetreatPricingModel } from '@/lib/types';
import { inputClass, labelClass, GROUP_TYPE_OPTIONS, STATUS_LABELS, PRICING_MODEL_OPTIONS } from './retreatUi';

const STATUS_ORDER: RetreatStatus[] = ['inquiry', 'confirmed', 'ready', 'active', 'complete', 'cancelled'];

/** Add days to a YYYY-MM-DD date. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function RetreatFormModal({ retreatId }: { retreatId?: string }) {
  const { retreatById, addRetreat, updateRetreat, deleteRetreat, closeModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const existing = retreatId ? retreatById(retreatId) : null;
  const editing = !!existing;

  const [groupName, setGroupName] = useState(existing?.groupName ?? '');
  const [groupType, setGroupType] = useState(existing?.groupType ?? '');
  const [arrivalDate, setArrivalDate] = useState(existing?.arrivalDate ?? '');
  const [departureDate, setDepartureDate] = useState(existing?.departureDate ?? '');
  const [headcount, setHeadcount] = useState(existing ? String(existing.headcount) : '');
  const [pricingModel, setPricingModel] = useState<RetreatPricingModel>(existing?.pricingModel ?? 'per_person_night');
  const [rate, setRate] = useState(existing?.ratePerPersonNight != null ? String(existing.ratePerPersonNight) : '');
  const [flatRate, setFlatRate] = useState(existing?.flatRate != null ? String(existing.flatRate) : '');
  const [deposit, setDeposit] = useState(existing?.depositRequired != null ? String(existing.depositRequired) : '');
  const [depositDue, setDepositDue] = useState(existing?.depositDue ?? '');
  const [coordName, setCoordName] = useState(existing?.coordinatorName ?? '');
  const [coordEmail, setCoordEmail] = useState(existing?.coordinatorEmail ?? '');
  const [coordPhone, setCoordPhone] = useState(existing?.coordinatorPhone ?? '');
  const [housingDeadline, setHousingDeadline] = useState(existing?.housingDeadline ?? '');
  const [headcountCutoff, setHeadcountCutoff] = useState(existing?.headcountCutoff ?? '');
  const [status, setStatus] = useState<RetreatStatus>(existing?.status ?? 'confirmed');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const valid = groupName.trim() && groupType && arrivalDate && departureDate && Number(headcount) > 0 && departureDate >= arrivalDate;

  // Final-headcount confirmation defaults to two weeks before arrival; the camp can override.
  const defaultHeadcountCutoff = arrivalDate ? addDays(arrivalDate, -14) : '';
  const effectiveHeadcountCutoff = headcountCutoff || defaultHeadcountCutoff;

  const perPerson = pricingModel === 'per_person_night';
  const rateValue = perPerson ? rate : flatRate;
  const setRateValue = perPerson ? setRate : setFlatRate;
  const rateLabel = perPerson ? 'Rate ($/person/night)'
    : pricingModel === 'per_cabin_night' ? 'Rate ($/cabin/night)'
    : 'Flat facility fee ($ total)';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !canManage) return;
    const now = new Date().toISOString();

    if (editing && existing) {
      const updated: Retreat = {
        ...existing,
        groupName: groupName.trim(),
        groupType,
        arrivalDate,
        departureDate,
        headcount: Number(headcount),
        pricingModel,
        ratePerPersonNight: rate ? Number(rate) : null,
        flatRate: flatRate ? Number(flatRate) : null,
        depositRequired: deposit ? Number(deposit) : null,
        depositDue: depositDue || null,
        coordinatorName: coordName.trim() || null,
        coordinatorEmail: coordEmail.trim() || null,
        coordinatorPhone: coordPhone.trim() || null,
        housingDeadline: housingDeadline || null,
        headcountCutoff: effectiveHeadcountCutoff || null,
        status,
        notes: notes.trim() || null,
        updatedAt: now,
      };
      updateRetreat(updated);
    } else {
      const r: Retreat = {
        id: generateId(),
        campId: '',
        groupName: groupName.trim(),
        groupType,
        arrivalDate,
        departureDate,
        headcount: Number(headcount),
        pricingModel,
        ratePerPersonNight: rate ? Number(rate) : null,
        flatRate: flatRate ? Number(flatRate) : null,
        depositRequired: deposit ? Number(deposit) : null,
        depositReceived: null,
        depositDue: depositDue || null,
        coordinatorName: coordName.trim() || null,
        coordinatorEmail: coordEmail.trim() || null,
        coordinatorPhone: coordPhone.trim() || null,
        status: 'confirmed',
        housingDeadline: housingDeadline || null,
        headcountCutoff: effectiveHeadcountCutoff || null,
        finalHeadcount: null,
        finalHeadcountAt: null,
        finalHeadcountBy: null,
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

  function handleDelete() {
    if (!existing || !canManage) return;
    if (!window.confirm(`Delete “${existing.groupName}”? This removes the retreat and all its records.`)) return;
    deleteRetreat(existing.id);
    closeModal();
  }

  return (
    <Modal title={editing ? 'Edit retreat' : 'New retreat'} onClose={closeModal} width="560px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Group name</label>
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} className={inputClass} placeholder="e.g. Congregation Beth Shalom Shabbaton" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Arrival</label>
            <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Departure</label>
            <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Pricing model</label>
          <select value={pricingModel} onChange={(e) => setPricingModel(e.target.value as RetreatPricingModel)} className={inputClass}>
            {PRICING_MODEL_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{rateLabel}</label>
            <input type="number" min="0" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} className={inputClass} placeholder="0.00" />
          </div>
          <div>
            <label className={labelClass}>Deposit required ($)</label>
            <input type="number" min="0" step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} className={inputClass} placeholder="0.00" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Deposit due</label>
            <input type="date" value={depositDue} onChange={(e) => setDepositDue(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-forest/40 mt-1">Shown in the guest portal — paying the deposit holds their dates.</p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Coordinator name</label>
          <input value={coordName} onChange={(e) => setCoordName(e.target.value)} className={inputClass} placeholder="e.g. Rachel Green" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Coordinator email</label>
            <input type="email" value={coordEmail} onChange={(e) => setCoordEmail(e.target.value)} className={inputClass} placeholder="name@org.com" />
          </div>
          <div>
            <label className={labelClass}>Coordinator phone</label>
            <input value={coordPhone} onChange={(e) => setCoordPhone(e.target.value)} className={inputClass} placeholder="914-555-0182" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Housing deadline</label>
            <input type="date" value={housingDeadline} onChange={(e) => setHousingDeadline(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-forest/40 mt-1">Portal default: 1 week before arrival.</p>
          </div>
          <div>
            <label className={labelClass}>Final headcount due</label>
            <input type="date" value={effectiveHeadcountCutoff} onChange={(e) => setHeadcountCutoff(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-forest/40 mt-1">When the group confirms their final number — defaults to 2 weeks before arrival.</p>
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
            <Button type="button" variant="danger" onClick={handleDelete} disabled={!canManage}>Delete</Button>
          ) : (
            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
