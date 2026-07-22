import { useMemo, useState } from 'react';
import { ShoppingCart, Truck, Check, X, Trash2, Download, Printer, Plus } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { FilterPill } from '@/components/shared/FilterPill';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import {
  formatCurrency, formatQty, formatInStockUnit, ORDER_STATUS_LABELS, tidy,
  orderToCsv, orderToPrintHtml, type ExportOrderLine,
} from '@/lib/commissaryUnits';
import { AlertTriangle } from 'lucide-react';
import type { PurchaseOrder } from '@/lib/types';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-cream-dark text-forest/70 border-border',
  sent: 'bg-amber-bg text-amber-text border-amber/25',
  received: 'bg-green-muted-bg text-green-muted-text border-sage/25',
  cancelled: 'bg-red-bg text-red border-red/20',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium border ${STATUS_STYLES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function OrderCard({ order }: { order: PurchaseOrder }) {
  const {
    linesForOrder, updateOrderLineQty, addOrderLine, removeOrderLine,
    cancelOrder, deleteOrder, openModal, items, vendors,
    setOrderLineVendor, packsForItem,
  } = useCommissaryStore();
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const [addItemId, setAddItemId] = useState('');
  const [addQty, setAddQty] = useState('1');
  const lines = linesForOrder(order.id);
  const editable = order.status === 'draft' && canManage;

  const exportLines: ExportOrderLine[] = lines.map((l) => ({
    itemName: l.itemName, orderQty: l.orderQty, purchaseUnit: l.purchaseUnit,
    unitPrice: l.unitPrice, lineTotal: l.lineTotal,
  }));
  const vendor = order.vendorId ? vendors.find((v) => v.id === order.vendorId) : undefined;
  const exportOrder = {
    vendorName: order.vendorName, accountNumber: vendor?.accountNumber,
    subtotal: order.subtotal, deliveryFee: order.deliveryFee, total: order.total,
    deliveryInstructions: order.deliveryInstructions,
  };
  const dateStamp = new Date().toISOString().slice(0, 10);

  function handlePrint() {
    const html = orderToPrintHtml(exportOrder, exportLines, new Date().toLocaleDateString());
    const w = window.open('', '_blank');
    if (!w) { alert('Enable pop-ups to print this order.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  // Items not already on the order — no point offering a duplicate.
  const onOrderIds = new Set(lines.map((l) => l.itemId));
  const addable = items.filter((i) => !onOrderIds.has(i.id));

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Truck className="w-4 h-4 text-forest/40 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-forest truncate">{order.vendorName}</p>
          <p className="text-[11px] text-forest/45">
            {lines.length} line{lines.length === 1 ? '' : 's'} ·{' '}
            {order.source === 'menu' ? `from week ${order.weekNumber} menu` : 'built by hand / reorder level'}
            {order.sentAt && ` · sent ${new Date(order.sentAt).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex-1" />
        <StatusBadge status={order.status} />
      </div>

      <div className={`grid ${editable ? 'grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]' : 'grid-cols-[2fr_1fr_1fr_1fr_1fr]'} gap-3 px-4 py-2 bg-cream-dark/40 border-b border-border`}>
        {['Item', 'On hand', 'Needed', 'Order', 'Total'].map((h) => (
          <span key={h} className="text-[10px] font-semibold uppercase tracking-widest text-forest/40">{h}</span>
        ))}
        {editable && <span />}
      </div>

      {lines.map((l) => (
        <div key={l.id} className={`grid ${editable ? 'grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]' : 'grid-cols-[2fr_1fr_1fr_1fr_1fr]'} gap-3 px-4 py-2.5 border-b border-border items-center`}>
          {(() => {
            const itemPacks = editable && l.itemId ? packsForItem(l.itemId) : [];
            // Offer a vendor switch only when the item is carried by more than one vendor.
            if (itemPacks.length <= 1) return <span className="text-[13px] text-forest truncate">{l.itemName}</span>;
            const hasCurrent = itemPacks.some((p) => p.vendorId === order.vendorId);
            return (
              <div className="min-w-0">
                <span className="block text-[13px] text-forest truncate">{l.itemName}</span>
                <select value={order.vendorId ?? ''} onChange={(e) => setOrderLineVendor(l.id, e.target.value)}
                  title="Order this line from another vendor"
                  className="mt-0.5 max-w-full text-[10px] text-forest/50 bg-transparent border border-border rounded px-1 py-0.5 focus:outline-none focus:border-sage">
                  {!hasCurrent && order.vendorId && <option value={order.vendorId}>{order.vendorName} (current)</option>}
                  {itemPacks.map((p) => (
                    <option key={p.id} value={p.vendorId}>{vendors.find((v) => v.id === p.vendorId)?.name ?? 'Vendor'}</option>
                  ))}
                </select>
              </div>
            );
          })()}
          <span className="font-mono text-[12px] text-forest/50">
            {formatQty(l.onHandBase / l.purchaseUnitInBase, l.purchaseUnit)}
          </span>
          <span className="font-mono text-[12px] text-forest/50">
            {l.neededBase > 0 ? formatQty(l.neededBase / l.purchaseUnitInBase, l.purchaseUnit) : <span className="text-forest/25">—</span>}
          </span>
          {editable ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number" min="0" step="1" value={l.orderQty}
                onChange={(e) => updateOrderLineQty(l.id, Math.max(0, Number(e.target.value) || 0))}
                className="w-16 font-mono text-[12px] bg-white border border-border rounded-btn px-2 py-1 focus:outline-none focus:border-sage"
              />
              <span className="text-[11px] text-forest/40">{l.purchaseUnit}</span>
            </div>
          ) : (
            <span className="font-mono text-[12px] text-forest font-medium">
              {tidy(l.orderQty).toLocaleString()} {l.purchaseUnit}
            </span>
          )}
          <span className="font-mono text-[12px] text-forest">
            {l.unitPrice == null
              ? <span className="text-forest/25" title="No price set on this item">—</span>
              : formatCurrency(l.lineTotal)}
          </span>
          {editable && (
            <button onClick={() => removeOrderLine(l.id)} className="p-1 text-forest/30 hover:text-red" title="Remove line" aria-label="Remove line">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {lines.length === 0 && (
        <p className="px-4 py-4 text-[12px] text-forest/40 text-center">No items yet — add some below.</p>
      )}

      {/* Add any item */}
      {editable && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-cream-dark/20">
          <Plus className="w-3.5 h-3.5 text-forest/40 flex-shrink-0" />
          <select
            value={addItemId} onChange={(e) => setAddItemId(e.target.value)}
            className="flex-1 min-w-0 text-[12px] bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage"
          >
            <option value="">Add an item…</option>
            {addable.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input
            type="number" min="1" step="1" value={addQty} onChange={(e) => setAddQty(e.target.value)}
            className="w-16 font-mono text-[12px] bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage"
          />
          <Button
            size="sm" variant="ghost"
            disabled={!addItemId || (Number(addQty) || 0) < 1}
            onClick={() => { addOrderLine(order.id, addItemId, Number(addQty) || 1); setAddItemId(''); setAddQty('1'); }}
          >
            Add
          </Button>
        </div>
      )}

      <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
        <div className="text-[12px] text-forest/60">
          Subtotal <span className="font-mono text-forest">{formatCurrency(order.subtotal)}</span>
          {order.deliveryFee > 0 && <> · delivery <span className="font-mono text-forest">{formatCurrency(order.deliveryFee)}</span></>}
        </div>
        <div className="flex-1" />
        <div className="text-[13px] font-semibold text-forest">
          Total <span className="font-mono">{formatCurrency(order.total)}</span>
        </div>
      </div>

      <div className="px-4 pb-3 flex gap-2 justify-end flex-wrap">
        <Button size="sm" variant="ghost" disabled={!lines.length}
                onClick={() => download(`order-${order.vendorName.replace(/\W+/g, '-').toLowerCase()}-${dateStamp}.csv`, orderToCsv(exportOrder, exportLines))}>
          <Download className="w-3.5 h-3.5" /> CSV
        </Button>
        <Button size="sm" variant="ghost" disabled={!lines.length} onClick={handlePrint}>
          <Printer className="w-3.5 h-3.5" /> Print
        </Button>
        <div className="flex-1" />
        {canManage && order.status === 'draft' && (
          <>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm('Delete this draft order?')) deleteOrder(order.id); }}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
            <Button size="sm" disabled={!lines.length} onClick={() => openModal({ kind: 'sendOrder', orderId: order.id })}>
              Send order
            </Button>
          </>
        )}
        {canManage && order.status === 'sent' && (
          <>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm('Cancel this order?')) cancelOrder(order.id); }}>
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={() => openModal({ kind: 'receiveOrder', orderId: order.id })}>
              <Check className="w-3.5 h-3.5" /> Receive
            </Button>
          </>
        )}
      </div>

      {order.status === 'received' && (
        <p className="px-4 pb-3 text-[11px] text-forest/45">
          Received {order.receivedAt ? new Date(order.receivedAt).toLocaleDateString() : ''} — every line was booked into stock and logged.
        </p>
      )}
    </div>
  );
}

export function OrderingTab() {
  const {
    orders, orderSource, setOrderSource, activeWeek, draftOrdersFor,
    createOrdersFromDrafts, createBlankOrder, activeSession, setActiveTab, items, vendors,
    criticalItems, criticalDraftOrders,
  } = useCommissaryStore();
  const { can, currentUser } = useAuth();
  const canManage = can('manageCommissary');
  const session = activeSession();
  const [blankVendorId, setBlankVendorId] = useState('');

  const drafts = useMemo(() => draftOrdersFor(orderSource, activeWeek), [draftOrdersFor, orderSource, activeWeek]);
  // Cheap filter over the subscribed items list; recomputes on each render by design.
  const critical = criticalItems();

  const open = orders.filter((o) => o.status === 'draft' || o.status === 'sent');
  const history = orders.filter((o) => o.status === 'received' || o.status === 'cancelled');

  const suggestedTotal = drafts.reduce((s, d) => s + d.total, 0);
  const missingPrices = items.filter((i) => i.unitPrice == null).length;
  const unassignedDraft = drafts.find((d) => !d.vendorId);

  if (items.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
            <ShoppingCart className="w-7 h-7 text-stone-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">Nothing to order yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed mb-4">
            Add inventory items with a reorder level and a vendor, and this tab will work out
            what you are short and group it into a purchase order per vendor. You can also build
            an order by hand.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setActiveTab('inventory')}>Go to inventory</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Suggested orders" value={drafts.length} hint={orderSource === 'menu' ? `From week ${activeWeek} menu` : 'To reach reorder level'} />
        <StatCard label="Estimated total" value={formatCurrency(suggestedTotal)} hint="Before tax" />
        <StatCard label="Open orders" value={open.length} hint="Draft or sent" variant={open.length > 0 ? 'amber' : 'default'} />
        <StatCard label="Completed" value={history.length} hint="Received or cancelled" />
      </div>

      {/* Critically-low stock — always shown, even when ordering from the menu, because
          a critical item nobody put on this week's menu is exactly what gets forgotten. */}
      {critical.length > 0 && (
        <div className="rounded-card border border-red/25 bg-red-bg px-4 py-3.5 mb-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-body font-medium text-red/90">
                {critical.length} item{critical.length === 1 ? ' is' : 's are'} critically low — under half the reorder level.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {critical.map((i) => (
                  <span key={i.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-tag text-[11px] bg-white/70 border border-red/20 text-red">
                    {i.name}
                    <span className="font-mono opacity-70">{formatInStockUnit(i, i.onHandBase)}</span>
                  </span>
                ))}
              </div>
            </div>
            {canManage && (
              <Button
                size="sm"
                className="whitespace-nowrap"
                onClick={() => {
                  const cd = criticalDraftOrders();
                  if (!cd.length) { alert('These items have no reorder level or vendor set — set those on the inventory item first.'); return; }
                  if (confirm(`Create draft order${cd.length === 1 ? '' : 's'} to restock ${critical.length} critical item${critical.length === 1 ? '' : 's'}?`)) {
                    createOrdersFromDrafts(cd, 'par', currentUser.name || null);
                  }
                }}
              >
                + Restock critical
              </Button>
            )}
          </div>
        </div>
      )}

      {missingPrices > 0 && (
        <AlertBanner variant="warn"
          message={`${missingPrices} item${missingPrices === 1 ? ' has' : 's have'} no price, so ${missingPrices === 1 ? 'its line' : 'their lines'} total $0.00. Set a price on the inventory item.`}
          action={{ label: 'Go to inventory', onClick: () => setActiveTab('inventory') }} />
      )}

      {unassignedDraft && (
        <AlertBanner variant="warn"
          message={`${unassignedDraft.lines.length} item${unassignedDraft.lines.length === 1 ? '' : 's'} needing reorder ${unassignedDraft.lines.length === 1 ? 'has' : 'have'} no vendor. They group into a separate order you cannot send until a vendor is set.`}
          action={{ label: 'Go to inventory', onClick: () => setActiveTab('inventory') }} />
      )}

      {/* Source + build-by-hand */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[12px] text-forest/50 mr-1">Suggest quantities from</span>
        <FilterPill label={session ? `Week ${activeWeek} menu` : 'Menu (no session)'} active={orderSource === 'menu'} onClick={() => setOrderSource('menu')} />
        <FilterPill label="Reorder levels" active={orderSource === 'par'} onClick={() => setOrderSource('par')} />
        <div className="flex-1" />
        {canManage && (
          <>
            <select value={blankVendorId} onChange={(e) => setBlankVendorId(e.target.value)}
                    className="text-[12px] bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage">
              <option value="">No vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <Button size="sm" variant="ghost" onClick={() => createBlankOrder(blankVendorId || null, currentUser.name || null)}>
              + Blank order
            </Button>
            {drafts.length > 0 && (
              <Button size="sm" onClick={() => {
                if (confirm(`Create ${drafts.length} draft order${drafts.length === 1 ? '' : 's'} totalling ${formatCurrency(suggestedTotal)}?`)) {
                  createOrdersFromDrafts(drafts, orderSource, currentUser.name || null);
                }
              }}>
                + Generate {drafts.length} suggested
              </Button>
            )}
          </>
        )}
      </div>

      {orderSource === 'menu' && !session && (
        <p className="text-[12px] text-forest/45 mb-4">
          No session selected, so the menu has no head count to scale from. Switch to reorder levels,
          or create a session on the Menu tab.
        </p>
      )}

      {drafts.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-forest/40 mb-2">Suggested</p>
          <div className="space-y-2">
            {drafts.map((d) => (
              <div key={d.vendorId ?? '__unassigned'} className="bg-white rounded-card border border-border px-4 py-3 flex items-center gap-3">
                <Truck className="w-4 h-4 text-forest/30 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-forest truncate">{d.vendorName}</p>
                  <p className="text-[11px] text-forest/45">
                    {d.lines.length} item{d.lines.length === 1 ? '' : 's'} short
                    {d.deliveryFee > 0 && ` · ${formatCurrency(d.deliveryFee)} delivery`}
                  </p>
                </div>
                <div className="flex-1" />
                <span className="font-mono text-[13px] text-forest">{formatCurrency(d.total)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-forest/40 mt-2">
            "Generate suggested" turns these into editable draft orders — then add, remove or adjust anything.
          </p>
        </div>
      )}

      {drafts.length === 0 && (
        <p className="text-[13px] text-forest/45 mb-6 bg-white rounded-card border border-border px-4 py-6 text-center">
          {orderSource === 'menu'
            ? `Everything week ${activeWeek}'s menu needs is on hand. Build an order by hand above if you want to stock up anyway.`
            : 'Every item is above its reorder level. Build an order by hand above if you want to stock up anyway.'}
        </p>
      )}

      {open.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-forest/40 mb-2">Open orders</p>
          <div className="space-y-3">{open.map((o) => <OrderCard key={o.id} order={o} />)}</div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-forest/40 mb-2">History</p>
          <div className="bg-white rounded-card border border-border overflow-hidden">
            {history.map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                <span className="text-[12px] text-forest/45 w-24 flex-shrink-0">{new Date(o.receivedAt ?? o.updatedAt).toLocaleDateString()}</span>
                <span className="text-[13px] text-forest flex-1 truncate">{o.vendorName}</span>
                <StatusBadge status={o.status} />
                <span className="font-mono text-[12px] text-forest w-24 text-right">{formatCurrency(o.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
