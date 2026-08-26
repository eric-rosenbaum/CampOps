import { Plus, FileText, Wallet, Receipt } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { money, fmtDate, fmtDateFull, StatusBadge, billableHeadcount } from './retreatUi';

/**
 * Money for the retreat you are currently inside.
 *
 * The season-wide Costs tab answers "how is the year going"; this one answers "what does this
 * group owe, and what have they paid". Deliberately the smaller of the two: a coordinator
 * chasing a deposit should not have to leave the retreat, scan a grid of every other group,
 * and find the right card before they can log it.
 */
export function RetreatCostsDetailTab() {
  const {
    selectedRetreat, financialsFor, paymentsFor, invoicesFor, chargesFor, openModal,
  } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const r = selectedRetreat();
  if (!r) return null;

  const fin = financialsFor(r.id);
  const payments = paymentsFor(r.id).slice().sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  const invoices = invoicesFor(r.id).slice().sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const charges = chargesFor(r.id);

  // A balance invoice raised before the group confirmed a different number is out of date.
  // Comparing timestamps rather than parsing the invoice's line text: the confirmation carries
  // its own `at`, which is exactly the question being asked.
  const staleInvoice = r.finalHeadcountAt && r.finalHeadcount !== r.headcount
    ? invoices.find((i) => i.kind === 'balance' && i.status !== 'void' && i.issuedAt < r.finalHeadcountAt!)
    : undefined;

  const depositReq = fin.depositRequired;
  const depositPaid = fin.depositReceived;
  const depositOk = depositPaid > 0 && depositPaid >= depositReq;
  const settled = fin.expected > 0 && fin.outstanding <= 0;
  const pct = fin.expected > 0 ? Math.min(100, Math.round((fin.collected / fin.expected) * 100)) : 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h2 className="text-[15px] font-semibold text-forest">{r.groupName} · money</h2>
          <p className="text-[12px] text-ink-soft mt-0.5">
            {fmtDate(r.arrivalDate)}–{fmtDate(r.departureDate)} · {billableHeadcount(r)} guests
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={r.status} />
          {canManage && (
            <>
              <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'payment', retreatId: r.id })}>
                <Plus className="w-3.5 h-3.5" /> Log payment
              </Button>
              <Button size="sm" onClick={() => openModal({ kind: 'invoice', retreatId: r.id })}>
                <FileText className="w-3.5 h-3.5" /> Invoice
              </Button>
            </>
          )}
        </div>
      </div>

      {/* An issued invoice is a record of what was billed, so confirming a new headcount must
          not silently rewrite it. That leaves a gap the camp cannot see: the group confirmed 55
          and the outstanding invoice still says 50. Nothing else on the page would say so. */}
      {staleInvoice && (
        <div className="bg-amber-bg border border-amber/30 rounded-card px-5 py-4 mb-5">
          <p className="text-[13px] font-semibold text-amber-text">
            The headcount changed after this invoice went out
          </p>
          <p className="text-[12.5px] text-amber-text/85 mt-1 leading-relaxed">
            {r.groupName} confirmed {r.finalHeadcount} guests
            {r.finalHeadcountAt ? ` on ${fmtDateFull(r.finalHeadcountAt.slice(0, 10))}` : ''}, after
            invoice {staleInvoice.number} was issued for {r.headcount}. The invoice is left exactly
            as it was sent. Raise a new one to bill the confirmed number.
          </p>
          {canManage && (
            <Button size="sm" className="mt-3" onClick={() => openModal({ kind: 'invoice', retreatId: r.id })}>
              <FileText className="w-3.5 h-3.5" /> Re-issue at {r.finalHeadcount}
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
        <StatCard
          label={fin.source === 'estimate' ? 'Expected' : 'Billed'}
          value={money(fin.expected)}
          hint={fin.source === 'estimate' ? 'Rate estimate, no invoice yet' : fin.source === 'invoice' ? 'From the latest invoice' : 'From line charges'}
        />
        <StatCard label="Paid" value={money(fin.collected)} variant={fin.collected > 0 ? 'green' : 'default'} hint={`${payments.length} payment${payments.length === 1 ? '' : 's'} on file`} />
        <StatCard
          label="Balance"
          value={money(fin.outstanding)}
          variant={fin.outstanding > 0 ? 'amber' : 'green'}
          hint={settled ? 'Settled in full' : 'Still outstanding'}
        />
      </div>

      {/* Deposit, the one figure that gates the booking */}
      <div className="bg-white rounded-card border border-border px-5 py-4 mb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex items-center gap-2">
            <Wallet className={`w-4 h-4 ${depositOk ? 'text-sage' : 'text-amber'}`} />
            <div>
              <p className="text-[13px] font-semibold text-forest">
                {depositReq > 0 ? `Deposit ${money(depositReq)}` : 'No deposit required'}
              </p>
              <p className="text-[11.5px] text-ink-soft mt-0.5">
                {depositReq === 0 ? 'This booking holds without one.'
                  : depositOk ? `Received${r.depositDue ? `, was due ${fmtDateFull(r.depositDue)}` : ''}`
                  : depositPaid > 0 ? `${money(depositPaid)} in, ${money(depositReq - depositPaid)} to go`
                  : r.depositDue ? `Due ${fmtDateFull(r.depositDue)}` : 'Not yet received'}
              </p>
            </div>
          </div>
          {canManage && depositReq > 0 && !depositOk && (
            <Button size="sm" onClick={() => openModal({ kind: 'payment', retreatId: r.id, defaultKind: 'deposit' })}>
              <Plus className="w-3.5 h-3.5" /> Log deposit
            </Button>
          )}
        </div>

        <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden mt-3.5">
          <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-ink-faint mt-1.5">{pct}% of the expected total collected</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Invoices */}
        <Panel
          title="Invoices"
          count={invoices.length}
          action={canManage ? { label: 'New invoice', onClick: () => openModal({ kind: 'invoice', retreatId: r.id }) } : undefined}
          empty="No invoices raised yet."
        >
          {invoices.map((inv) => (
            <Row
              key={inv.id}
              icon={<FileText className="w-3.5 h-3.5 text-ink-faint" />}
              title={`${inv.kind === 'deposit' ? 'Deposit' : 'Balance'} · ${inv.number}`}
              sub={`Issued ${fmtDate(inv.issuedAt.slice(0, 10))}${inv.dueDate ? ` · due ${fmtDate(inv.dueDate)}` : ''}`}
              amount={money(inv.amount)}
              badge={inv.status}
              badgeTone={inv.status === 'paid' ? 'ok' : inv.status === 'void' ? 'muted' : 'warn'}
              onClick={canManage ? () => openModal({ kind: 'invoice', retreatId: r.id }) : undefined}
            />
          ))}
        </Panel>

        {/* Payments */}
        <Panel
          title="Payments"
          count={payments.length}
          action={canManage ? { label: 'Log payment', onClick: () => openModal({ kind: 'payment', retreatId: r.id }) } : undefined}
          empty="Nothing received yet."
        >
          {payments.map((p) => (
            <Row
              key={p.id}
              icon={<Receipt className="w-3.5 h-3.5 text-ink-faint" />}
              title={p.kind === 'deposit' ? 'Deposit' : p.kind === 'balance' ? 'Balance' : 'Payment'}
              sub={`${fmtDate(p.paidOn)}${p.method ? ` · ${p.method}` : ''}${p.note ? ` · ${p.note}` : ''}`}
              amount={money(p.amount)}
              amountTone="green"
              onClick={canManage ? () => openModal({ kind: 'payment', retreatId: r.id }) : undefined}
            />
          ))}
        </Panel>
      </div>

      {charges.length > 0 && (
        <div className="mt-4">
          <Panel title="Line charges" count={charges.length} empty="">
            {charges.map((c) => (
              <Row key={c.id} title={c.description} sub={c.qty > 1 ? `${c.qty} × ${money(c.unitRate)}` : ''} amount={money(c.amount)} />
            ))}
          </Panel>
        </div>
      )}

      <p className="text-[11.5px] text-ink-faint mt-4">
        The season-wide picture across every group lives on the Costs &amp; invoice tab outside
        this retreat.
      </p>
    </div>
  );
}

function Panel({
  title, count, action, empty, children,
}: {
  title: string;
  count: number;
  action?: { label: string; onClick: () => void };
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-cream-dark">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">
          {title}{count > 0 ? ` · ${count}` : ''}
        </p>
        {action && (
          <button onClick={action.onClick} className="text-[12px] font-semibold text-ink-soft hover:text-forest">
            {action.label}
          </button>
        )}
      </div>
      {count === 0 && empty
        ? <p className="px-4 py-5 text-[12.5px] text-ink-faint italic">{empty}</p>
        : <div className="divide-y divide-cream-dark">{children}</div>}
    </div>
  );
}

function Row({
  icon, title, sub, amount, amountTone = 'default', badge, badgeTone = 'muted', onClick,
}: {
  icon?: React.ReactNode;
  title: string;
  sub?: string;
  amount: string;
  amountTone?: 'default' | 'green';
  badge?: string;
  badgeTone?: 'ok' | 'warn' | 'muted';
  onClick?: () => void;
}) {
  const badgeCls = badgeTone === 'ok' ? 'bg-green-muted-bg text-green-muted-text'
    : badgeTone === 'warn' ? 'bg-amber-bg text-amber-text' : 'bg-cream-dark text-ink-soft';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 ${onClick ? 'hover:bg-cream transition-colors' : ''}`}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-forest truncate">{title}</p>
        {sub && <p className="text-[11px] text-ink-soft mt-0.5 truncate">{sub}</p>}
      </div>
      {badge && (
        <span className={`flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeCls}`}>
          {badge}
        </span>
      )}
      <span className={`flex-shrink-0 font-mono text-[13px] ${amountTone === 'green' ? 'text-green-muted-text' : 'text-forest'}`}>
        {amount}
      </span>
    </Tag>
  );
}
