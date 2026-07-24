import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { FilterPill } from '@/components/shared/FilterPill';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import type { Retreat } from '@/lib/types';
import { money, fmtDate, fmtDateFull, fmtRange } from './retreatUi';

export function RetreatCostsTab() {
  const {
    retreats, selectedRetreat, setActiveRetreat, costsFor, chargesFor, paymentsFor,
    balanceFor, openModal,
  } = useRetreatStore();
  const { currentCamp } = useCampStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = selectedRetreat();

  if (retreats.length === 0 || !retreat) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="max-w-md mx-auto text-center mt-24">
          <p className="text-[15px] font-semibold text-forest">No retreats yet</p>
          <p className="text-[13px] text-forest/55 mt-2 leading-relaxed">
            Costs, charges, and invoices appear here once you create a retreat.
          </p>
        </div>
      </div>
    );
  }

  const costs = costsFor(retreat.id);
  const charges = chargesFor(retreat.id);
  const payments = paymentsFor(retreat.id).slice().sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  const bal = balanceFor(retreat.id);

  const totalCost = costs.reduce((s, c) => s + (c.actual ?? c.budgeted), 0);
  const totalBudgeted = costs.reduce((s, c) => s + c.budgeted, 0);
  const totalActual = costs.reduce((s, c) => s + (c.actual ?? 0), 0);
  const revenue = bal.totalCharges;
  const net = revenue - totalCost;
  const margin = revenue > 0 ? Math.round((net / revenue) * 100) : 0;

  const campName = currentCamp?.name ?? 'Pinecrest Summer Camp';
  const invoiceNo = `RET-${retreat.arrivalDate.slice(0, 4)}-${retreat.id.slice(0, 4).toUpperCase()}`;

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      {/* Pill bar of retreats */}
      <div className="flex gap-2 flex-wrap mb-4">
        {retreats.map((r) => (
          <FilterPill
            key={r.id}
            label={pillLabel(r)}
            active={r.id === retreat.id}
            onClick={() => setActiveRetreat(r.id)}
          />
        ))}
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <StatCard label="Revenue" value={money(revenue)} variant={revenue > 0 ? 'green' : 'default'} hint={`${charges.length} charge${charges.length === 1 ? '' : 's'} billed`} />
        <StatCard label="Total cost" value={money(totalCost)} variant={totalCost > 0 ? 'red' : 'default'} hint="Actual where set, else budgeted" />
        <StatCard label="Gross margin" value={revenue > 0 ? `${margin}%` : '—'} variant={revenue > 0 && net > 0 ? 'green' : revenue > 0 && net < 0 ? 'red' : 'default'} hint={revenue > 0 ? `${money(net)} net` : 'No revenue yet'} />
        <StatCard label="Balance due" value={money(bal.balance)} variant={bal.balance > 0 ? 'amber' : 'default'} hint={bal.balance > 0 ? 'Outstanding' : 'Paid in full'} />
      </div>

      {/* Cost grid: breakdown + revenue/payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Cost breakdown */}
        <div className="bg-white rounded-card border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-cream-dark border-b border-border">
            <p className="text-[13px] font-semibold text-forest">Cost breakdown</p>
            {canManage && (
              <button onClick={() => openModal({ kind: 'cost', retreatId: retreat.id })} className="text-[12px] font-medium text-forest/60 hover:text-forest">+ Add cost</button>
            )}
          </div>
          <div className="grid grid-cols-3 px-4 py-2.5 bg-cream border-b border-border text-[10px] font-semibold uppercase tracking-wide text-forest/45">
            <span>Category</span><span className="text-right">Budgeted</span><span className="text-right">Actual</span>
          </div>
          {costs.length === 0 ? (
            <p className="text-[13px] text-forest/45 px-4 py-6 text-center">
              No costs tracked yet.{canManage ? ' Add food, staff, and utility lines to see your margin.' : ''}
            </p>
          ) : (
            costs.map((c) => (
              <button
                key={c.id}
                disabled={!canManage}
                onClick={() => openModal({ kind: 'cost', retreatId: retreat.id, costId: c.id })}
                className="w-full grid grid-cols-3 px-4 py-2.5 border-b border-cream-dark text-[13px] items-center text-left enabled:hover:bg-cream/60 disabled:cursor-default"
              >
                <span className="text-forest/70 truncate">{c.category}</span>
                <span className="font-mono text-right text-red/80">{money(c.budgeted)}</span>
                <span className="font-mono text-right text-red/80">{c.actual != null ? money(c.actual) : '—'}</span>
              </button>
            ))
          )}
          {costs.length > 0 && (
            <div className="grid grid-cols-3 px-4 py-3 bg-forest">
              <span className="text-[13px] font-semibold text-sage-light font-mono">Total cost</span>
              <span className="text-[13px] font-semibold text-white font-mono text-right">{money(totalBudgeted)}</span>
              <span className="text-[13px] font-semibold text-white font-mono text-right">{money(totalActual)}</span>
            </div>
          )}
        </div>

        {/* Revenue & payments */}
        <div className="bg-white rounded-card border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-cream-dark border-b border-border">
            <p className="text-[13px] font-semibold text-forest">Revenue &amp; payments</p>
            {canManage && (
              <div className="flex gap-3">
                <button onClick={() => openModal({ kind: 'charge', retreatId: retreat.id })} className="text-[12px] font-medium text-forest/60 hover:text-forest">+ Charge</button>
                <button onClick={() => openModal({ kind: 'payment', retreatId: retreat.id })} className="text-[12px] font-medium text-forest/60 hover:text-forest">+ Payment</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 px-4 py-2.5 bg-cream border-b border-border text-[10px] font-semibold uppercase tracking-wide text-forest/45">
            <span>Item</span><span className="text-right">Rate</span><span className="text-right">Amount</span>
          </div>
          {charges.length === 0 && payments.length === 0 ? (
            <p className="text-[13px] text-forest/45 px-4 py-6 text-center">
              No charges yet.{canManage ? ' Add lodging, meals, and add-on charges to build the invoice.' : ''}
            </p>
          ) : (
            <>
              {charges.map((c) => (
                <button
                  key={c.id}
                  disabled={!canManage}
                  onClick={() => openModal({ kind: 'charge', retreatId: retreat.id, chargeId: c.id })}
                  className="w-full grid grid-cols-3 px-4 py-2.5 border-b border-cream-dark text-[13px] items-center text-left enabled:hover:bg-cream/60 disabled:cursor-default"
                >
                  <span className="text-forest/70 truncate">{c.description}</span>
                  <span className="font-mono text-right text-forest/45">{c.qty} × {money(c.unitRate)}</span>
                  <span className="font-mono text-right text-green-muted-text">{money(c.amount)}</span>
                </button>
              ))}
              {payments.map((p) => (
                <div key={p.id} className="grid grid-cols-3 px-4 py-2.5 border-b border-cream-dark text-[13px] items-center">
                  <span className="text-forest/70 truncate capitalize">{p.kind} received</span>
                  <span className="font-mono text-right text-forest/45">{fmtDate(p.paidOn)}</span>
                  <span className="font-mono text-right text-forest/45">({money(p.amount)})</span>
                </div>
              ))}
              <div className="grid grid-cols-3 px-4 py-2.5 border-b border-cream-dark text-[13px] items-center">
                <span className="text-forest/70">Balance due</span>
                <span className="font-mono text-right text-forest/45">{fmtDate(retreat.feedbackOpens ?? retreat.departureDate)}</span>
                <span className="font-mono text-right font-semibold text-amber">{money(bal.balance)}</span>
              </div>
              <div className="grid grid-cols-3 px-4 py-3 bg-forest">
                <span className="text-[13px] font-semibold text-sage-light font-mono">Total revenue</span>
                <span />
                <span className="text-[13px] font-semibold text-white font-mono text-right">{money(revenue)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Invoice */}
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-[14px] font-semibold text-forest">Invoice</h2>
        {canManage && (
          <Button size="sm" onClick={() => openModal({ kind: 'invoice', retreatId: retreat.id })}>Generate &amp; send invoice</Button>
        )}
      </div>

      <div className="bg-white rounded-card border border-border px-7 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-mono text-[13px] font-medium text-sage uppercase tracking-widest">CampOps · {campName}</p>
            {currentCamp?.state && <p className="text-[12px] text-forest/50 mt-1">{currentCamp.state}</p>}
          </div>
          <div className="text-right">
            <p className="text-[22px] font-bold text-forest">INVOICE</p>
            <p className="text-[12px] text-forest/50 mt-1">#{invoiceNo} · {fmtDateFull(retreat.arrivalDate)}</p>
          </div>
        </div>

        {/* Billed to */}
        <div className="bg-cream rounded-card px-4 py-3.5 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/45 mb-1.5">Billed to</p>
          <p className="text-[13px] font-semibold text-forest">{retreat.groupName}</p>
          <p className="text-[12px] text-forest/50">
            {[retreat.coordinatorName, retreat.coordinatorEmail].filter(Boolean).join(' · ') || 'No coordinator on file'}
          </p>
          <p className="text-[12px] text-forest/50">Retreat dates: {fmtRange(retreat.arrivalDate, retreat.departureDate)} · {retreat.headcount} guests</p>
        </div>

        {/* Line items */}
        {charges.length === 0 ? (
          <p className="text-[13px] text-forest/45 border border-border rounded-card px-4 py-6 text-center mb-4">
            No charges to invoice yet.
          </p>
        ) : (
          <div className="border border-border rounded-card overflow-hidden mb-4">
            <div className="grid grid-cols-[1fr_70px_80px_100px] px-4 py-2 bg-cream-dark text-[11px] font-semibold uppercase tracking-wide text-forest/45">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Rate</span>
              <span className="text-right">Total</span>
            </div>
            {charges.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_70px_80px_100px] px-4 py-2.5 border-b border-cream-dark last:border-0 text-[13px]">
                <span className="text-forest/80">{c.description}</span>
                <span className="text-right font-mono text-forest/70">{c.qty}</span>
                <span className="text-right font-mono text-forest/70">{money(c.unitRate)}</span>
                <span className="text-right font-mono text-forest/80">{money(c.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Totals */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex gap-10 text-[13px]">
            <span className="text-forest/50">Subtotal</span>
            <span className="font-mono w-24 text-right">{money(revenue)}</span>
          </div>
          {payments.map((p) => (
            <div key={p.id} className="flex gap-10 text-[13px]">
              <span className="text-forest/50 capitalize">{p.kind} paid {fmtDate(p.paidOn)}</span>
              <span className="font-mono w-24 text-right text-green-muted-text">−{money(p.amount)}</span>
            </div>
          ))}
          <div className="flex gap-10 text-[15px] font-bold text-forest border-t-2 border-forest pt-2 mt-1">
            <span>Balance due</span>
            <span className="font-mono w-24 text-right">{money(bal.balance)}</span>
          </div>
        </div>

        <p className="text-[11px] text-forest/45 mt-5">
          Payment due at checkout · Check payable to {campName}
          {retreat.coordinatorEmail ? ` · Questions: ${retreat.coordinatorEmail}` : ''}
        </p>
      </div>
    </div>
  );
}

function pillLabel(r: Retreat): string {
  const first = r.groupName.split(' ').slice(0, 2).join(' ');
  return r.status === 'active' ? `${first} (active)` : first;
}
