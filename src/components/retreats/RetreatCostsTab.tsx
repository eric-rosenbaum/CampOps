import { useMemo, useState } from 'react';
import { Wallet, Plus, FileText, Pencil } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { Retreat } from '@/lib/types';
import { money, fmtRange, StatusBadge } from './retreatUi';

const currentYear = () => new Date().getFullYear();

export function RetreatCostsTab() {
  const {
    retreats, paymentsFor, chargesFor, balanceFor, invoicesFor, openModal,
  } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  // Years present in the data (by arrival date), newest first.
  const years = useMemo(() => {
    const set = new Set(retreats.map((r) => r.arrivalDate.slice(0, 4)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [retreats]);

  const [year, setYear] = useState<string>(() => {
    const cy = String(currentYear());
    const set = new Set(retreats.map((r) => r.arrivalDate.slice(0, 4)));
    return set.has(cy) ? cy : (Array.from(set).sort((a, b) => b.localeCompare(a))[0] ?? cy);
  });

  const yearRetreats = useMemo(
    () => retreats.filter((r) => r.arrivalDate.slice(0, 4) === year).sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate)),
    [retreats, year],
  );

  if (retreats.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="max-w-md mx-auto text-center mt-24">
          <p className="text-[15px] font-semibold text-forest">No retreats yet</p>
          <p className="text-[13px] text-forest/55 mt-2 leading-relaxed">
            Payments, invoices, and financial standing for each group appear here once you create a retreat.
          </p>
        </div>
      </div>
    );
  }

  // Year aggregate.
  let billed = 0, collected = 0, depositsIn = 0, depositsDue = 0;
  for (const r of yearRetreats) {
    const bal = balanceFor(r.id);
    billed += bal.totalCharges;
    collected += bal.totalPaid;
    if ((r.depositRequired ?? 0) > 0) {
      const dp = paymentsFor(r.id).filter((p) => p.kind === 'deposit').reduce((s, p) => s + p.amount, 0);
      if (dp >= (r.depositRequired ?? 0)) depositsIn++; else depositsDue++;
    }
  }
  const outstanding = billed - collected;

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      {/* Header + year selector */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h2 className="text-[15px] font-semibold text-forest">Retreat financials · {year}</h2>
        {years.length > 1 && (
          <div className="flex gap-1 bg-cream-dark rounded-btn p-0.5">
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`text-[12px] font-semibold px-3 py-1 rounded-[6px] transition-colors ${y === year ? 'bg-white text-forest shadow-sm' : 'text-forest/50 hover:text-forest'}`}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Year aggregate */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <StatCard label="Total billed" value={money(billed)} hint={`${yearRetreats.length} group${yearRetreats.length === 1 ? '' : 's'} this year`} />
        <StatCard label="Collected" value={money(collected)} variant={collected > 0 ? 'green' : 'default'} hint="Payments received" />
        <StatCard label="Outstanding" value={money(outstanding)} variant={outstanding > 0 ? 'amber' : 'default'} hint={outstanding > 0 ? 'Across all groups' : 'All settled'} />
        <StatCard label="Deposits secured" value={`${depositsIn}/${depositsIn + depositsDue}`} variant={depositsDue > 0 ? 'amber' : depositsIn > 0 ? 'green' : 'default'} hint={depositsDue > 0 ? `${depositsDue} still pending` : 'Dates held'} />
      </div>

      {/* Per-group financial cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {yearRetreats.map((r) => (
          <GroupFinanceCard key={r.id} retreat={r}
            bal={balanceFor(r.id)}
            depositPaid={paymentsFor(r.id).filter((p) => p.kind === 'deposit').reduce((s, p) => s + p.amount, 0)}
            paymentCount={paymentsFor(r.id).length}
            chargeCount={chargesFor(r.id).length}
            invoiceCount={invoicesFor(r.id).length}
            canManage={canManage}
            openModal={openModal}
          />
        ))}
      </div>
    </div>
  );
}

function GroupFinanceCard({
  retreat: r, bal, depositPaid, paymentCount, chargeCount, invoiceCount, canManage, openModal,
}: {
  retreat: Retreat;
  bal: { totalCharges: number; totalPaid: number; balance: number };
  depositPaid: number; paymentCount: number; chargeCount: number; invoiceCount: number;
  canManage: boolean;
  openModal: (m: { kind: 'payment'; retreatId: string; defaultKind?: 'deposit' | 'balance' | 'payment' } | { kind: 'invoice'; retreatId: string }) => void;
}) {
  const depositReq = r.depositRequired ?? 0;
  const depositOk = depositReq > 0 && depositPaid >= depositReq;
  const pct = bal.totalCharges > 0 ? Math.min(100, Math.round((bal.totalPaid / bal.totalCharges) * 100)) : 0;

  // A short standing label.
  const standing = bal.totalCharges === 0
    ? { text: 'Not invoiced', tone: 'neutral' as const }
    : bal.balance <= 0
      ? { text: 'Paid in full', tone: 'ok' as const }
      : depositReq > 0 && !depositOk
        ? { text: 'Deposit pending', tone: 'warn' as const }
        : { text: `${money(bal.balance)} outstanding`, tone: 'warn' as const };

  const standingCls = standing.tone === 'ok' ? 'bg-green-muted-bg text-green-muted-text'
    : standing.tone === 'warn' ? 'bg-amber-bg text-amber-text' : 'bg-cream-dark text-forest/55';

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-cream-dark">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-forest truncate">{r.groupName}</p>
            <p className="text-[11px] text-forest/50 mt-0.5">{fmtRange(r.arrivalDate, r.departureDate)} · {r.headcount} guests</p>
          </div>
          <div className="flex-shrink-0"><StatusBadge status={r.status} /></div>
        </div>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-3 divide-x divide-cream-dark border-b border-cream-dark">
        <Fig label="Billed" value={money(bal.totalCharges)} />
        <Fig label="Paid" value={money(bal.totalPaid)} tone="green" />
        <Fig label="Balance" value={money(bal.balance)} tone={bal.balance > 0 ? 'amber' : 'default'} />
      </div>

      {/* Progress + deposit + standing */}
      <div className="px-4 py-3 space-y-2.5">
        <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden">
          <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          {depositReq > 0 ? (
            <span className={`text-[11px] font-medium inline-flex items-center gap-1 ${depositOk ? 'text-green-muted-text' : 'text-amber-text'}`}>
              <Wallet className="w-3.5 h-3.5" />
              Deposit {money(depositReq)} · {depositOk ? 'received' : depositPaid > 0 ? `${money(depositPaid)} in` : 'due'}
            </span>
          ) : <span className="text-[11px] text-forest/40">No deposit required</span>}
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${standingCls}`}>{standing.text}</span>
        </div>
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {depositReq > 0 && !depositOk && (
            <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'payment', retreatId: r.id, defaultKind: 'deposit' })}>
              <Plus className="w-3.5 h-3.5" /> Log deposit
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'payment', retreatId: r.id })}>
            {paymentCount > 0 ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {paymentCount > 0 ? `Payments (${paymentCount})` : 'Log payment'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'invoice', retreatId: r.id })}>
            <FileText className="w-3.5 h-3.5" /> {invoiceCount > 0 ? `Invoices (${invoiceCount})` : 'Invoice'}
          </Button>
        </div>
      )}
      {chargeCount === 0 && (
        <p className="px-4 pb-3 -mt-1 text-[11px] text-forest/40">No charges yet — add lodging/meal charges from a group's Invoice to bill them.</p>
      )}
    </div>
  );
}

function Fig({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'amber' }) {
  const cls = tone === 'green' ? 'text-green-muted-text' : tone === 'amber' ? 'text-amber' : 'text-forest';
  return (
    <div className="px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-forest/40">{label}</p>
      <p className={`font-mono text-[14px] font-semibold mt-0.5 ${cls}`}>{value}</p>
    </div>
  );
}
