import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { Retreat } from '@/lib/types';
import { inputClass, labelClass, fmtDateFull, fmtRange } from './retreatUi';

interface ReminderType {
  value: string;
  label: string;
  message: (r: Retreat | null) => string;
}

const REMINDER_TYPES: ReminderType[] = [
  {
    value: 'coi',
    label: 'Certificate of insurance (COI)',
    message: (r) =>
      `Hi ${r?.coordinatorName ?? 'there'},\n\nA friendly reminder that we still need your certificate of insurance for ${r?.groupName ?? 'your group'}'s stay (${r ? fmtRange(r.arrivalDate, r.departureDate) : ''}). We require $1M general liability with the camp named as additional insured. Please upload it through your guest portal at your earliest convenience.\n\nThank you!`,
  },
  {
    value: 'housing',
    label: 'Housing submission',
    message: (r) =>
      `Hi ${r?.coordinatorName ?? 'there'},\n\nYour housing section in the guest portal is open. Please submit your cabin/room preferences for ${r?.groupName ?? 'your group'}${r?.housingDeadline ? ` by ${fmtDateFull(r.housingDeadline)}` : ''} so we can finalize your setup.\n\nThanks so much!`,
  },
  {
    value: 'contract',
    label: 'Contract signature',
    message: (r) =>
      `Hi ${r?.coordinatorName ?? 'there'},\n\nWe're still waiting on the signed retreat agreement for ${r?.groupName ?? 'your group'}. Your dates (${r ? fmtRange(r.arrivalDate, r.departureDate) : ''}) can't be fully confirmed until the contract is signed. Please review and sign at your convenience.\n\nThank you!`,
  },
  {
    value: 'deposit',
    label: 'Deposit',
    message: (r) =>
      `Hi ${r?.coordinatorName ?? 'there'},\n\nThis is a reminder that the deposit${r?.depositRequired ? ` of $${r.depositRequired.toLocaleString()}` : ''} for ${r?.groupName ?? 'your group'} is still outstanding. Securing your dates requires the deposit to be received. Please let us know if you have any questions.\n\nThank you!`,
  },
  {
    value: 'headcount',
    label: 'Headcount',
    message: (r) =>
      `Hi ${r?.coordinatorName ?? 'there'},\n\nPlease confirm your final headcount for ${r?.groupName ?? 'your group'}${r?.headcountCutoff ? ` by ${fmtDateFull(r.headcountCutoff)}` : ''}. This lets us finalize meals, housing, and staffing. Current count on file: ${r?.headcount ?? '—'}.\n\nThanks!`,
  },
  {
    value: 'custom',
    label: 'Custom',
    message: () => '',
  },
];

export function SendReminderModal({ retreatId, reminderType }: { retreatId: string; reminderType?: string }) {
  const { retreatById, sendReminder, closeModal } = useRetreatStore();
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');
  const retreat = retreatById(retreatId);

  const initial = REMINDER_TYPES.find((t) => t.value === reminderType) ?? REMINDER_TYPES[0];
  const [typeValue, setTypeValue] = useState(initial.value);
  const [message, setMessage] = useState(initial.message(retreat));

  function selectType(value: string) {
    setTypeValue(value);
    const t = REMINDER_TYPES.find((x) => x.value === value);
    if (t) setMessage(t.message(retreat));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !message.trim()) return;
    const label = REMINDER_TYPES.find((t) => t.value === typeValue)?.label ?? typeValue;
    sendReminder(retreatId, label, message.trim(), currentUser.name || null);
    closeModal();
  }

  return (
    <Modal title={`Send reminder — ${retreat?.groupName ?? 'Retreat'}`} onClose={closeModal} width="520px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Reminder type</label>
          <select value={typeValue} onChange={(e) => selectType(e.target.value)} className={inputClass}>
            {REMINDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8}
                    className={`${inputClass} resize-y`} placeholder="Write your reminder…" />
          {retreat?.coordinatorEmail && (
            <p className="text-[11px] text-forest/45 mt-1">To: {retreat.coordinatorName ? `${retreat.coordinatorName} · ` : ''}{retreat.coordinatorEmail}</p>
          )}
        </div>

        <p className="text-[11px] text-forest/45 leading-relaxed bg-cream-dark/50 border border-border rounded-btn px-3 py-2">
          This logs the reminder in the retreat's history — no email is actually sent. Use it to keep a record of when you followed up.
        </p>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!canManage || !message.trim()}>Send reminder</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
