import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { IssueCard } from '@/components/shared/IssueCard';
import { useIssuesStore } from '@/store/issuesStore';
import { useChecklistStore } from '@/store/checklistStore';
import { usePoolStore, isWaterfrontType, getChemicalStatus, type ChemicalField } from '@/store/poolStore';
import { useSafetyStore, certExpiryStatus, DRILL_TYPE_LABELS } from '@/store/safetyStore';
import { useAssetStore } from '@/store/assetStore';
import { formatCost } from '@/lib/utils';
import type { CampPool, ChemicalReading, PoolEquipment, ChecklistTask, EmergencyDrill } from '@/lib/types';

type ActivityItem = {
  id: string;
  context: string;
  module: string;
  userName: string;
  action: string;
  timestamp: string;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatMini({
  label, value, hint, hintRed = false, variant = 'default', to,
}: {
  label: string;
  value: string | number;
  hint?: string;
  hintRed?: boolean;
  variant?: 'default' | 'red' | 'amber';
  to: string;
}) {
  const valColor = variant === 'red' ? 'text-red' : variant === 'amber' ? 'text-amber' : 'text-forest';
  return (
    <Link
      to={to}
      className="bg-white rounded-card border border-border px-4 py-3 flex flex-col gap-0.5 hover:border-sage/40 transition-colors"
    >
      <p className="text-[10px] font-medium text-forest/55 uppercase tracking-wide leading-none">{label}</p>
      <p className={`font-mono text-[22px] font-medium leading-tight mt-1 ${valColor}`}>{value}</p>
      {hint && (
        <p className={`text-[10px] ${hintRed ? 'text-red font-semibold' : 'text-forest/40'}`}>{hint}</p>
      )}
    </Link>
  );
}

function ReadingChip({ label, value, field }: { label: string; value: number; field: ChemicalField }) {
  const status = getChemicalStatus(field, value);
  const cls =
    status === 'alert' ? 'text-red font-semibold' :
    status === 'warn'  ? 'text-amber font-semibold' :
                         'text-forest/70';
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-forest/40 w-5 shrink-0">{label}</span>
      <span className={`text-[11px] font-mono ${cls}`}>{value}</span>
    </div>
  );
}

function PoolStatusCard({
  pool, latestReading, poolEquipment,
}: {
  pool: CampPool;
  latestReading: ChemicalReading | null;
  poolEquipment: PoolEquipment[];
}) {
  type DotColor = 'green' | 'amber' | 'red' | 'gray';
  let dot: DotColor = 'gray';
  let label = 'No data';

  if (!isWaterfrontType(pool.type)) {
    if (latestReading) {
      switch (latestReading.poolStatus) {
        case 'open_all_clear':    dot = 'green'; label = 'Open – all clear'; break;
        case 'open_monitoring':   dot = 'amber'; label = 'Open – monitoring'; break;
        case 'closed_corrective': dot = 'red';   label = 'Closed';           break;
        case 'closed_retest':     dot = 'red';   label = 'Closed – retest';  break;
      }
    }
  } else {
    const hasAlert = poolEquipment.some(e => e.status === 'alert');
    const hasWarn  = poolEquipment.some(e => e.status === 'warn');
    if (hasAlert)                   { dot = 'red';   label = 'Equipment alert'; }
    else if (hasWarn)               { dot = 'amber'; label = 'Monitoring'; }
    else if (poolEquipment.length)  { dot = 'green'; label = 'All clear'; }
  }

  const dotCls: Record<DotColor, string> = {
    green: 'bg-sage', amber: 'bg-amber', red: 'bg-red', gray: 'bg-border',
  };
  const labelCls: Record<DotColor, string> = {
    green: 'text-green-muted-text', amber: 'text-amber', red: 'text-red', gray: 'text-forest/40',
  };

  return (
    <div className="bg-white rounded-card border border-border px-4 py-3 shrink-0 w-44">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotCls[dot]}`} />
        <p className="text-[12px] font-semibold text-forest truncate">{pool.name}</p>
      </div>
      <p className={`text-[10px] font-medium mb-2 ${labelCls[dot]}`}>{label}</p>

      {!isWaterfrontType(pool.type) && latestReading && (
        <div className="space-y-0.5 mb-2">
          <ReadingChip label="Cl" value={latestReading.freeChlorine} field="freeChlorine" />
          <ReadingChip label="pH" value={latestReading.ph} field="ph" />
        </div>
      )}

      {latestReading ? (
        <p className="text-[9px] text-forest/35">
          {formatDistanceToNow(new Date(latestReading.readingTime), { addSuffix: true })}
        </p>
      ) : (
        <p className="text-[9px] text-forest/30">No readings yet</p>
      )}
    </div>
  );
}

function PrePostCard({
  preCompletePct, preComplete, preTotal,
  postCompletePct, postComplete, postTotal,
  preTasks,
}: {
  preCompletePct: number; preComplete: number; preTotal: number;
  postCompletePct: number; postComplete: number; postTotal: number;
  preTasks: ChecklistTask[];
}) {
  return (
    <div className="bg-white rounded-card border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-forest">Pre/Post camp</h3>
        <Link to="/pre-post" className="text-[11px] text-sage hover:text-sage-light flex items-center gap-1 transition-colors">
          View <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2.5 mb-3">
        {([
          { label: 'Pre-camp',  pct: preCompletePct,  done: preComplete,  total: preTotal,  bar: 'bg-sage' },
          { label: 'Post-camp', pct: postCompletePct, done: postComplete, total: postTotal, bar: 'bg-sage/50' },
        ] as const).map(({ label, pct, done, total, bar }) => (
          <div key={label}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-forest/60">{label}</span>
              <span className="font-semibold text-forest">{pct}%</span>
            </div>
            <div className="h-1.5 bg-cream-dark rounded-full overflow-hidden">
              <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
            {total > 0 && (
              <p className="text-[10px] text-forest/40 mt-0.5">{done} of {total} complete</p>
            )}
          </div>
        ))}
      </div>

      {preTasks.length > 0 && (
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-[10px] font-medium text-forest/50 uppercase tracking-wide">Upcoming pre-camp</p>
          {preTasks.map(task => (
            <Link key={task.id} to="/pre-post" className="flex items-center gap-2 group">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                task.priority === 'urgent' ? 'bg-red' :
                task.priority === 'high'   ? 'bg-amber' : 'bg-sage'
              }`} />
              <span className="text-[11px] text-forest/70 truncate group-hover:text-forest transition-colors">
                {task.title}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SafetyCard({
  overdue, dueSoon, compliant, nextDrill, expiredCerts,
}: {
  overdue: number; dueSoon: number; compliant: number;
  nextDrill: EmergencyDrill | null; expiredCerts: number;
}) {
  const total = overdue + dueSoon + compliant;
  const pct   = total > 0 ? Math.round((compliant / total) * 100) : 100;
  const circumference = 2 * Math.PI * 15.9;
  const ringColor = overdue > 0 ? '#c0392b' : dueSoon > 0 ? '#c47d08' : '#7aab6e';

  return (
    <div className="bg-white rounded-card border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-forest">Safety & compliance</h3>
        <Link to="/safety" className="text-[11px] text-sage hover:text-sage-light flex items-center gap-1 transition-colors">
          View <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="relative w-12 h-12 shrink-0">
          <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ede9df" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.9" fill="none"
              stroke={ringColor}
              strokeWidth="3"
              strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-forest">
            {pct}%
          </span>
        </div>
        <div className="space-y-0.5">
          {overdue > 0 && (
            <p className="text-[11px] text-red font-semibold">{overdue} item{overdue !== 1 ? 's' : ''} overdue</p>
          )}
          {dueSoon > 0 && (
            <p className="text-[11px] text-amber">{dueSoon} due soon</p>
          )}
          {expiredCerts > 0 && (
            <p className="text-[11px] text-red">{expiredCerts} cert{expiredCerts !== 1 ? 's' : ''} expired</p>
          )}
          {overdue === 0 && dueSoon === 0 && expiredCerts === 0 && (
            <p className="text-[11px] text-green-muted-text font-medium">All compliant</p>
          )}
          {total > 0 && (
            <p className="text-[10px] text-forest/40">{compliant} of {total} current</p>
          )}
        </div>
      </div>

      {nextDrill && (
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-forest/50 uppercase tracking-wide mb-1">Next drill</p>
          <p className="text-[11px] text-forest font-medium truncate">{DRILL_TYPE_LABELS[nextDrill.drillType]}</p>
          <p className="text-[10px] text-forest/45">
            {format(new Date(nextDrill.scheduledDate + 'T00:00:00'), 'MMM d, yyyy')}
          </p>
        </div>
      )}
    </div>
  );
}

function FleetCard({
  available, checkedOut, inService, overdueCount, maintOverdue,
}: {
  available: number; checkedOut: number; inService: number;
  overdueCount: number; maintOverdue: number;
}) {
  return (
    <div className="bg-white rounded-card border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-forest">Assets & fleet</h3>
        <Link to="/assets" className="text-[11px] text-sage hover:text-sage-light flex items-center gap-1 transition-colors">
          View <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {([
          { label: 'Available', val: available, amber: false },
          { label: 'Out',       val: checkedOut, amber: checkedOut > 0 },
          { label: 'In service', val: inService, amber: false },
        ] as const).map(({ label, val, amber }) => (
          <div key={label} className="text-center">
            <p className={`font-mono text-[18px] font-medium leading-none ${amber ? 'text-amber' : 'text-forest'}`}>
              {val}
            </p>
            <p className="text-[10px] text-forest/50 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-3 space-y-0.5">
        {overdueCount > 0 && (
          <p className="text-[11px] text-red font-semibold">
            {overdueCount} checkout{overdueCount !== 1 ? 's' : ''} overdue
          </p>
        )}
        {maintOverdue > 0 && (
          <p className="text-[11px] text-amber">
            {maintOverdue} maintenance overdue
          </p>
        )}
        {overdueCount === 0 && maintOverdue === 0 && (
          <p className="text-[11px] text-green-muted-text font-medium">All clear</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function Dashboard() {
  const [activityOpen, setActivityOpen] = useState(false);

  const { issues, urgentCount, openCount, totalCosts, selectIssue } = useIssuesStore();
  const { tasks, completionPercent, season } = useChecklistStore();
  const { pools, chemicalReadings, equipment } = usePoolStore();
  const { allStats, nextScheduledDrill, certifications, licenses } = useSafetyStore();
  const { assets, checkouts, fleetStats, overdueCheckouts, currentlyCheckedOut, maintenanceOverdue } = useAssetStore();

  // ── Issues ──
  const openIssues = issues
    .filter(i => i.status !== 'resolved')
    .sort((a, b) => ({ urgent: 0, high: 1, normal: 2 }[a.priority] - { urgent: 0, high: 1, normal: 2 }[b.priority]))
    .slice(0, 5);

  // ── Checklist ──
  const preCompletePct  = completionPercent('pre');
  const postCompletePct = completionPercent('post');
  const preTotal    = tasks.filter(t => t.phase === 'pre').length;
  const preComplete  = tasks.filter(t => t.phase === 'pre' && t.status === 'complete').length;
  const postTotal   = tasks.filter(t => t.phase === 'post').length;
  const postComplete = tasks.filter(t => t.phase === 'post' && t.status === 'complete').length;
  const preTasks = tasks
    .filter(t => t.phase === 'pre' && t.status !== 'complete')
    .sort((a, b) => (a.dueDate && b.dueDate ? new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() : 0))
    .slice(0, 3);

  // ── Safety ──
  const safetyStats   = allStats();
  const nextDrill     = nextScheduledDrill();
  const expiredCerts   = certifications.filter(c => certExpiryStatus(c.expiryDate) === 'expired').length;
  const expiringCerts  = certifications.filter(c => certExpiryStatus(c.expiryDate) === 'expiring').length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiredLicenses = licenses.filter(
    l => l.expiryDate && new Date(l.expiryDate + 'T00:00:00') < today
  ).length;

  // ── Assets ──
  const fleet            = fleetStats();
  const overdueOuts      = overdueCheckouts();
  const checkedOutNow    = currentlyCheckedOut();
  const maintOverdueList = maintenanceOverdue();

  // ── ACA countdown ──
  const acaDays = season?.acaInspectionDate
    ? differenceInDays(new Date(season.acaInspectionDate + 'T00:00:00'), new Date())
    : null;

  // ── Pool helpers ──
  const latestReadingForPool = (poolId: string): ChemicalReading | null =>
    chemicalReadings
      .filter(r => r.poolId === poolId)
      .sort((a, b) => new Date(b.readingTime).getTime() - new Date(a.readingTime).getTime())[0] ?? null;

  const equipmentForPool = (poolId: string): PoolEquipment[] =>
    equipment.filter(e => e.poolId === poolId);

  const activePools = pools.filter(p => p.isActive);

  // ── Alert strip ──
  type AlertItem = { id: string; label: string; to: string; red: boolean };
  const alerts: AlertItem[] = [];

  if (urgentCount() > 0)
    alerts.push({ id: 'urgent', label: `${urgentCount()} urgent issue${urgentCount() !== 1 ? 's' : ''}`, to: '/issues', red: true });
  if (safetyStats.overdue > 0)
    alerts.push({ id: 'safety-overdue', label: `${safetyStats.overdue} safety item${safetyStats.overdue !== 1 ? 's' : ''} overdue`, to: '/safety', red: true });
  if (expiredCerts > 0)
    alerts.push({ id: 'certs-expired', label: `${expiredCerts} staff cert${expiredCerts !== 1 ? 's' : ''} expired`, to: '/safety', red: true });
  if (expiredLicenses > 0)
    alerts.push({ id: 'licenses-expired', label: `${expiredLicenses} license${expiredLicenses !== 1 ? 's' : ''} expired`, to: '/safety', red: true });

  const closedPools = activePools.filter(p => {
    if (isWaterfrontType(p.type)) return equipmentForPool(p.id).some(e => e.status === 'alert');
    const r = latestReadingForPool(p.id);
    return r && (r.poolStatus === 'closed_corrective' || r.poolStatus === 'closed_retest');
  });
  if (closedPools.length > 0)
    alerts.push({ id: 'pools-closed', label: `${closedPools.length} pool${closedPools.length !== 1 ? 's' : ''} closed`, to: '/pool', red: true });
  if (overdueOuts.length > 0)
    alerts.push({ id: 'checkouts-overdue', label: `${overdueOuts.length} checkout${overdueOuts.length !== 1 ? 's' : ''} overdue`, to: '/assets', red: false });
  if (expiringCerts > 0)
    alerts.push({ id: 'certs-expiring', label: `${expiringCerts} cert${expiringCerts !== 1 ? 's' : ''} expiring soon`, to: '/safety', red: false });

  alerts.sort((a, b) => (a.red === b.red ? 0 : a.red ? -1 : 1));

  // ── Activity feed ──
  const allActivity: ActivityItem[] = [];

  issues.forEach(issue =>
    issue.activityLog.forEach(e =>
      allActivity.push({ id: e.id, context: issue.title, module: 'Issue', userName: e.userName, action: e.action, timestamp: e.timestamp })
    )
  );
  tasks.forEach(task =>
    task.activityLog.forEach(e =>
      allActivity.push({ id: e.id, context: task.title, module: 'Checklist', userName: e.userName, action: e.action, timestamp: e.timestamp })
    )
  );
  chemicalReadings.forEach(r => {
    const pool = pools.find(p => p.id === r.poolId);
    if (pool) allActivity.push({
      id: `chem-${r.id}`,
      context: pool.name,
      module: 'Pool',
      userName: r.loggedByName,
      action: 'logged a reading for',
      timestamp: r.readingTime,
    });
  });
  checkouts
    .slice()
    .sort((a, b) => new Date(b.checkedOutAt).getTime() - new Date(a.checkedOutAt).getTime())
    .slice(0, 30)
    .forEach(c => {
      const asset = assets.find(a => a.id === c.assetId);
      allActivity.push({
        id: `co-${c.id}`,
        context: asset?.name ?? 'Unknown asset',
        module: 'Asset',
        userName: c.checkedOutBy,
        action: 'checked out',
        timestamp: c.checkedOutAt,
      });
    });

  allActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const recentActivity = allActivity.slice(0, 15);

  const subtitle = season
    ? `${season.name} · ${format(new Date(), 'EEEE, MMMM d, yyyy')}`
    : format(new Date(), 'EEEE, MMMM d, yyyy');

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar title="Dashboard" subtitle={subtitle} />

      <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">

        {/* Alert strip — only visible when something needs attention */}
        {alerts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {alerts.map(a => (
              <Link
                key={a.id}
                to={a.to}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[11px] font-semibold border transition-opacity hover:opacity-80 ${
                  a.red
                    ? 'bg-red-bg text-red border-red/20'
                    : 'bg-amber-bg text-amber border-amber/20'
                }`}
              >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {a.label}
              </Link>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-5 gap-3">
          <StatMini
            label="Urgent issues"
            value={urgentCount()}
            variant={urgentCount() > 0 ? 'red' : 'default'}
            to="/issues"
          />
          <StatMini label="Open issues" value={openCount()} to="/issues" />
          <StatMini
            label="Safety overdue"
            value={safetyStats.overdue}
            hint={safetyStats.dueSoon > 0 ? `${safetyStats.dueSoon} due soon` : undefined}
            variant={safetyStats.overdue > 0 ? 'red' : 'default'}
            to="/safety"
          />
          <StatMini
            label="Assets out"
            value={checkedOutNow.length}
            hint={overdueOuts.length > 0 ? `${overdueOuts.length} overdue` : undefined}
            hintRed={overdueOuts.length > 0}
            to="/assets"
          />
          {acaDays !== null ? (
            <StatMini
              label="ACA inspection"
              value={acaDays < 0 ? 'Past' : `${acaDays}d`}
              hint={acaDays < 0 ? 'Date has passed' : 'Days remaining'}
              variant={acaDays < 0 ? 'red' : acaDays <= 30 ? 'amber' : 'default'}
              to="/safety"
            />
          ) : (
            <StatMini label="Repair costs" value={formatCost(totalCosts())} hint="This session" to="/issues" />
          )}
        </div>

        {/* Main two-column body */}
        <div className="flex gap-5 items-start">

          {/* Left: open issues */}
          <div className="flex-[3] min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-forest">Open issues</h2>
              <Link
                to="/issues"
                className="text-[12px] text-sage font-medium hover:text-sage-light flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {openIssues.length === 0 ? (
              <div className="bg-white rounded-card border border-border p-8 text-center">
                <p className="text-[32px] mb-2">🌲</p>
                <p className="text-[13px] text-forest/50">No open issues right now</p>
              </div>
            ) : (
              <div className="space-y-2">
                {openIssues.map(issue => (
                  <Link key={issue.id} to="/issues" onClick={() => selectIssue(issue.id)}>
                    <IssueCard issue={issue} selected={false} onClick={() => selectIssue(issue.id)} compact />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Right: module summary cards */}
          <div className="flex-[2] min-w-0 space-y-3">
            <PrePostCard
              preCompletePct={preCompletePct} preComplete={preComplete} preTotal={preTotal}
              postCompletePct={postCompletePct} postComplete={postComplete} postTotal={postTotal}
              preTasks={preTasks}
            />
            <SafetyCard
              overdue={safetyStats.overdue}
              dueSoon={safetyStats.dueSoon}
              compliant={safetyStats.compliant}
              nextDrill={nextDrill}
              expiredCerts={expiredCerts}
            />
            <FleetCard
              available={fleet.available}
              checkedOut={fleet.checkedOut}
              inService={fleet.inService}
              overdueCount={overdueOuts.length}
              maintOverdue={maintOverdueList.length}
            />
          </div>
        </div>

        {/* Pool status row */}
        {activePools.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-forest">Pools & waterfront</h2>
              <Link
                to="/pool"
                className="text-[12px] text-sage font-medium hover:text-sage-light flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {activePools.map(pool => (
                <PoolStatusCard
                  key={pool.id}
                  pool={pool}
                  latestReading={latestReadingForPool(pool.id)}
                  poolEquipment={equipmentForPool(pool.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Activity feed — collapsible, unobtrusive by default */}
        <div className="pb-2">
          <button
            onClick={() => setActivityOpen(v => !v)}
            className="flex items-center gap-2 mb-2 text-[12px] text-forest/50 hover:text-forest/70 transition-colors"
          >
            {activityOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span className="font-medium">Recent activity</span>
            {!activityOpen && recentActivity.length > 0 && (
              <span className="text-forest/35">{recentActivity.length} events</span>
            )}
          </button>

          {activityOpen && (
            <div className="bg-white rounded-card border border-border divide-y divide-border">
              {recentActivity.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-forest/40">No activity yet</p>
              ) : recentActivity.map(item => (
                <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-cream-dark flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[9px] font-bold text-forest/60 uppercase">
                      {item.userName.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-forest">
                      <span className="font-semibold">{item.userName}</span>{' '}
                      <span className="text-forest/55">{item.action}</span>
                    </p>
                    <p className="text-[11px] text-forest/40 truncate">
                      <span className="font-medium">{item.module}</span>: {item.context}
                    </p>
                  </div>
                  <p className="text-[10px] text-forest/35 shrink-0 whitespace-nowrap pt-0.5">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
