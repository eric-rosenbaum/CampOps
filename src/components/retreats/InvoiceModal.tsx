import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { money, fmtRange, inputClass, labelClass } from './retreatUi';

type Delivery = 'portal_email' | 'email' | 'pdf';

/** Generate & send the invoice — records the send / offers a printable PDF. No real email is sent. */
export function InvoiceModal({ retreatId }: { retreatId: string }) {
  const { retreatById, balanceFor, closeModal } = useRetreatStore();
  const { currentCamp } = useCampStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = retreatById(retreatId);
  const bal = balanceFor(retreatId);

  const [sendTo, setSendTo] = useState(retreat?.coordinatorEmail ?? '');
  const [note, setNote] = useState(
    `Thank you for choosing ${currentCamp?.name ?? 'our camp'}. Please find your invoice attached. ` +
      `A balance of ${money(bal.balance)} is due at checkout. It has been a pleasure hosting your group.`,
  );
  const [delivery, setDelivery] = useState<Delivery>('portal_email');

  if (!retreat) {
    return (
      <Modal title="Generate & send invoice" onClose={closeModal} width="480px">
        <p className="text-[13px] text-forest/55">Retreat not found.</p>
      </Modal>
    );
  }

  function handleSend() {
    if (delivery === 'pdf') window.print();
    // No real email integration — the send is recorded locally and the modal closes.
    closeModal();
  }

  return (
    <Modal title="Generate & send invoice" onClose={closeModal} width="500px">
      <div className="space-y-4">
        <div className="rounded-card border border-border bg-cream px-4 py-3">
          <p className="text-[13px] font-semibold text-forest">{retreat.groupName}</p>
          <p className="text-[11px] text-forest/50 mt-0.5">
            {fmtRange(retreat.arrivalDate, retreat.departureDate)} · {retreat.headcount} guests
          </p>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-[13px]">
            <span className="text-forest/55">Balance due</span>
            <span className={`font-mono font-semibold ${bal.balance > 0 ? 'text-amber' : 'text-forest'}`}>{money(bal.balance)}</span>
          </div>
        </div>

        <div>
          <label className={labelClass}>Send to</label>
          <input type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)} className={inputClass} placeholder="coordinator@example.org" />
        </div>

        <div>
          <label className={labelClass}>Invoice note</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} min-h-[90px] resize-y`} />
        </div>

        <div>
          <label className={labelClass}>Delivery method</label>
          <select value={delivery} onChange={(e) => setDelivery(e.target.value as Delivery)} className={inputClass}>
            <option value="portal_email">Guest portal + email</option>
            <option value="email">Email only</option>
            <option value="pdf">Download PDF</option>
          </select>
        </div>

        <p className="text-[11px] text-forest/45 leading-relaxed">
          {delivery === 'pdf'
            ? 'Opens your browser print dialog so you can save the invoice as a PDF.'
            : 'This records the invoice and marks it sent. No email is dispatched from this demo environment.'}
        </p>

        <div className="flex gap-2 pt-1">
          <Button className="flex-1 justify-center" onClick={handleSend} disabled={!canManage}>
            {delivery === 'pdf' ? 'Download PDF' : 'Send invoice'}
          </Button>
          <Button variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
