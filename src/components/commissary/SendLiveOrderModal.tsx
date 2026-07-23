import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import { formatCurrency, tidy } from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

/**
 * Send a LIVE reconciled order. The order isn't persisted until this confirm — so it's
 * current by construction and can never have gone stale. Committing writes it straight to
 * a SENT purchase order.
 */
export function SendLiveOrderModal() {
  const { sendDraft, vendors, orderingWindow, sendReconciledOrder, closeModal } = useCommissaryStore();
  const { currentUser } = useAuth();
  const draft = sendDraft;
  const vendor = draft?.vendorId ? vendors.find((v) => v.id === draft.vendorId) : undefined;

  const [instructions, setInstructions] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState(orderingWindow().nextDelivery);
  const [copied, setCopied] = useState(false);

  if (!draft) return null;

  const summary = [
    `Purchase order — ${draft.vendorName}`,
    vendor?.accountNumber ? `Account: ${vendor.accountNumber}` : null,
    '',
    ...draft.lines.map((l) => `${tidy(l.orderQty)} ${l.purchaseUnit} — ${l.itemName}`),
    '',
    `Subtotal: ${formatCurrency(draft.subtotal)}`,
    draft.deliveryFee > 0 ? `Delivery: ${formatCurrency(draft.deliveryFee)}` : null,
    `Total: ${formatCurrency(draft.total)}`,
    instructions.trim() ? `\nDelivery instructions: ${instructions.trim()}` : null,
  ].filter(Boolean).join('\n');

  async function handleCopy() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    sendReconciledOrder(instructions.trim() || null, expectedDelivery || null, currentUser.name || null);
  }

  const belowMinimum = vendor?.minOrder != null && draft.total < vendor.minOrder;

  return (
    <Modal title="Send order" onClose={closeModal} width="560px">
      <form onSubmit={handleSend} className="space-y-4">
        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-3">
          <p className="text-[13px] font-medium text-forest">{draft.vendorName}</p>
          <p className="text-[11px] text-forest/50 mt-0.5">
            {draft.lines.length} line{draft.lines.length === 1 ? '' : 's'} · {formatCurrency(draft.total)}
            {vendor?.orderCutoff && ` · cutoff ${vendor.orderCutoff}`}
          </p>
        </div>

        {belowMinimum && (
          <p className="text-[12px] text-amber-text bg-amber-bg border border-amber/25 rounded-card px-3 py-2">
            This order is below {draft.vendorName}'s {formatCurrency(vendor!.minOrder!)} minimum.
          </p>
        )}
        {!draft.vendorId && (
          <p className="text-[12px] text-red bg-red-bg border border-red/20 rounded-card px-3 py-2">
            These items have no vendor assigned. Set a vendor on each inventory item first.
          </p>
        )}

        <div>
          <label className={labelClass}>Expected delivery</label>
          <input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} className={inputClass} />
          <p className="text-[11px] text-forest/45 mt-1">
            Defaults to the session's next delivery date. Counts as in-transit stock so it isn't re-ordered.
          </p>
        </div>

        <div>
          <label className={labelClass}>Delivery instructions</label>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
                    className={`${inputClass} resize-none`} rows={2} placeholder="e.g. Deliver to kitchen loading dock, ring bell" />
        </div>

        <div>
          <label className={labelClass}>Order summary</label>
          <pre className="text-[11px] font-mono text-forest/70 bg-white border border-border rounded-btn px-3 py-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
            {summary}
          </pre>
          <p className="text-[11px] text-forest/45 mt-1.5">
            Marking sent records it here — it does not email the vendor. Copy this into your own email or read it to your rep.
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={handleCopy}>{copied ? 'Copied' : 'Copy summary'}</Button>
          <div className="flex-1" />
          <Button type="submit" disabled={!draft.vendorId}>Mark as sent</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
