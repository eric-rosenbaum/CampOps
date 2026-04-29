import { Link } from 'react-router-dom';
import { format, formatDistanceToNow, differenceInDays, addDays, startOfDay } from 'date-fns';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Shield, Droplets,
  Truck, Wrench, Users, Calendar, ChevronRight,
} from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { useIssuesStore } from '@/store/issuesStore';
import { useChecklistStore } from '@/store/checklistStore';
import {
  usePoolStore, isWaterfrontType, getChemicalStatus, CHEMICAL_RANGES, type ChemicalField,
} from '@/store/poolStore';
import {
  useSafetyStore, certExpiryStatus, DRILL_TYPE_LABELS, CERT_TYPE_LABELS,
} from '@/store/safetyStore';
import { useAssetStore, SERVICE_TYPE_LABELS } from '@/store/assetStore';
import { formatCost } from '@/lib/utils';
import type { CampPool, ChemicalReading } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionPriority = 'critical' | 'warning' | 'info';
type ActionItem = { id: string; priority: ActionPriority; module: string; label: string; to: string };
type DeadlineItem = { id: string; dateStr: string; label: string; sub: string; module: string; overdue: boolean };
type ActivityItem = { id: string; module: string; userName: string; action: string; context: string; timestamp: string };

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ values, field }: { values: number[]; field: ChemicalField }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 0.1;
  const W = 88, H = 28, PAD = 3;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: PAD + (1 - (v - min) / spread) * (H - PAD * 2),
    status: getChemicalStatus(field, v),
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const latest = pts[pts.length - 1];
  const lineColor = latest.status === 'alert' ? '#c0392b' : latest.status === 'warn' ? '#c47d08' : '#7aab6e';

  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={path} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x} cy={p.y}
          r={i === pts.length - 1 ? 2.5 : 1.5}
          fill={p.status === 'alert' ? '#c0392b' : p.status === 'warn' ? '#c47d08' : '#7aab6e'}
          opacity={i === pts.length - 1 ? 1 : 0.5}
        />
      ))}
    </svg>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  label, value, sub, variant = 'default', to,
}: {
  label: string; value: string | number; sub?: string;
  variant?: 'default' | 'red' | 'amber' | 'green'; to: string;
}) {
  const valCls = variant === 'red' ? 'text-red' : variant === 'amber' ? 'text-amber' : variant === 'green' ? 'text-green-muted-text' : 'text-forest';
  const bg = variant === 'red' ? 'bg-red-bg/50 border-red/25' : variant === 'amber' ? 'bg-amber-bg/50 border-amber/25' : 'bg-white border-border';
  return (
    <Link to={to} className={`rounded-card border px-4 py-3.5 flex flex-col hover:shadow-sm transition-all group ${bg}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-forest/45 leading-none mb-1.5">{label}</p>
      <p className={`font-mono text-[26px] font-semibold leading-none ${valCls}`}>{value}</p>
      {sub && (
        <p className={`text-[10px] mt-1.5 ${variant === 'red' ? 'text-red/70 font-medium' : variant === 'amber' ? 'text-amber/80 font-medium' : 'text-forest/35'}`}>
          {sub}
        </p>
      )}
    </Link>
  );
}

// ─── Action queue ─────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<ActionPriority, string> = {
  critical: 'bg-red',
  warning:  'bg-amber',
  info:     'bg-blue-400',
};

const MODULE_BADGE: Record<string, string> = {
  Issue:     'bg-red/8 text-red/80 border border-red/15',
  Pool:      'bg-blue-50 text-blue-600 border border-blue-100',
  Safety:    'bg-amber/10 text-amber border border-amber/20',
  Fleet:     'bg-forest/8 text-forest/60 border border-forest/10',
  Checklist: 'bg-sage/10 text-sage border border-sage/20',
  Cert:      'bg-purple-50 text-purple-600 border border-purple-100',
};

function ActionQueue({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-card border border-border flex flex-col items-center justify-center py-10">
        <CheckCircle2 className="w-7 h-7 text-sage mb-2" />
        <p className="text-[13px] font-semibold text-forest mb-0.5">All clear</p>
        <p className="text-[11px] text-forest/40">No action items right now</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      {items.map((item, i) => (
        <Link
          key={item.id}
          to={item.to}
          className={`flex items-center gap-3 px-4 py-3 hover:bg-cream-dark transition-colors group ${
            i < items.length - 1 ? 'border-b border-border' : ''
          }`}
        >
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[item.priority]}`} />
          <p className="text-[12px] text-forest flex-1 min-w-0 leading-snug">{item.label}</p>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${MODULE_BADGE[item.module] ?? 'bg-cream text-forest/50'}`}>
            {item.module}
          </span>
          <ChevronRight className="w-3 h-3 text-forest/25 group-hover:text-forest/50 transition-colors shrink-0" />
        </Link>
      ))}
    </div>
  );
}

// ─── Expanded pool card ────────────────────────────────────────────────────────

const CHEM_ROWS: { field: ChemicalField; decimals: number }[] = [
  { field: 'freeChlorine', decimals: 1 },
  { field: 'ph', decimals: 1 },
  { field: 'alkalinity', decimals: 0 },
  { field: 'cyanuricAcid', decimals: 0 },
  { field: 'waterTemp', decimals: 0 },
];

function ExpandedPoolCard({ pool, latestReading, recentReadings }: {
  pool: CampPool; latestReading: ChemicalReading | null; recentReadings: ChemicalReading[];
}) {
  type Dot = 'green' | 'amber' | 'red' | 'gray';
  let dot: Dot = 'gray';
  let statusLabel = 'No reading';

  if (!isWaterfrontType(pool.type) && latestReading) {
    switch (latestReading.poolStatus) {
      case 'open_all_clear':    dot = 'green'; statusLabel = 'Open — all clear'; break;
      case 'open_monitoring':   dot = 'amber'; statusLabel = 'Open — monitoring'; break;
      case 'closed_corrective': dot = 'red';   statusLabel = 'Closed — corrective action'; break;
      case 'closed_retest':     dot = 'red';   statusLabel = 'Closed — pending retest'; break;
    }
  } else if (isWaterfrontType(pool.type)) {
    dot = 'green'; statusLabel = 'Waterfront area';
  }

  const dotBg: Record<Dot, string> = { green: 'bg-sage', amber: 'bg-amber', red: 'bg-red', gray: 'bg-border' };
  const statusCls: Record<Dot, string> = {
    green: 'text-green-muted-text', amber: 'text-amber', red: 'text-red font-semibold', gray: 'text-forest/35',
  };

  const sparkValues = [...recentReadings]
    .sort((a, b) => new Date(a.readingTime).getTime() - new Date(b.readingTime).getTime())
    .slice(-8)
    .map(r => r.freeChlorine);

  const statusPillCls: Record<'ok' | 'warn' | 'alert', string> = {
    ok:    'bg-sage/10 text-sage',
    warn:  'bg-amber/10 text-amber',
    alert: 'bg-red/10 text-red font-semibold',
  };

  return (
    <div className={`bg-white rounded-card border overflow-hidden ${dot === 'red' ? 'border-red/30' : 'border-border'}`}>
      {/* Header */}
      <div className={`flex items-start justify-between px-4 pt-3.5 pb-3 border-b border-border ${dot === 'red' ? 'bg-red-bg/30' : ''}`}>
        <div className="min-w-0 flex-1 pr-3">
          <p className="text-[13px] font-semibold text-forest truncate">{pool.name}</p>
          <p className={`text-[11px] mt-0.5 ${statusCls[dot]}`}>{statusLabel}</p>
        </div>
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${dotBg[dot]}`} />
      </div>

      {/* Chemical readings table */}
      {!isWaterfrontType(pool.type) && latestReading && (
        <div className="px-4 py-3">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-[9px] font-semibold text-forest/35 uppercase tracking-wide pb-1.5 pr-2">Chemical</th>
                <th className="text-right text-[9px] font-semibold text-forest/35 uppercase tracking-wide pb-1.5 pr-2">Reading</th>
                <th className="text-right text-[9px] font-semibold text-forest/35 uppercase tracking-wide pb-1.5 pr-2">Range</th>
                <th className="text-right text-[9px] font-semibold text-forest/35 uppercase tracking-wide pb-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {CHEM_ROWS.map(({ field, decimals }) => {
                const val = latestReading[field];
                const status = getChemicalStatus(field, val);
                const range = CHEMICAL_RANGES[field];
                const displayed = decimals === 0 ? Math.round(val).toString() : val.toFixed(decimals);
                return (
                  <tr key={field} className="border-t border-border/50">
                    <td className="py-1.5 pr-2 text-[11px] text-forest/55">{range.label}</td>
                    <td className={`py-1.5 pr-2 text-right font-mono text-[12px] font-semibold ${status === 'alert' ? 'text-red' : status === 'warn' ? 'text-amber' : 'text-forest'}`}>
                      {displayed}{range.unit}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-[10px] text-forest/30">
                      {range.min}–{range.max}{range.unit}
                    </td>
                    <td className="py-1.5 text-right">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase ${statusPillCls[status]}`}>
                        {status === 'ok' ? 'OK' : status === 'warn' ? 'Warn' : 'Alert'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sparkValues.length >= 2 && (
            <div className="mt-3 pt-2.5 border-t border-border/50">
              <p className="text-[9px] text-forest/35 mb-1">Free Cl — last {sparkValues.length} readings</p>
              <Sparkline values={sparkValues} field="freeChlorine" />
            </div>
          )}
        </div>
      )}

      {isWaterfrontType(pool.type) && (
        <div className="px-4 py-4">
          <p className="text-[11px] text-forest/40">Waterfront — chemical tracking not applicable</p>
        </div>
      )}

      {!isWaterfrontType(pool.type) && !latestReading && (
        <div className="px-4 py-4">
          <p className="text-[11px] text-forest/40">No readings logged yet</p>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border bg-cream-dark/30">
        <p className="text-[9px] text-forest/35">
          {latestReading
            ? `Last logged ${formatDistanceToNow(new Date(latestReading.readingTime), { addSuffix: true })} · by ${latestReading.loggedByName}`
            : 'No readings on file'}
        </p>
      </div>
    </div>
  );
}

// ─── Deadline strip ───────────────────────────────────────────────────────────

function DeadlineStrip({ items }: { items: DeadlineItem[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-forest/40" />
          <h2 className="text-[15px] font-semibold text-forest">Upcoming — next 14 days</h2>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {items.map(item => {
          const date = new Date(item.dateStr.includes('T') ? item.dateStr : item.dateStr + 'T00:00:00');
          const daysAway = differenceInDays(startOfDay(date), startOfDay(new Date()));
          const isToday = daysAway === 0;
          const isPast  = item.overdue || daysAway < 0;

          return (
            <div
              key={item.id}
              className={`shrink-0 w-44 rounded-card border px-3.5 py-3 ${
                isPast  ? 'bg-red-bg/50 border-red/20' :
                isToday ? 'bg-amber-bg/50 border-amber/25' :
                          'bg-white border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className={`font-mono text-[11px] font-semibold ${isPast ? 'text-red' : isToday ? 'text-amber' : 'text-forest/50'}`}>
                  {isPast ? 'OVERDUE' : isToday ? 'TODAY' : format(date, 'MMM d')}
                </p>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${MODULE_BADGE[item.module] ?? 'bg-cream text-forest/50'}`}>
                  {item.module}
                </span>
              </div>
              <p className={`text-[12px] font-medium leading-snug ${isPast ? 'text-red' : 'text-forest'}`}>{item.label}</p>
              <p className="text-[10px] text-forest/40 mt-0.5">{item.sub}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

const MOD_DOT: Record<string, string> = {
  Issue:     'bg-red/60',
  Pool:      'bg-blue-400',
  Safety:    'bg-amber',
  Fleet:     'bg-forest/50',
  Checklist: 'bg-sage',
  Cert:      'bg-purple-400',
};

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-forest/40" />
          <h2 className="text-[15px] font-semibold text-forest">Recent activity</h2>
        </div>
        <p className="text-[11px] text-forest/35">Last 24 hours across all modules</p>
      </div>
      <div className="bg-white rounded-card border border-border overflow-hidden">
        {items.length === 0 ? (
          <p className="text-center text-[12px] text-forest/35 py-8">No activity in the last 24 hours</p>
        ) : (
          items.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 px-4 py-3 ${i < items.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="w-6 h-6 rounded-full bg-cream-dark flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-bold text-forest/55 uppercase">
                  {item.userName.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-forest leading-snug">
                  <span className="font-semibold">{item.userName}</span>{' '}
                  <span className="text-forest/55">{item.action}</span>{' '}
                  <span className="text-forest/70">{item.context}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full ${MOD_DOT[item.module] ?? 'bg-forest/30'}`} />
                <p className="text-[10px] text-forest/35 whitespace-nowrap">
                  {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon, title, badge, badgeRed = false, to, linkLabel = 'View',
}: {
  icon: React.ReactNode; title: string; badge?: number | null;
  badgeRed?: boolean; to: string; linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-[15px] font-semibold text-forest">{title}</h2>
        {badge != null && badge > 0 && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeRed ? 'bg-red/10 text-red' : 'bg-amber-bg text-amber'}`}>
            {badge}
          </span>
        )}
      </div>
      <Link to={to} className="text-[11px] text-sage hover:text-sage-light flex items-center gap-0.5 transition-colors">
        {linkLabel} <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function AdminHome() {
  // ── Stores ────────────────────────────────────────────────────────────────
  const { issues, urgentCount, openCount, totalCosts, selectIssue } = useIssuesStore();
  const { tasks, season } = useChecklistStore();
  const { pools, chemicalReadings } = usePoolStore();
  const {
    items: safetyItems, drills, certifications, licenses,
    allStats, nextScheduledDrill, failedLastInspectionItems, overdueItems,
    staffWithCerts,
  } = useSafetyStore();
  const { assets, checkouts, fleetStats, overdueCheckouts, currentlyCheckedOut, maintenanceOverdue } = useAssetStore();

  // ── Derived data ──────────────────────────────────────────────────────────
  const safetyStats   = allStats();
  const nextDrill     = nextScheduledDrill();
  const failedDevices = failedLastInspectionItems();
  const overdueItems_ = overdueItems();
  const fleet         = fleetStats();
  const overdueOuts   = overdueCheckouts();
  const checkedOutNow = currentlyCheckedOut();
  const maintOverdue  = maintenanceOverdue();
  const staffList     = staffWithCerts();

  const today = startOfDay(new Date());

  const expiredCerts   = certifications.filter(c => certExpiryStatus(c.expiryDate) === 'expired').length;
  const expiringCerts  = certifications.filter(c => certExpiryStatus(c.expiryDate) === 'expiring').length;
  const expiredLicenses = licenses.filter(l => l.expiryDate && new Date(l.expiryDate + 'T00:00:00') < today).length;

  const preTotal     = tasks.filter(t => t.phase === 'pre').length;
  const preComplete  = tasks.filter(t => t.phase === 'pre' && t.status === 'complete').length;
  const postTotal    = tasks.filter(t => t.phase === 'post').length;
  const postComplete = tasks.filter(t => t.phase === 'post' && t.status === 'complete').length;

  const activePools = pools.filter(p => p.isActive);

  const latestReadingForPool = (poolId: string): ChemicalReading | null =>
    chemicalReadings
      .filter(r => r.poolId === poolId)
      .sort((a, b) => new Date(b.readingTime).getTime() - new Date(a.readingTime).getTime())[0] ?? null;

  const readingsForPool = (poolId: string): ChemicalReading[] =>
    chemicalReadings.filter(r => r.poolId === poolId);

  const closedPools = activePools.filter(p => {
    if (isWaterfrontType(p.type)) return false;
    const r = latestReadingForPool(p.id);
    return r && (r.poolStatus === 'closed_corrective' || r.poolStatus === 'closed_retest');
  });

  const acaDays = season?.acaInspectionDate
    ? differenceInDays(new Date(season.acaInspectionDate + 'T00:00:00'), today)
    : null;

  // ── Alert pills ──────────────────────────────────────────────────────────
  type AlertPill = { id: string; label: string; to: string; red: boolean };
  const alertPills: AlertPill[] = [];
  if (urgentCount() > 0)       alertPills.push({ id: 'urgent',    label: `${urgentCount()} urgent issue${urgentCount() !== 1 ? 's' : ''}`,         to: '/issues', red: true });
  if (closedPools.length > 0)  alertPills.push({ id: 'closed-pools', label: `${closedPools.length} pool${closedPools.length !== 1 ? 's' : ''} closed`, to: '/pool',   red: true });
  if (safetyStats.overdue > 0) alertPills.push({ id: 'safety',    label: `${safetyStats.overdue} safety item${safetyStats.overdue !== 1 ? 's' : ''} overdue`, to: '/safety', red: true });
  if (expiredCerts > 0)        alertPills.push({ id: 'certs',     label: `${expiredCerts} staff cert${expiredCerts !== 1 ? 's' : ''} expired`,         to: '/safety', red: true });
  if (expiredLicenses > 0)     alertPills.push({ id: 'licenses',  label: `${expiredLicenses} license${expiredLicenses !== 1 ? 's' : ''} expired`,      to: '/safety', red: true });

  if (overdueOuts.length > 0)  alertPills.push({ id: 'overdue-checkouts', label: `${overdueOuts.length} checkout${overdueOuts.length !== 1 ? 's' : ''} overdue`, to: '/assets', red: false });
  if (expiringCerts > 0)       alertPills.push({ id: 'expiring',  label: `${expiringCerts} cert${expiringCerts !== 1 ? 's' : ''} expiring soon`,       to: '/safety', red: false });
  alertPills.sort((a, b) => (a.red === b.red ? 0 : a.red ? -1 : 1));

  // ── Action queue ─────────────────────────────────────────────────────────
  const actionItems: ActionItem[] = [];

  issues.filter(i => i.status !== 'resolved' && i.priority === 'urgent').slice(0, 3).forEach(issue =>
    actionItems.push({ id: `iss-${issue.id}`, priority: 'critical', module: 'Issue', label: `Urgent: ${issue.title}`, to: '/issues' })
  );
  closedPools.forEach(p =>
    actionItems.push({ id: `pool-${p.id}`, priority: 'critical', module: 'Pool', label: `${p.name} is closed — corrective action needed`, to: '/pool' })
  );
  overdueItems_.slice(0, 3).forEach(item =>
    actionItems.push({ id: `saf-${item.id}`, priority: 'critical', module: 'Safety', label: `Inspection overdue: ${item.name} at ${item.location}`, to: '/safety' })
  );
  overdueOuts.slice(0, 3).forEach(({ asset, checkout }) => {
    const daysOver = differenceInDays(today, startOfDay(new Date(checkout.expectedReturnAt)));
    actionItems.push({ id: `co-${checkout.id}`, priority: 'critical', module: 'Fleet', label: `${asset.name} overdue ${daysOver}d — checked out by ${checkout.checkedOutBy}`, to: '/assets' });
  });
  failedDevices.slice(0, 2).forEach(item =>
    actionItems.push({ id: `fail-${item.id}`, priority: 'critical', module: 'Safety', label: `Re-inspect: ${item.name} at ${item.location} — failed last inspection`, to: '/safety' })
  );
  certifications.filter(c => certExpiryStatus(c.expiryDate) === 'expired').slice(0, 2).forEach(cert =>
    actionItems.push({ id: `cert-${cert.id}`, priority: 'critical', module: 'Cert', label: `Expired cert: ${CERT_TYPE_LABELS[cert.certType as keyof typeof CERT_TYPE_LABELS]} — renew staff cert`, to: '/safety' })
  );
  issues.filter(i => i.status !== 'resolved' && i.priority === 'high').slice(0, 3).forEach(issue =>
    actionItems.push({ id: `iss-h-${issue.id}`, priority: 'warning', module: 'Issue', label: issue.title, to: '/issues' })
  );
  maintOverdue.slice(0, 2).forEach(({ asset, record }) =>
    actionItems.push({ id: `maint-${record.id}`, priority: 'warning', module: 'Fleet', label: `${asset.name} — ${SERVICE_TYPE_LABELS[record.serviceType] ?? 'Service'} overdue`, to: '/assets' })
  );
  certifications.filter(c => certExpiryStatus(c.expiryDate) === 'expiring').slice(0, 2).forEach(cert =>
    actionItems.push({ id: `certw-${cert.id}`, priority: 'warning', module: 'Cert', label: `Cert expiring soon: ${CERT_TYPE_LABELS[cert.certType as keyof typeof CERT_TYPE_LABELS]}`, to: '/safety' })
  );
  drills
    .filter(d => d.status === 'scheduled' && differenceInDays(new Date(d.scheduledDate + 'T00:00:00'), today) <= 7 && differenceInDays(new Date(d.scheduledDate + 'T00:00:00'), today) >= 0)
    .slice(0, 2)
    .forEach(drill =>
      actionItems.push({ id: `drill-${drill.id}`, priority: 'info', module: 'Safety', label: `Drill: ${DRILL_TYPE_LABELS[drill.drillType as keyof typeof DRILL_TYPE_LABELS]} on ${format(new Date(drill.scheduledDate + 'T00:00:00'), 'MMM d')}`, to: '/safety' })
    );

  const seen = new Set<string>();
  const deduped = actionItems.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; }).slice(0, 12);

  // ── Deadline strip ───────────────────────────────────────────────────────
  const deadlineItems: DeadlineItem[] = [];
  const in14 = addDays(today, 14);

  safetyItems
    .filter(item => item.nextDue && new Date(item.nextDue + 'T00:00:00') <= in14)
    .forEach(item =>
      deadlineItems.push({ id: `sdue-${item.id}`, dateStr: item.nextDue!, label: item.name, sub: item.location, module: 'Safety', overdue: new Date(item.nextDue! + 'T00:00:00') < today })
    );
  drills
    .filter(d => d.status === 'scheduled' && new Date(d.scheduledDate + 'T00:00:00') <= in14)
    .forEach(drill =>
      deadlineItems.push({ id: `ddrill-${drill.id}`, dateStr: drill.scheduledDate, label: DRILL_TYPE_LABELS[drill.drillType as keyof typeof DRILL_TYPE_LABELS], sub: drill.lead ? `Lead: ${drill.lead}` : 'No lead assigned', module: 'Safety', overdue: false })
    );
  assets
    .filter(a => a.registrationExpiry && new Date(a.registrationExpiry + 'T00:00:00') <= in14)
    .forEach(asset =>
      deadlineItems.push({ id: `areg-${asset.id}`, dateStr: asset.registrationExpiry!, label: `${asset.name} registration`, sub: asset.licensePlate ?? asset.category, module: 'Fleet', overdue: new Date(asset.registrationExpiry! + 'T00:00:00') < today })
    );
  assets
    .filter(a => a.uscgRegistrationExpiry && new Date(a.uscgRegistrationExpiry + 'T00:00:00') <= in14)
    .forEach(asset =>
      deadlineItems.push({ id: `uscg-${asset.id}`, dateStr: asset.uscgRegistrationExpiry!, label: `${asset.name} — USCG reg`, sub: asset.uscgRegistration ?? 'USCG registration', module: 'Fleet', overdue: new Date(asset.uscgRegistrationExpiry! + 'T00:00:00') < today })
    );
  if (season?.acaInspectionDate && new Date(season.acaInspectionDate + 'T00:00:00') <= in14)
    deadlineItems.push({ id: 'aca', dateStr: season.acaInspectionDate, label: 'ACA inspection', sub: season.name ?? 'Season inspection', module: 'Safety', overdue: new Date(season.acaInspectionDate + 'T00:00:00') < today });
  deadlineItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  // ── Activity feed ────────────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const allActivity: ActivityItem[] = [];

  issues.forEach(issue =>
    issue.activityLog
      .filter(e => new Date(e.timestamp) >= cutoff)
      .forEach(e =>
        allActivity.push({ id: e.id, module: 'Issue', userName: e.userName, action: e.action, context: issue.title, timestamp: e.timestamp })
      )
  );
  tasks.forEach(task =>
    task.activityLog
      .filter(e => new Date(e.timestamp) >= cutoff)
      .forEach(e =>
        allActivity.push({ id: `task-${e.id}`, module: 'Checklist', userName: e.userName, action: e.action, context: task.title, timestamp: e.timestamp })
      )
  );
  chemicalReadings
    .filter(r => new Date(r.readingTime) >= cutoff)
    .forEach(r => {
      const pool = pools.find(p => p.id === r.poolId);
      if (pool) allActivity.push({ id: `chem-${r.id}`, module: 'Pool', userName: r.loggedByName, action: 'logged a reading for', context: pool.name, timestamp: r.readingTime });
    });
  checkouts
    .filter(c => new Date(c.checkedOutAt) >= cutoff)
    .forEach(c => {
      const asset = assets.find(a => a.id === c.assetId);
      allActivity.push({ id: `co-${c.id}`, module: 'Fleet', userName: c.checkedOutBy, action: 'checked out', context: asset?.name ?? 'asset', timestamp: c.checkedOutAt });
    });
  checkouts
    .filter(c => c.returnedAt && new Date(c.returnedAt) >= cutoff)
    .forEach(c => {
      const asset = assets.find(a => a.id === c.assetId);
      allActivity.push({ id: `ret-${c.id}`, module: 'Fleet', userName: c.checkedOutBy, action: 'returned', context: asset?.name ?? 'asset', timestamp: c.returnedAt! });
    });

  allActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const recentActivity = allActivity.slice(0, 20);

  // ── Stat tile values ─────────────────────────────────────────────────────
  const urgCount = urgentCount();
  const opCount  = openCount();
  const safetyPct = safetyStats.overdue + safetyStats.dueSoon + safetyStats.compliant > 0
    ? Math.round((safetyStats.compliant / (safetyStats.overdue + safetyStats.dueSoon + safetyStats.compliant)) * 100)
    : 100;

  const subtitle = season
    ? `${season.name}  ·  ${format(new Date(), 'EEEE, MMMM d, yyyy')}`
    : format(new Date(), 'EEEE, MMMM d, yyyy');

  // ── Safety donut ─────────────────────────────────────────────────────────
  const safetyTotal = safetyStats.overdue + safetyStats.dueSoon + safetyStats.compliant;
  const circ = 2 * Math.PI * 15.9;
  const ringColor = safetyStats.overdue > 0 ? '#c0392b' : safetyStats.dueSoon > 0 ? '#c47d08' : '#7aab6e';

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar title="Operations Dashboard" subtitle={subtitle} />

      <div className="flex-1 overflow-y-auto px-7 py-6 space-y-7">

        {/* ── Critical alert strip ─────────────────────────────────────── */}
        {alertPills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {alertPills.map(a => (
              <Link
                key={a.id}
                to={a.to}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[11px] font-semibold border transition-all hover:opacity-85 ${
                  a.red ? 'bg-red-bg text-red border-red/20' : 'bg-amber-bg text-amber border-amber/25'
                }`}
              >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {a.label}
              </Link>
            ))}
          </div>
        )}

        {/* ── Stat strip ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-6 gap-3">
          <StatTile
            label="Urgent issues"
            value={urgCount}
            sub={urgCount > 0 ? 'Needs immediate action' : 'None pending'}
            variant={urgCount > 0 ? 'red' : 'green'}
            to="/issues"
          />
          <StatTile
            label="Open issues"
            value={opCount}
            sub={opCount > 0 ? `${issues.filter(i => i.priority === 'high' && i.status !== 'resolved').length} high priority` : 'All resolved'}
            variant={opCount > 0 ? 'default' : 'green'}
            to="/issues"
          />
          <StatTile
            label="Safety compliance"
            value={`${safetyPct}%`}
            sub={safetyStats.overdue > 0 ? `${safetyStats.overdue} overdue` : safetyStats.dueSoon > 0 ? `${safetyStats.dueSoon} due soon` : 'All current'}
            variant={safetyStats.overdue > 0 ? 'red' : safetyStats.dueSoon > 0 ? 'amber' : 'green'}
            to="/safety"
          />
          <StatTile
            label="Assets out"
            value={checkedOutNow.length}
            sub={overdueOuts.length > 0 ? `${overdueOuts.length} overdue` : fleet.available > 0 ? `${fleet.available} available` : 'All checked out'}
            variant={overdueOuts.length > 0 ? 'red' : 'default'}
            to="/assets"
          />
          <StatTile
            label="Pre/post checklist"
            value={`${preTotal > 0 ? Math.round((preComplete / preTotal) * 100) : 0}%`}
            sub={`${preComplete}/${preTotal} pre · ${postComplete}/${postTotal} post`}
            variant={preTotal > 0 && preComplete === preTotal ? 'green' : 'default'}
            to="/pre-post"
          />
          {acaDays !== null ? (
            <StatTile
              label="ACA inspection"
              value={acaDays < 0 ? 'Past' : `${acaDays}d`}
              sub={acaDays < 0 ? 'Date has passed' : acaDays === 0 ? 'Today!' : format(new Date(season!.acaInspectionDate! + 'T00:00:00'), 'MMM d')}
              variant={acaDays < 0 ? 'red' : acaDays <= 14 ? 'amber' : 'default'}
              to="/safety"
            />
          ) : (
            <StatTile
              label="Repair costs"
              value={formatCost(totalCosts())}
              sub="This season"
              to="/issues"
            />
          )}
        </div>

        {/* ── Action required ──────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-forest">
              Action required
              {deduped.length > 0 && (
                <span className="ml-2 text-[11px] font-semibold bg-red/10 text-red px-1.5 py-0.5 rounded-full">
                  {deduped.length}
                </span>
              )}
            </h2>
            {deduped.length > 0 && (
              <p className="text-[11px] text-forest/40">
                {deduped.filter(i => i.priority === 'critical').length} critical · {deduped.filter(i => i.priority === 'warning').length} warnings
              </p>
            )}
          </div>
          <ActionQueue items={deduped} />

          {issues.filter(i => i.status !== 'resolved' && i.priority === 'normal').length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[12px] font-semibold text-forest/60">Normal priority issues</h3>
                <Link to="/issues" className="text-[11px] text-sage hover:text-sage-light flex items-center gap-0.5 transition-colors">
                  All issues <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="bg-white rounded-card border border-border overflow-hidden">
                {issues
                  .filter(i => i.status !== 'resolved' && i.priority === 'normal')
                  .slice(0, 4)
                  .map((issue, i, arr) => (
                    <Link
                      key={issue.id}
                      to="/issues"
                      onClick={() => selectIssue(issue.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-cream-dark transition-colors group ${i < arr.length - 1 ? 'border-b border-border' : ''}`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-sage shrink-0" />
                      <p className="text-[12px] text-forest flex-1 min-w-0 truncate">{issue.title}</p>
                      <p className="text-[10px] text-forest/35 shrink-0">{issue.location}</p>
                      <ChevronRight className="w-3 h-3 text-forest/25 group-hover:text-forest/50 shrink-0" />
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Pools & waterfront ───────────────────────────────────────── */}
        {activePools.length > 0 && (
          <div>
            <SectionHeader
              icon={<Droplets className="w-4 h-4 text-forest/40" />}
              title="Pools & waterfront"
              badge={closedPools.length}
              badgeRed
              to="/pool"
              linkLabel="Manage"
            />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-4">
              {activePools.map(pool => (
                <ExpandedPoolCard
                  key={pool.id}
                  pool={pool}
                  latestReading={latestReadingForPool(pool.id)}
                  recentReadings={readingsForPool(pool.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Safety & compliance ──────────────────────────────────────── */}
        <div>
          <SectionHeader
            icon={<Shield className="w-4 h-4 text-forest/40" />}
            title="Safety & compliance"
            badge={safetyStats.overdue + failedDevices.length + expiredCerts}
            badgeRed
            to="/safety"
          />
          <div className="grid grid-cols-3 gap-4">

            {/* Compliance overview */}
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[10px] font-semibold text-forest/40 uppercase tracking-wide mb-3">Compliance overview</p>
              <div className="flex items-center gap-4 mb-4">
                <div className="relative w-14 h-14 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ede9df" strokeWidth="3.5" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none"
                      stroke={ringColor} strokeWidth="3.5"
                      strokeDasharray={`${(safetyPct / 100) * circ} ${circ}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-forest">
                    {safetyPct}%
                  </span>
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-forest/50">Compliant</span>
                    <span className="font-semibold text-forest font-mono">{safetyStats.compliant}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-amber">Due soon</span>
                    <span className="font-semibold text-amber font-mono">{safetyStats.dueSoon}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-red">Overdue</span>
                    <span className="font-semibold text-red font-mono">{safetyStats.overdue}</span>
                  </div>
                  {safetyTotal > 0 && (
                    <p className="text-[10px] text-forest/30 pt-0.5">{safetyTotal} total items</p>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                {expiredCerts > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-red">Staff certs expired</span>
                    <span className="font-semibold text-red font-mono">{expiredCerts}</span>
                  </div>
                )}
                {expiringCerts > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-amber">Certs expiring soon</span>
                    <span className="font-semibold text-amber font-mono">{expiringCerts}</span>
                  </div>
                )}
                {expiredLicenses > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-red">Licenses expired</span>
                    <span className="font-semibold text-red font-mono">{expiredLicenses}</span>
                  </div>
                )}
                {expiredCerts === 0 && expiringCerts === 0 && expiredLicenses === 0 && (
                  <p className="text-[11px] text-green-muted-text font-medium">All certs & licenses current</p>
                )}
              </div>

              {nextDrill && (
                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-[10px] font-semibold text-forest/40 uppercase tracking-wide mb-1">Next drill</p>
                  <p className="text-[12px] text-forest font-medium">{DRILL_TYPE_LABELS[nextDrill.drillType as keyof typeof DRILL_TYPE_LABELS]}</p>
                  <p className="text-[11px] text-forest/40">{format(new Date(nextDrill.scheduledDate + 'T00:00:00'), 'EEEE, MMM d, yyyy')}</p>
                  {nextDrill.lead && <p className="text-[10px] text-forest/35 mt-0.5">Lead: {nextDrill.lead}</p>}
                </div>
              )}
            </div>

            {/* Items needing attention */}
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[10px] font-semibold text-forest/40 uppercase tracking-wide mb-3">Items needing attention</p>
              {failedDevices.length === 0 && overdueItems_.length === 0 ? (
                <div className="flex flex-col items-center py-6">
                  <CheckCircle2 className="w-6 h-6 text-sage mb-1.5" />
                  <p className="text-[12px] text-green-muted-text font-medium">All items current</p>
                  <p className="text-[10px] text-forest/35 mt-0.5">No failed or overdue inspections</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {failedDevices.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-red uppercase tracking-wide mb-2">Failed last inspection</p>
                      <div className="space-y-0">
                        {failedDevices.map((item, i) => (
                          <div key={item.id} className={`flex items-start gap-2 py-1.5 ${i < failedDevices.length - 1 ? 'border-b border-border' : ''}`}>
                            <div className="w-1.5 h-1.5 rounded-full bg-red shrink-0 mt-1.5" />
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium text-forest truncate">{item.name}</p>
                              <p className="text-[10px] text-forest/40">{item.location}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {overdueItems_.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-amber uppercase tracking-wide mb-2">Overdue inspections</p>
                      <div className="space-y-0">
                        {overdueItems_.slice(0, 6).map((item, i, arr) => (
                          <div key={item.id} className={`flex items-start gap-2 py-1.5 ${i < arr.length - 1 ? 'border-b border-border' : ''}`}>
                            <div className="w-1.5 h-1.5 rounded-full bg-amber shrink-0 mt-1.5" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium text-forest truncate">{item.name}</p>
                              <p className="text-[10px] text-forest/40">{item.location}</p>
                            </div>
                            {item.nextDue && (
                              <p className="text-[10px] text-red shrink-0">
                                Due {format(new Date(item.nextDue + 'T00:00:00'), 'MMM d')}
                              </p>
                            )}
                          </div>
                        ))}
                        {overdueItems_.length > 6 && (
                          <p className="text-[10px] text-forest/35 pt-1.5">+{overdueItems_.length - 6} more overdue</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Staff certifications */}
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[10px] font-semibold text-forest/40 uppercase tracking-wide mb-3">Staff certifications</p>
              {staffList.length === 0 ? (
                <p className="text-[12px] text-forest/40">No staff on file</p>
              ) : (
                <div className="overflow-y-auto max-h-[260px]">
                  {staffList.map(({ staff, certs }, i) => {
                    const hasExpired  = certs.some(c => certExpiryStatus(c.expiryDate) === 'expired');
                    const hasExpiring = certs.some(c => certExpiryStatus(c.expiryDate) === 'expiring');
                    const status = hasExpired ? 'expired' : hasExpiring ? 'expiring' : 'ok';
                    const pillCls = status === 'expired' ? 'bg-red/10 text-red' : status === 'expiring' ? 'bg-amber/10 text-amber' : 'bg-sage/10 text-sage';
                    const pillLabel = status === 'expired' ? 'Expired' : status === 'expiring' ? 'Expiring' : 'Current';
                    return (
                      <div key={staff.id} className={`flex items-center gap-2 py-1.5 ${i < staffList.length - 1 ? 'border-b border-border' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-forest truncate">{staff.name}</p>
                          <p className="text-[10px] text-forest/40">{certs.length} cert{certs.length !== 1 ? 's' : ''}</p>
                        </div>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0 ${pillCls}`}>
                          {pillLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Assets & vehicles ────────────────────────────────────────── */}
        <div>
          <SectionHeader
            icon={<Truck className="w-4 h-4 text-forest/40" />}
            title="Assets & vehicles"
            badge={overdueOuts.length + maintOverdue.length || null}
            badgeRed={overdueOuts.length > 0}
            to="/assets"
          />
          <div className="grid grid-cols-2 gap-4">

            {/* Fleet status + maintenance overdue */}
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[10px] font-semibold text-forest/40 uppercase tracking-wide mb-3">Fleet status</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Available', val: fleet.available, cls: 'text-green-muted-text' },
                  { label: 'Checked out', val: fleet.checkedOut, cls: fleet.checkedOut > 0 ? 'text-amber' : 'text-forest' },
                  { label: 'In service', val: fleet.inService, cls: 'text-forest/60' },
                ].map(({ label, val, cls }) => (
                  <div key={label} className="text-center bg-cream-dark/60 rounded-md py-2.5">
                    <p className={`font-mono text-[22px] font-semibold leading-none ${cls}`}>{val}</p>
                    <p className="text-[9px] text-forest/45 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-semibold text-forest/40 uppercase tracking-wide mb-2">Maintenance overdue</p>
                {maintOverdue.length === 0 ? (
                  <p className="text-[11px] text-green-muted-text font-medium">All service records current</p>
                ) : (
                  <div>
                    {maintOverdue.slice(0, 5).map((entry, i) => (
                      <div key={entry.record.id} className={`flex items-center gap-2 py-1.5 ${i < Math.min(maintOverdue.length, 5) - 1 ? 'border-b border-border' : ''}`}>
                        <div className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-forest truncate">{entry.asset.name}</p>
                          <p className="text-[10px] text-forest/40 truncate">
                            {SERVICE_TYPE_LABELS[entry.record.serviceType] ?? entry.record.serviceType}
                            {entry.record.nextServiceDate && ` · Due ${format(new Date(entry.record.nextServiceDate + 'T00:00:00'), 'MMM d')}`}
                          </p>
                        </div>
                      </div>
                    ))}
                    {maintOverdue.length > 5 && (
                      <p className="text-[10px] text-forest/35 pt-1.5">+{maintOverdue.length - 5} more overdue</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Currently checked out */}
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[10px] font-semibold text-forest/40 uppercase tracking-wide mb-3">
                Currently checked out
                {checkedOutNow.length > 0 && (
                  <span className="ml-1.5 font-mono">({checkedOutNow.length})</span>
                )}
              </p>
              {checkedOutNow.length === 0 ? (
                <div className="flex flex-col items-center py-6">
                  <CheckCircle2 className="w-6 h-6 text-sage mb-1.5" />
                  <p className="text-[12px] text-forest/40">All assets returned</p>
                </div>
              ) : (
                <div>
                  <div className="grid text-[10px] font-semibold text-forest/35 uppercase tracking-wide pb-1.5 border-b border-border mb-0"
                    style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                    <span>Asset</span>
                    <span>Checked out by</span>
                    <span className="text-right">Expected return</span>
                  </div>
                  {checkedOutNow.map(({ asset, checkout }) => {
                    const isOverdue = overdueOuts.some(o => o.checkout.id === checkout.id);
                    const daysOver = isOverdue
                      ? differenceInDays(today, startOfDay(new Date(checkout.expectedReturnAt)))
                      : 0;
                    return (
                      <div
                        key={checkout.id}
                        className="grid items-start py-2 border-b border-border last:border-0 gap-x-2"
                        style={{ gridTemplateColumns: '1fr 1fr auto' }}
                      >
                        <div className="min-w-0">
                          <p className={`text-[12px] font-medium truncate ${isOverdue ? 'text-red' : 'text-forest'}`}>{asset.name}</p>
                          <p className="text-[10px] text-forest/35 truncate">{asset.category}</p>
                        </div>
                        <p className="text-[11px] text-forest/65 truncate pt-0.5">{checkout.checkedOutBy}</p>
                        <div className="text-right">
                          {isOverdue ? (
                            <span className="text-[10px] font-semibold text-red bg-red/8 px-1.5 py-0.5 rounded">
                              {daysOver}d overdue
                            </span>
                          ) : (
                            <p className="text-[11px] text-forest/55">
                              {format(new Date(checkout.expectedReturnAt), 'MMM d, h:mm a')}
                            </p>
                          )}
                          <p className="text-[10px] text-forest/30 mt-0.5">
                            Out {formatDistanceToNow(new Date(checkout.checkedOutAt))}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Pre / post checklist strip ───────────────────────────────── */}
        <div className="bg-white rounded-card border border-border px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 text-forest/40" />
              <h2 className="text-[15px] font-semibold text-forest">Pre / post camp checklist</h2>
            </div>
            <Link to="/pre-post" className="text-[11px] text-sage hover:text-sage-light flex items-center gap-0.5 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {[
              { label: 'Pre-camp opening', pct: preTotal > 0 ? Math.round((preComplete / preTotal) * 100) : 0, done: preComplete, total: preTotal },
              { label: 'Post-camp closing', pct: postTotal > 0 ? Math.round((postComplete / postTotal) * 100) : 0, done: postComplete, total: postTotal },
            ].map(({ label, pct, done, total }) => (
              <div key={label}>
                <div className="flex justify-between mb-1.5">
                  <p className="text-[12px] text-forest/60">{label}</p>
                  <p className="text-[12px] font-semibold text-forest font-mono">{pct}%</p>
                </div>
                <div className="h-2 bg-cream-dark rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-sage' : pct > 50 ? 'bg-sage/70' : 'bg-amber/60'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-forest/35 mt-1">{done} of {total} tasks complete</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Upcoming deadlines ───────────────────────────────────────── */}
        {deadlineItems.length > 0 && <DeadlineStrip items={deadlineItems} />}

        {/* ── Activity feed ────────────────────────────────────────────── */}
        <ActivityFeed items={recentActivity} />

      </div>
    </div>
  );
}
