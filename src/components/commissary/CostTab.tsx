import { useMemo } from 'react';
import { DollarSign, TrendingUp, Trash2, ShieldCheck, AlertTriangle, ThermometerSnowflake } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAuth } from '@/lib/auth';
import {
  formatCurrency, tidy, peopleDays, CATEGORY_LABELS, STORAGE_LABELS,
} from '@/lib/commissaryUnits';

const SOON_DAYS = 30;

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ms = new Date(`${dateStr}T00:00:00`).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function ComplianceStrip() {
  const { licenses, certifications, staff, tempLogs } = useSafetyStore();
  const { storageMap, itemsById } = useCommissaryStore();

  const foodLicenses = licenses.filter((l) => l.licenseType === 'health_permit' || l.licenseType === 'food_service');
  const foodCerts = certifications.filter((c) => /food|servsafe|handler/i.test(`${c.certName} ${c.certType}`));
  const activeStaff = staff.filter((s) => s.isActive).length;

  // Latest temp reading for each mapped storage unit.
  const mappedTemps = storageMap
    .filter((m) => m.safetyItemId)
    .map((m) => {
      const logs = tempLogs.filter((t) => t.itemId === m.safetyItemId)
        .sort((a, b) => (b.logDate + b.session).localeCompare(a.logDate + a.session));
      return { location: m.storageLocation, latest: logs[0] ?? null };
    });
  const outOfRange = mappedTemps.filter((t) => t.latest && !t.latest.inRange);

  const anyData = foodLicenses.length > 0 || foodCerts.length > 0 || mappedTemps.length > 0;
  if (!anyData) return null;

  return (
    <div className="bg-white rounded-card border border-border p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-ink-soft" />
        <p className="text-[13px] font-semibold text-forest">Kitchen compliance</p>
        <span className="text-[11px] text-ink-faint">from Compliance</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-faint font-semibold mb-1.5">Permits</p>
          {foodLicenses.length === 0 ? (
            <p className="text-[12px] text-ink-faint">None recorded in Safety.</p>
          ) : foodLicenses.map((l) => {
            const d = daysUntil(l.expiryDate);
            const bad = d != null && d < 0;
            const soon = d != null && d >= 0 && d <= SOON_DAYS;
            return (
              <p key={l.id} className={`text-[12px] ${bad ? 'text-red' : soon ? 'text-amber-text' : 'text-ink'}`}>
                {l.name}{d != null && (bad ? ' · expired' : soon ? ` · ${d}d left` : '')}
              </p>
            );
          })}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-faint font-semibold mb-1.5">Food-handler certs</p>
          <p className="text-[12px] text-ink">
            {foodCerts.length} of {activeStaff} staff
          </p>
          <p className="text-[11px] text-ink-faint mt-0.5">
            {foodCerts.length === 0 ? 'Record ServSafe / food-handler certs in Safety.' : 'Current on file.'}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-faint font-semibold mb-1.5">Storage temps</p>
          {mappedTemps.length === 0 ? (
            <p className="text-[12px] text-ink-faint">No walk-ins linked yet.</p>
          ) : outOfRange.length > 0 ? (
            <p className="text-[12px] text-red flex items-center gap-1">
              <ThermometerSnowflake className="w-3.5 h-3.5" /> {outOfRange.length} out of range
            </p>
          ) : (
            <p className="text-[12px] text-green-muted-text">All in range</p>
          )}
        </div>
      </div>

      {outOfRange.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-card border border-red/25 bg-red-bg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-red/90 leading-relaxed">
            {outOfRange.map((t) => `${STORAGE_LABELS[t.location]} (${t.latest!.temperature}°)`).join(', ')} last logged out of range.
            Review inventory held there · {itemsById().size > 0 ? 'check dairy and protein' : 'items may be at risk'}.
          </p>
        </div>
      )}
    </div>
  );
}

export function CostTab() {
  const {
    activeSession, sessionPerDiem, forecastCost, activeExpenses, deleteExpense,
    orders, orderLines, itemsById, eventsForSession, openModal,
  } = useCommissaryStore();
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const session = activeSession();

  const pd = session ? sessionPerDiem() : null;
  const forecast = session ? forecastCost() : 0;
  const expenses = activeExpenses();

  // Forecast per-diem: planned menu cost ÷ full-session people-days.
  const forecastPerDiem = useMemo(() => {
    if (!session) return null;
    const full = peopleDays(session, eventsForSession(), session.startDate, session.endDate);
    return full > 0 ? tidy(forecast / full) : null;
  }, [session, forecast, eventsForSession]);

  // Spend by category, from received PO lines + expenses.
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    const byId = itemsById();
    const receivedIds = new Set(orders.filter((o) => o.status === 'received').map((o) => o.id));
    for (const l of orderLines) {
      if (!receivedIds.has(l.orderId)) continue;
      const cat = (l.itemId && byId.get(l.itemId)?.category) || 'other';
      const amt = l.receivedUnitPrice != null && l.receivedQty != null
        ? l.receivedUnitPrice * l.receivedQty
        : l.lineTotal;
      m.set(cat, (m.get(cat) ?? 0) + amt);
    }
    for (const e of expenses) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [orders, orderLines, expenses, itemsById]);

  if (!session) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <ComplianceStrip />
        <div className="flex flex-col items-center justify-center text-center max-w-sm mx-auto py-16">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <DollarSign className="w-7 h-7 text-ink-faint" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No session yet</h3>
          <p className="text-[13px] text-ink-soft leading-relaxed">
            Per-diem (cost per camper per day) is measured across a session. Create one on the
            Menu tab and set its budget to track spending against it.
          </p>
        </div>
      </div>
    );
  }

  const perDiemVariant = pd?.variance == null ? 'default' : pd.variance > 0 ? 'red' : 'default';

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      <ComplianceStrip />

      <p className="text-[12px] text-ink-soft leading-relaxed mb-4">
        <strong>Actual</strong> figures come from your delivery invoices (captured at receiving), accurate whether or
        not you track per-item prices. The <strong>forecast</strong> is only an estimate from the prices you've entered,
        and improves as receiving records what you actually paid.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Per-diem (actual)"
          value={pd?.perDiemActual != null ? formatCurrency(pd.perDiemActual) : '-'}
          hint={pd?.budget != null ? `Budget ${formatCurrency(pd.budget)}` : 'No budget set'}
          variant={perDiemVariant}
        />
        <StatCard label="Actual spend" value={formatCurrency(pd?.actualSpend ?? 0)} hint={`from invoices · ${pd?.peopleDays ?? 0} person-days so far`} />
        <StatCard
          label="Per-diem (forecast)"
          value={forecastPerDiem != null ? formatCurrency(forecastPerDiem) : '-'}
          hint={forecastPerDiem != null ? 'estimate from menu prices' : 'no item prices yet'}
        />
        <StatCard label="Planned menu cost" value={forecast > 0 ? formatCurrency(forecast) : '-'} hint="estimate · whole session" />
      </div>

      {pd?.variance != null && (
        <div className={`flex items-center gap-3 rounded-card border px-4 py-3 mb-5 ${pd.variance > 0 ? 'bg-red-bg border-red/25' : 'bg-green-muted-bg border-sage/25'}`}>
          <TrendingUp className={`w-4 h-4 flex-shrink-0 ${pd.variance > 0 ? 'text-red' : 'text-green-muted-text'}`} />
          <p className={`text-body ${pd.variance > 0 ? 'text-red/90' : 'text-green-muted-text'}`}>
            {pd.variance > 0
              ? `Running ${formatCurrency(pd.variance)} per person/day over budget.`
              : `Running ${formatCurrency(Math.abs(pd.variance))} per person/day under budget.`}
          </p>
        </div>
      )}

      {byCategory.length > 0 && (
        <div className="bg-white rounded-card border border-border p-4 mb-5">
          <p className="text-[13px] font-semibold text-forest mb-3">Where the money goes</p>
          <div className="space-y-2">
            {byCategory.map(([cat, amt]) => {
              const total = byCategory.reduce((s, [, v]) => s + v, 0);
              const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-[12px] text-ink w-24 flex-shrink-0">{CATEGORY_LABELS[cat] ?? cat}</span>
                  <div className="flex-1 h-2 bg-cream-dark rounded-full overflow-hidden">
                    <div className="h-full bg-sage rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono text-[12px] text-forest w-20 text-right">{formatCurrency(amt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">Non-PO expenses</p>
        <div className="flex-1" />
        {canManage && <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'expense' })}>+ Add expense</Button>}
      </div>
      {expenses.length === 0 ? (
        <p className="text-[13px] text-ink-faint bg-white rounded-card border border-border px-4 py-4 sm:py-6 text-center">
          Received purchase orders count automatically. Add cash runs, Costco trips, or standing
          contracts here so per-diem reflects everything.
        </p>
      ) : (
        <div className="bg-white rounded-card border border-border overflow-hidden">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
              <span className="text-[12px] text-ink-faint w-24 flex-shrink-0">{new Date(`${e.date}T00:00:00`).toLocaleDateString()}</span>
              <span className="text-[12px] text-ink-soft w-20 flex-shrink-0">{CATEGORY_LABELS[e.category] ?? e.category}</span>
              <span className="text-[13px] text-forest flex-1 truncate">{e.description ?? '-'}</span>
              <span className="font-mono text-[13px] text-forest">{formatCurrency(e.amount)}</span>
              {canManage && (
                <button onClick={() => { if (confirm('Delete this expense?')) deleteExpense(e.id); }} className="p-1 text-forest/30 hover:text-red" aria-label="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
