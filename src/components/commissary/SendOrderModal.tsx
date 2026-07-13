import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { formatCurrency, tidy } from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

/**
 * Marks the order sent and records delivery instructions. It does NOT transmit
 * anything to the vendor — there is no email or EDI integration. The copyable summary
 * is what a manager actually pastes into an email or reads down the phone, and saying
 * so plainly beats implying an integration that does not exist.
 */
export function SendOrderModal({ orderId }: { orderId: string }) {
  const { orders, linesForOrder, vendors, sendOrder, closeModal } = useCommissaryStore();
  const order = orders.find((o) => o.id === orderId);
  const [instructions, setInstructions] = useState(order?.deliveryInstructions ?? '');
  const [copied, setCopied] = useState(false);

  if (!order) return null;
  const lines = linesForOrder(orderId);
  const vendor = order.vendorId ? vendors.find((v) => v.id === order.vendorId) : undefined;

  const summary = [
    `Purchase order — ${order.vendorName}`,
    vendor?.accountNumber ? `Account: ${vendor.accountNumber}` : null,
    '',
    ...lines.map((l) => `${tidy(l.orderQty)} ${l.purchaseUnit} — ${l.itemName}`),
    '',
    `Subtotal: ${formatCurrency(order.subtotal)}`,
    order.deliveryFee > 0 ? `Delivery: ${formatCurrency(order.deliveryFee)}` : null,
    `Total: ${formatCurrency(order.total)}`,
    instructions.trim() ? `\nDelivery instructions: ${instructions.trim()}` : null,
  ].filter(Boolean).join('\n');

  async function handleCopy() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    sendOrder(orderId, instructions.trim() || null);
    closeModal();
  }

  const belowMinimum = vendor?.minOrder != null && order.total < vendor.minOrder;

  return (
    <Modal title="Send purchase order" onClose={closeModal} width="560px">
      <form onSubmit={handleSend} className="space-y-4">
        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-3">
          <p className="text-[13px] font-medium text-forest">{order.vendorName}</p>
          <p className="text-[11px] text-forest/50 mt-0.5">
            {lines.length} line{lines.length === 1 ? '' : 's'} · {formatCurrency(order.total)}
            {vendor?.orderCutoff && ` · cutoff ${vendor.orderCutoff}`}
          </p>
        </div>

        {belowMinimum && (
          <p className="text-[12px] text-amber-text bg-amber-bg border border-amber/25 rounded-card px-3 py-2">
            This order is below {order.vendorName}'s {formatCurrency(vendor!.minOrder!)} minimum.
          </p>
        )}

        {!order.vendorId && (
          <p className="text-[12px] text-red bg-red-bg border border-red/20 rounded-card px-3 py-2">
            These items have no vendor assigned. Set a vendor on each inventory item first.
          </p>
        )}

        <div>
          <label className={labelClass}>Delivery instructions</label>
          <textarea
            value={instructions} onChange={(e) => setInstructions(e.target.value)}
            className={`${inputClass} resize-none`} rows={2}
            placeholder="e.g. Deliver to kitchen loading dock, ring bell"
          />
        </div>

        <div>
          <label className={labelClass}>Order summary</label>
          <pre className="text-[11px] font-mono text-forest/70 bg-white border border-border rounded-btn px-3 py-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
            {summary}
          </pre>
          <p className="text-[11px] text-forest/45 mt-1.5">
            Marking an order sent records it here — it does not email the vendor. Copy this
            summary into your own email or read it to your rep.
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy summary'}
          </Button>
          <div className="flex-1" />
          <Button type="submit" disabled={!order.vendorId}>Mark as sent</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
