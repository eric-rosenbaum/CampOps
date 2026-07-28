import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { sendEmail, textToHtml } from '@/lib/email';
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
  const { currentCamp } = useCampStore();
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');
  const retreat = retreatById(retreatId);

  const initial = REMINDER_TYPES.find((t) => t.value === reminderType) ?? REMINDER_TYPES[0];
  const [typeValue, setTypeValue] = useState(initial.value);
  const [message, setMessage] = useState(initial.message(retreat));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEmail = !!retreat?.coordinatorEmail;

  function selectType(value: string) {
    setTypeValue(value);
    const t = REMINDER_TYPES.find((x) => x.value === value);
    if (t) setMessage(t.message(retreat));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !message.trim() || busy) return;
    const label = REMINDER_TYPES.find((t) => t.value === typeValue)?.label ?? typeValue;
    setBusy(true); setError(null);

    // Always log the reminder to the retreat's history.
    sendReminder(retreatId, label, message.trim(), currentUser.name || null);

    // Email the coordinator if we have an address.
    if (retreat?.coordinatorEmail) {
      const res = await sendEmail({
        to: retreat.coordinatorEmail,
        subject: `${label} — ${retreat.groupName}`,
        html: textToHtml(message.trim()),
        fromName: currentCamp?.name,
        replyTo: currentUser.email || undefined,
      });
      if (!res.ok) { setError(`${res.error} (The reminder was still logged to history.)`); setBusy(false); return; }
    }
    setBusy(false);
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
          {hasEmail
            ? <>This emails {retreat?.coordinatorName ?? 'the coordinator'} from your camp (replies come back to you) and logs it in the retreat's history.</>
            : <>No coordinator email on file — this will only log the reminder to history. Add an email on the retreat to send it.</>}
        </p>

        {error && <p className="text-[12px] text-red">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!canManage || !message.trim() || busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Sending…' : hasEmail ? 'Send reminder' : 'Log reminder'}
          </Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
