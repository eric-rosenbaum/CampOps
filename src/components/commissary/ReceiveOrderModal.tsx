import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore, type ReceivingLineInput } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import { formatCurrency, tidy } from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

interface Draft {
  lineId: string;
  itemName: string;
  purchaseUnit: string;
  orderedQty: number;
  receivedQty: string;
  receivedUnitPrice: string;
  note: string;
}

/**
 * Receiving screen: confirm what actually arrived. The RPC books received (not ordered)
 * quantities into stock, and the invoice total feeds per-diem actual spend.
 */
export function ReceiveOrderModal({ orderId }: { orderId: string }) {
  const { orders, linesForOrder, receiveOrderWithActuals, closeModal } = useCommissaryStore();
  const { currentUser } = useAuth();
  const order = orders.find((o) => o.id === orderId);

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    linesForOrder(orderId).map((l) => ({
      lineId: l.id,
      itemName: l.itemName,
      purchaseUnit: l.purchaseUnit,
      orderedQty: l.orderQty,
      receivedQty: String(l.orderQty),
      receivedUnitPrice: l.unitPrice != null ? String(l.unitPrice) : '',
      note: '',
    })),
  );
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [saving, setSaving] = useState(false);

  if (!order) return null;

  function patch(lineId: string, p: Partial<Draft>) {
    setDrafts((d) => d.map((x) => x.lineId === lineId ? { ...x, ...p } : x));
  }

  const invoiceTotal = tidy(drafts.reduce((s, d) => s + (Number(d.receivedUnitPrice) || 0) * (Number(d.receivedQty) || 0), 0));
  const discrepancies = drafts.filter((d) => Number(d.receivedQty) !== d.orderedQty || d.note.trim());

  async function handleReceive() {
    setSaving(true);
    const lines: ReceivingLineInput[] = drafts.map((d) => ({
      lineId: d.lineId,
      receivedQty: Number(d.receivedQty) || 0,
      receivedUnitPrice: d.receivedUnitPrice === '' ? null : Number(d.receivedUnitPrice),
      receivedNote: d.note.trim() || null,
    }));
    const ok = await receiveOrderWithActuals(orderId, lines, invoiceTotal, invoiceNumber.trim() || null, currentUser.name || null);
    setSaving(false);
    if (!ok) { alert('Could not receive this order. It may already have been received.'); return; }
    closeModal();
  }

  return (
    <Modal title={`Receive — ${order.vendorName}`} onClose={closeModal} width="720px">
      <div className="space-y-4">
        <p className="text-[12px] text-forest/55 leading-relaxed">
          Confirm what actually arrived. Received quantities — not ordered — are booked into
          stock, and short or substituted lines are recorded for the vendor conversation.
        </p>

        <div className="rounded-card border border-border overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.4fr] gap-2 px-3 py-2 bg-cream-dark/40 border-b border-border">
            {['Item', 'Ordered', 'Received', 'Unit price', 'Note (sub / short)'].map((h) => (
              <span key={h} className="text-[10px] font-semibold uppercase tracking-widest text-forest/40">{h}</span>
            ))}
          </div>
          {drafts.map((d) => {
            const short = Number(d.receivedQty) < d.orderedQty;
            return (
              <div key={d.lineId} className="grid grid-cols-[2fr_1fr_1fr_1fr_1.4fr] gap-2 px-3 py-2 border-b border-border last:border-0 items-center">
                <span className="text-[12px] text-forest truncate">{d.itemName}</span>
                <span className="font-mono text-[12px] text-forest/50">{d.orderedQty} {d.purchaseUnit}</span>
                <input
                  type="number" min="0" step="any" value={d.receivedQty}
                  onChange={(e) => patch(d.lineId, { receivedQty: e.target.value })}
                  className={`w-full font-mono text-[12px] bg-white border rounded-btn px-2 py-1 focus:outline-none focus:border-sage ${short ? 'border-amber/50' : 'border-border'}`}
                />
                <input
                  type="number" min="0" step="0.01" value={d.receivedUnitPrice}
                  onChange={(e) => patch(d.lineId, { receivedUnitPrice: e.target.value })}
                  className="w-full font-mono text-[12px] bg-white border border-border rounded-btn px-2 py-1 focus:outline-none focus:border-sage" placeholder="—"
                />
                <input
                  value={d.note} onChange={(e) => patch(d.lineId, { note: e.target.value })}
                  className="w-full text-[12px] bg-white border border-border rounded-btn px-2 py-1 focus:outline-none focus:border-sage" placeholder="optional"
                />
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Invoice number</label>
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputClass} placeholder="optional" />
          </div>
          <div>
            <label className={labelClass}>Invoice total</label>
            <div className="flex items-center h-[38px] px-3 font-mono text-[14px] text-forest bg-cream-dark/40 border border-border rounded-btn">
              {formatCurrency(invoiceTotal)}
            </div>
          </div>
        </div>

        {discrepancies.length > 0 && (
          <p className="text-[12px] text-amber-text bg-amber-bg border border-amber/25 rounded-card px-3 py-2">
            {discrepancies.length} line{discrepancies.length === 1 ? '' : 's'} differ from the order (short, over, or noted).
            Only the received quantities are booked into stock.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button className="flex-1 justify-center" onClick={handleReceive} disabled={saving}>
            {saving ? 'Receiving…' : 'Confirm & book into stock'}
          </Button>
          <Button variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
