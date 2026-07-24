import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatPayment, RetreatPaymentKind } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { money, fmtDateFull, inputClass, labelClass } from './retreatUi';

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const KIND_LABELS: Record<RetreatPaymentKind, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  payment: 'Payment',
};

/** Record a payment against a retreat and review / delete existing ones. */
export function PaymentModal({ retreatId }: { retreatId: string }) {
  const { paymentsFor, addPayment, deletePayment, balanceFor, closeModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const payments = paymentsFor(retreatId).slice().sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  const bal = balanceFor(retreatId);

  const [paidOn, setPaidOn] = useState(today());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [kind, setKind] = useState<RetreatPaymentKind>('payment');
  const [note, setNote] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    const amt = Number(amount);
    if (!paidOn || !Number.isFinite(amt) || amt <= 0) return;
    const row: RetreatPayment = {
      id: generateId(),
      campId: '',
      retreatId,
      paidOn,
      amount: amt,
      method: method.trim() || null,
      kind,
      note: note.trim() || null,
      createdAt: now(),
    };
    addPayment(row);
    setAmount('');
    setNote('');
  }

  return (
    <Modal title="Payments" onClose={closeModal} width="500px">
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-card border border-border bg-cream px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-forest/45 font-semibold">Charged</p>
            <p className="font-mono text-[15px] text-forest mt-0.5">{money(bal.totalCharges)}</p>
          </div>
          <div className="rounded-card border border-border bg-cream px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-forest/45 font-semibold">Paid</p>
            <p className="font-mono text-[15px] text-green-muted-text mt-0.5">{money(bal.totalPaid)}</p>
          </div>
          <div className="rounded-card border border-border bg-cream px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-forest/45 font-semibold">Balance</p>
            <p className={`font-mono text-[15px] mt-0.5 ${bal.balance > 0 ? 'text-amber' : 'text-forest'}`}>{money(bal.balance)}</p>
          </div>
        </div>

        {canManage && (
          <form onSubmit={handleSubmit} className="space-y-3 border-t border-border pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-forest/40">Record a payment</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Paid on</label>
                <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Amount ($)</label>
                <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Kind</label>
                <select value={kind} onChange={(e) => setKind(e.target.value as RetreatPaymentKind)} className={inputClass}>
                  <option value="deposit">Deposit</option>
                  <option value="balance">Balance</option>
                  <option value="payment">Payment</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Method</label>
                <input value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass} placeholder="e.g. Check #4421" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Note</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="Optional" />
            </div>
            <Button type="submit" className="justify-center" disabled={!amount}>+ Record payment</Button>
          </form>
        )}

        <div className="border-t border-border pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-forest/40 mb-2">
            {payments.length} payment{payments.length === 1 ? '' : 's'} on file
          </p>
          {payments.length === 0 ? (
            <p className="text-[13px] text-forest/45 bg-cream rounded-card px-4 py-5 text-center">
              No payments recorded yet.
            </p>
          ) : (
            <div className="rounded-card border border-border overflow-hidden">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                  <span className="text-[12px] font-mono text-forest/50 w-24 flex-shrink-0">{fmtDateFull(p.paidOn)}</span>
                  <span className="text-[11px] text-forest/60 w-16 flex-shrink-0">{KIND_LABELS[p.kind]}</span>
                  <span className="text-[12px] text-forest/70 flex-1 truncate">{p.method ?? p.note ?? '—'}</span>
                  <span className="font-mono text-[13px] text-green-muted-text">{money(p.amount)}</span>
                  {canManage && (
                    <button onClick={() => { if (confirm('Delete this payment?')) deletePayment(p.id); }} className="p-1 text-forest/30 hover:text-red" aria-label="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
