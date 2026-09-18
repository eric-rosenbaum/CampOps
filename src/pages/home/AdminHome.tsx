import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { format, differenceInDays, addDays, startOfDay } from 'date-fns';
import { Trans, useTranslation } from 'react-i18next';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Shield, Droplets,
  Truck, Users, Calendar, ChevronRight,
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
import { formatCost, parseDateStr, relativeTime } from '@/lib/utils';
import { useModules } from '@/lib/modules';
import { useLang } from '@/lib/language';
import type { Lang } from '@/i18n';
import { translateActivity } from '@/i18n/activity';
import { TranslatedText } from '@/components/i18n/TranslatedText';
import type { CampPool, ChemicalReading } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionPriority = 'critical' | 'warning' | 'info';
/** The module a row comes from. Also its translation key under `modules.`. */
type ModuleId = 'Issue' | 'Pool' | 'Safety' | 'Fleet' | 'Checklist' | 'Cert';
type ActionItem = { id: string; priority: ActionPriority; module: ModuleId; label: ReactNode; to: string };
type DeadlineItem = { id: string; dateStr: string; label: string; sub: string; module: ModuleId; overdue: boolean };
type ActivityItem = { id: string; module: ModuleId; userName: string; timestamp: string; sentence: ReactNode };

// ─── Dates in the reader's language ───────────────────────────────────────────
// English keeps the exact date-fns output it always had; Spanish and Hebrew go through Intl,
// which puts the day first and never says "3pm". Calendar-day strings are parsed with
// parseDateStr (local midnight), never as UTC.

const INTL_TAG: Record<Lang, string> = { en: 'en-US', es: 'es', he: 'he-IL' };
type DayStyle = 'short' | 'full' | 'weekdayShort' | 'dayTime';
const EN_PATTERN: Record<DayStyle, string> = {
  short: 'MMM d', full: 'EEEE, MMMM d, yyyy', weekdayShort: 'EEEE, MMM d, yyyy', dayTime: 'MMM d, h:mm a',
};
const INTL_OPTS: Record<DayStyle, Intl.DateTimeFormatOptions> = {
  short: { month: 'short', day: 'numeric' },
  full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  weekdayShort: { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' },
  dayTime: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
};
function fmtDay(d: Date, style: DayStyle, lang: Lang): string {
  if (lang === 'en') return format(d, EN_PATTERN[style]);
  return new Intl.DateTimeFormat(INTL_TAG[lang], INTL_OPTS[style]).format(d);
}

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
  label, value, sub, variant = 'default', to, hidden = false,
}: {
  label: string; value: string | number; sub?: string;
  variant?: 'default' | 'red' | 'amber' | 'green'; to: string;
  /** The tile's module is off for this camp. Its link would bounce straight back to here. */
  hidden?: boolean;
}) {
  if (hidden) return null;
  const valCls = variant === 'red' ? 'text-red' : variant === 'amber' ? 'text-amber' : variant === 'green' ? 'text-green-muted-text' : 'text-forest';
  const bg = variant === 'red' ? 'bg-red-bg/50 border-red/25' : variant === 'amber' ? 'bg-amber-bg/50 border-amber/25' : 'bg-white border-border';
  return (
    <Link to={to} className={`rounded-card border px-4 py-3.5 flex flex-col hover:shadow-sm transition-all group ${bg}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint leading-none mb-1.5">{label}</p>
      <p className={`font-mono text-[26px] font-semibold leading-none ${valCls}`}>{value}</p>
      {sub && (
        <p className={`text-[10px] mt-1.5 ${variant === 'red' ? 'text-red/70 font-medium' : variant === 'amber' ? 'text-amber/80 font-medium' : 'text-ink-faint'}`}>
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

const MODULE_BADGE: Record<ModuleId, string> = {
  Issue:     'bg-red/8 text-red/80 border border-red/15',
  Pool:      'bg-blue-50 text-blue-600 border border-blue-100',
  Safety:    'bg-amber/10 text-amber border border-amber/20',
  Fleet:     'bg-forest/8 text-ink-soft border border-forest/10',
  Checklist: 'bg-sage/10 text-sage border border-sage/20',
  Cert:      'bg-purple-50 text-purple-600 border border-purple-100',
};

function ActionQueue({ items }: { items: ActionItem[] }) {
  const { t } = useTranslation('home');
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-card border border-border flex flex-col items-center justify-center py-10">
        <CheckCircle2 className="w-7 h-7 text-sage mb-2" />
        <p className="text-[13px] font-semibold text-forest mb-0.5">{t('admin.queue.allClear')}</p>
        <p className="text-[11px] text-ink-faint">{t('admin.queue.empty')}</p>
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
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${MODULE_BADGE[item.module] ?? 'bg-cream text-ink-soft'}`}>
            {t(`modules.${item.module}`)}
          </span>
          <ChevronRight className="w-3 h-3 text-forest/25 group-hover:text-ink-soft transition-colors shrink-0 rtl:-scale-x-100" />
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
  const { t } = useTranslation('home');
  type Dot = 'green' | 'amber' | 'red' | 'gray';
  let dot: Dot = 'gray';
  let statusLabel = t('admin.pool.noReading');

  if (!isWaterfrontType(pool.type) && latestReading) {
    switch (latestReading.poolStatus) {
      case 'open_all_clear':    dot = 'green'; statusLabel = t('admin.pool.openAllClear'); break;
      case 'open_monitoring':   dot = 'amber'; statusLabel = t('admin.pool.openMonitoring'); break;
      case 'closed_corrective': dot = 'red';   statusLabel = t('admin.pool.closedCorrective'); break;
      case 'closed_retest':     dot = 'red';   statusLabel = t('admin.pool.closedRetest'); break;
    }
  } else if (isWaterfrontType(pool.type)) {
    dot = 'green'; statusLabel = t('admin.pool.waterfrontArea');
  }

  const dotBg: Record<Dot, string> = { green: 'bg-sage', amber: 'bg-amber', red: 'bg-red', gray: 'bg-border' };
  const statusCls: Record<Dot, string> = {
    green: 'text-green-muted-text', amber: 'text-amber', red: 'text-red font-semibold', gray: 'text-ink-faint',
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
        <div className="min-w-0 flex-1 pe-3">
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
                <th className="text-start text-[9px] font-semibold text-ink-faint uppercase tracking-wide pb-1.5 pe-2">{t('admin.pool.chemical')}</th>
                <th className="text-end text-[9px] font-semibold text-ink-faint uppercase tracking-wide pb-1.5 pe-2">{t('admin.pool.reading')}</th>
                <th className="text-end text-[9px] font-semibold text-ink-faint uppercase tracking-wide pb-1.5 pe-2">{t('admin.pool.range')}</th>
                <th className="text-end text-[9px] font-semibold text-ink-faint uppercase tracking-wide pb-1.5">{t('admin.pool.status')}</th>
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
                    <td className="py-1.5 pe-2 text-[11px] text-ink-soft">{range.label}</td>
                    <td dir="ltr" className={`py-1.5 pe-2 text-end font-mono text-[12px] font-semibold ${status === 'alert' ? 'text-red' : status === 'warn' ? 'text-amber' : 'text-forest'}`}>
                      {displayed}{range.unit}
                    </td>
                    <td dir="ltr" className="py-1.5 pe-2 text-end text-[10px] text-forest/30">
                      {range.min}–{range.max}{range.unit}
                    </td>
                    <td className="py-1.5 text-end">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase ${statusPillCls[status]}`}>
                        {status === 'ok' ? t('admin.pool.ok') : status === 'warn' ? t('admin.pool.warn') : t('admin.pool.alert')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sparkValues.length >= 2 && (
            <div className="mt-3 pt-2.5 border-t border-border/50">
              <p className="text-[9px] text-ink-faint mb-1">{t('admin.pool.sparkline', { count: sparkValues.length })}</p>
              <Sparkline values={sparkValues} field="freeChlorine" />
            </div>
          )}
        </div>
      )}

      {isWaterfrontType(pool.type) && (
        <div className="px-4 py-4">
          <p className="text-[11px] text-ink-faint">{t('admin.pool.waterfrontNote')}</p>
        </div>
      )}

      {!isWaterfrontType(pool.type) && !latestReading && (
        <div className="px-4 py-4">
          <p className="text-[11px] text-ink-faint">{t('admin.pool.noReadingsYet')}</p>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border bg-cream-dark/30">
        <p className="text-[9px] text-ink-faint">
          {latestReading
            ? t('admin.pool.lastLogged', { when: relativeTime(latestReading.readingTime), name: latestReading.loggedByName })
            : t('admin.pool.noneOnFile')}
        </p>
      </div>
    </div>
  );
}

// ─── Deadline strip ───────────────────────────────────────────────────────────

function DeadlineStrip({ items }: { items: DeadlineItem[] }) {
  const { t } = useTranslation('home');
  const lang = useLang();
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-ink-faint" />
          <h2 className="text-[15px] font-semibold text-forest">{t('admin.deadlines.title')}</h2>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {items.map(item => {
          const date = item.dateStr.includes('T') ? new Date(item.dateStr) : parseDateStr(item.dateStr);
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
                <p className={`font-mono text-[11px] font-semibold ${isPast ? 'text-red' : isToday ? 'text-amber' : 'text-ink-soft'}`}>
                  {isPast ? t('admin.deadlines.overdue') : isToday ? t('admin.deadlines.today') : fmtDay(date, 'short', lang)}
                </p>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${MODULE_BADGE[item.module] ?? 'bg-cream text-ink-soft'}`}>
                  {t(`modules.${item.module}`)}
                </span>
              </div>
              <p className={`text-[12px] font-medium leading-snug ${isPast ? 'text-red' : 'text-forest'}`}>{item.label}</p>
              <p className="text-[10px] text-ink-faint mt-0.5">{item.sub}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

const MOD_DOT: Record<ModuleId, string> = {
  Issue:     'bg-red/60',
  Pool:      'bg-blue-400',
  Safety:    'bg-amber',
  Fleet:     'bg-forest/50',
  Checklist: 'bg-sage',
  Cert:      'bg-purple-400',
};

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const { t } = useTranslation('home');
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-ink-faint" />
          <h2 className="text-[15px] font-semibold text-forest">{t('admin.feed.title')}</h2>
        </div>
        <p className="text-[11px] text-ink-faint">{t('admin.feed.sub')}</p>
      </div>
      <div className="bg-white rounded-card border border-border overflow-hidden">
        {items.length === 0 ? (
          <p className="text-center text-[12px] text-ink-faint py-8">{t('admin.feed.empty')}</p>
        ) : (
          items.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 px-4 py-3 ${i < items.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="w-6 h-6 rounded-full bg-cream-dark flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-bold text-ink-soft uppercase">
                  {item.userName.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-forest leading-snug">{item.sentence}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full ${MOD_DOT[item.module] ?? 'bg-forest/30'}`} />
                <p className="text-[10px] text-ink-faint whitespace-nowrap">
                  {relativeTime(item.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** "Maria logged a reading for Main Pool": one sentence, so each language can order it. */
function FeedSentence({ i18nKey, name, thing }: {
  i18nKey: 'admin.feed.poolReading' | 'admin.feed.checkedOut' | 'admin.feed.returned';
  name: string; thing: string;
}) {
  const { t } = useTranslation('home');
  return (
    <Trans
      t={t}
      i18nKey={i18nKey}
      values={{ name, thing }}
      components={{
        name: <span className="font-semibold" />,
        muted: <span className="text-ink-soft" />,
        thing: <span className="text-ink" />,
      }}
    />
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon, title, badge, badgeRed = false, to, linkLabel,
}: {
  icon: React.ReactNode; title: string; badge?: number | null;
  badgeRed?: boolean; to: string; linkLabel?: string;
}) {
  const { t } = useTranslation('home');
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
        {linkLabel ?? t('admin.view')} <ArrowRight className="w-3 h-3 rtl:-scale-x-100" />
      </Link>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function AdminHome() {
  const { t } = useTranslation('home');
  const lang = useLang();
  const modules = useModules();
  // ── Stores ────────────────────────────────────────────────────────────────
  const { issues, urgentCount, openCount, totalCosts, selectIssue } = useIssuesStore();
  const { season } = useChecklistStore();
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
  const expiredLicenses = licenses.filter(l => l.expiryDate && parseDateStr(l.expiryDate) < today).length;

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
    ? differenceInDays(parseDateStr(season.acaInspectionDate), today)
    : null;

  // ── Alert pills ──────────────────────────────────────────────────────────
  type AlertPill = { id: string; label: string; to: string; red: boolean };
  const alertPills: AlertPill[] = [];
  if (urgentCount() > 0)       alertPills.push({ id: 'urgent',    label: t('admin.pills.urgent', { count: urgentCount() }),              to: '/campground', red: true });
  if (closedPools.length > 0)  alertPills.push({ id: 'closed-pools', label: t('admin.pills.poolsClosed', { count: closedPools.length }), to: '/pool',   red: true });
  if (safetyStats.overdue > 0) alertPills.push({ id: 'safety',    label: t('admin.pills.safetyOverdue', { count: safetyStats.overdue }),  to: '/safety', red: true });
  if (expiredCerts > 0)        alertPills.push({ id: 'certs',     label: t('admin.pills.certsExpired', { count: expiredCerts }),         to: '/safety', red: true });
  if (expiredLicenses > 0)     alertPills.push({ id: 'licenses',  label: t('admin.pills.licensesExpired', { count: expiredLicenses }),   to: '/safety', red: true });

  if (overdueOuts.length > 0)  alertPills.push({ id: 'overdue-checkouts', label: t('admin.pills.checkoutsOverdue', { count: overdueOuts.length }), to: '/assets', red: false });
  if (expiringCerts > 0)       alertPills.push({ id: 'expiring',  label: t('admin.pills.certsExpiring', { count: expiringCerts }),       to: '/safety', red: false });
  alertPills.sort((a, b) => (a.red === b.red ? 0 : a.red ? -1 : 1));

  // ── Action queue ─────────────────────────────────────────────────────────
  const actionItems: ActionItem[] = [];

  issues.filter(i => i.status !== 'resolved' && i.priority === 'urgent').slice(0, 3).forEach(issue =>
    actionItems.push({
      id: `iss-${issue.id}`, priority: 'critical', module: 'Issue', to: '/campground',
      label: (
        <Trans
          t={t}
          i18nKey="admin.actions.urgentIssue"
          components={{ item: <TranslatedText source="issues" id={issue.id} field="title" text={issue.title} /> }}
        />
      ),
    })
  );
  closedPools.forEach(p =>
    actionItems.push({ id: `pool-${p.id}`, priority: 'critical', module: 'Pool', label: t('admin.actions.poolClosed', { pool: p.name }), to: '/pool' })
  );
  overdueItems_.slice(0, 3).forEach(item =>
    actionItems.push({ id: `saf-${item.id}`, priority: 'critical', module: 'Safety', label: t('admin.actions.inspectionOverdue', { name: item.name, location: item.location }), to: '/safety' })
  );
  overdueOuts.slice(0, 3).forEach(({ asset, checkout }) => {
    const daysOver = differenceInDays(today, startOfDay(new Date(checkout.expectedReturnAt)));
    actionItems.push({ id: `co-${checkout.id}`, priority: 'critical', module: 'Fleet', label: t('admin.actions.checkoutOverdue', { asset: asset.name, count: daysOver, person: checkout.checkedOutBy }), to: '/assets' });
  });
  failedDevices.slice(0, 2).forEach(item =>
    actionItems.push({ id: `fail-${item.id}`, priority: 'critical', module: 'Safety', label: t('admin.actions.reinspect', { name: item.name, location: item.location }), to: '/safety' })
  );
  certifications.filter(c => certExpiryStatus(c.expiryDate) === 'expired').slice(0, 2).forEach(cert =>
    actionItems.push({ id: `cert-${cert.id}`, priority: 'critical', module: 'Cert', label: t('admin.actions.certExpired', { cert: CERT_TYPE_LABELS[cert.certType as keyof typeof CERT_TYPE_LABELS] }), to: '/safety' })
  );
  issues.filter(i => i.status !== 'resolved' && i.priority === 'high').slice(0, 3).forEach(issue =>
    actionItems.push({ id: `iss-h-${issue.id}`, priority: 'warning', module: 'Issue', label: <TranslatedText source="issues" id={issue.id} field="title" text={issue.title} />, to: '/campground' })
  );
  maintOverdue.slice(0, 2).forEach(({ asset, record }) =>
    actionItems.push({ id: `maint-${record.id}`, priority: 'warning', module: 'Fleet', label: t('admin.actions.maintOverdue', { asset: asset.name, service: SERVICE_TYPE_LABELS[record.serviceType] ?? t('admin.actions.service') }), to: '/assets' })
  );
  certifications.filter(c => certExpiryStatus(c.expiryDate) === 'expiring').slice(0, 2).forEach(cert =>
    actionItems.push({ id: `certw-${cert.id}`, priority: 'warning', module: 'Cert', label: t('admin.actions.certExpiring', { cert: CERT_TYPE_LABELS[cert.certType as keyof typeof CERT_TYPE_LABELS] }), to: '/safety' })
  );
  drills
    .filter(d => d.status === 'scheduled' && differenceInDays(parseDateStr(d.scheduledDate), today) <= 7 && differenceInDays(parseDateStr(d.scheduledDate), today) >= 0)
    .slice(0, 2)
    .forEach(drill =>
      actionItems.push({ id: `drill-${drill.id}`, priority: 'info', module: 'Safety', label: t('admin.actions.drill', { drill: DRILL_TYPE_LABELS[drill.drillType as keyof typeof DRILL_TYPE_LABELS], date: fmtDay(parseDateStr(drill.scheduledDate), 'short', lang) }), to: '/safety' })
    );

  const seen = new Set<string>();
  const deduped = actionItems.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; }).slice(0, 12);

  // ── Deadline strip ───────────────────────────────────────────────────────
  const deadlineItems: DeadlineItem[] = [];
  const in14 = addDays(today, 14);

  safetyItems
    .filter(item => item.nextDue && parseDateStr(item.nextDue) <= in14)
    .forEach(item =>
      deadlineItems.push({ id: `sdue-${item.id}`, dateStr: item.nextDue!, label: item.name, sub: item.location, module: 'Safety', overdue: parseDateStr(item.nextDue!) < today })
    );
  drills
    .filter(d => d.status === 'scheduled' && parseDateStr(d.scheduledDate) <= in14)
    .forEach(drill =>
      deadlineItems.push({ id: `ddrill-${drill.id}`, dateStr: drill.scheduledDate, label: DRILL_TYPE_LABELS[drill.drillType as keyof typeof DRILL_TYPE_LABELS], sub: drill.lead ? t('admin.deadlines.lead', { name: drill.lead }) : t('admin.deadlines.noLead'), module: 'Safety', overdue: false })
    );
  assets
    .filter(a => a.registrationExpiry && parseDateStr(a.registrationExpiry) <= in14)
    .forEach(asset =>
      deadlineItems.push({ id: `areg-${asset.id}`, dateStr: asset.registrationExpiry!, label: t('admin.deadlines.registration', { asset: asset.name }), sub: asset.licensePlate ?? asset.category, module: 'Fleet', overdue: parseDateStr(asset.registrationExpiry!) < today })
    );
  assets
    .filter(a => a.uscgRegistrationExpiry && parseDateStr(a.uscgRegistrationExpiry) <= in14)
    .forEach(asset =>
      deadlineItems.push({ id: `uscg-${asset.id}`, dateStr: asset.uscgRegistrationExpiry!, label: t('admin.deadlines.uscgShort', { asset: asset.name }), sub: asset.uscgRegistration ?? t('admin.deadlines.uscg'), module: 'Fleet', overdue: parseDateStr(asset.uscgRegistrationExpiry!) < today })
    );
  if (season?.acaInspectionDate && parseDateStr(season.acaInspectionDate) <= in14)
    deadlineItems.push({ id: 'aca', dateStr: season.acaInspectionDate, label: t('admin.deadlines.aca'), sub: season.name ?? t('admin.deadlines.seasonInspection'), module: 'Safety', overdue: parseDateStr(season.acaInspectionDate) < today });
  deadlineItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  // ── Activity feed ────────────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const allActivity: ActivityItem[] = [];

  issues.forEach(issue =>
    issue.activityLog
      .filter(e => new Date(e.timestamp) >= cutoff)
      .forEach(e =>
        allActivity.push({
          id: e.id, module: 'Issue', userName: e.userName, timestamp: e.timestamp,
          sentence: (
            <Trans
              t={t}
              i18nKey="admin.feed.issueEvent"
              values={{ name: e.userName, action: translateActivity(e.action) }}
              components={{
                name: <span className="font-semibold" />,
                muted: <span className="text-ink-soft" />,
                item: <TranslatedText source="issues" id={issue.id} field="title" text={issue.title} className="text-ink" />,
              }}
            />
          ),
        })
      )
  );
  chemicalReadings
    .filter(r => new Date(r.readingTime) >= cutoff)
    .forEach(r => {
      const pool = pools.find(p => p.id === r.poolId);
      if (pool) allActivity.push({
        id: `chem-${r.id}`, module: 'Pool', userName: r.loggedByName, timestamp: r.readingTime,
        sentence: <FeedSentence i18nKey="admin.feed.poolReading" name={r.loggedByName} thing={pool.name} />,
      });
    });
  checkouts
    .filter(c => new Date(c.checkedOutAt) >= cutoff)
    .forEach(c => {
      const asset = assets.find(a => a.id === c.assetId);
      allActivity.push({
        id: `co-${c.id}`, module: 'Fleet', userName: c.checkedOutBy, timestamp: c.checkedOutAt,
        sentence: <FeedSentence i18nKey="admin.feed.checkedOut" name={c.checkedOutBy} thing={asset?.name ?? t('admin.feed.anAsset')} />,
      });
    });
  checkouts
    .filter(c => c.returnedAt && new Date(c.returnedAt) >= cutoff)
    .forEach(c => {
      const asset = assets.find(a => a.id === c.assetId);
      allActivity.push({
        id: `ret-${c.id}`, module: 'Fleet', userName: c.checkedOutBy, timestamp: c.returnedAt!,
        sentence: <FeedSentence i18nKey="admin.feed.returned" name={c.checkedOutBy} thing={asset?.name ?? t('admin.feed.anAsset')} />,
      });
    });

  allActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const recentActivity = allActivity.slice(0, 20);

  // ── Stat tile values ─────────────────────────────────────────────────────
  const urgCount = urgentCount();
  const opCount  = openCount();
  const safetyPct = safetyStats.overdue + safetyStats.dueSoon + safetyStats.compliant > 0
    ? Math.round((safetyStats.compliant / (safetyStats.overdue + safetyStats.dueSoon + safetyStats.compliant)) * 100)
    : 100;

  const todayLabel = fmtDay(new Date(), 'full', lang);
  const subtitle = season ? `${season.name}  ·  ${todayLabel}` : todayLabel;

  // ── Safety donut ─────────────────────────────────────────────────────────
  const safetyTotal = safetyStats.overdue + safetyStats.dueSoon + safetyStats.compliant;
  const circ = 2 * Math.PI * 15.9;
  const ringColor = safetyStats.overdue > 0 ? '#c0392b' : safetyStats.dueSoon > 0 ? '#c47d08' : '#7aab6e';

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar title={t('admin.title')} subtitle={subtitle} />

      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6 space-y-7">

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
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <StatTile
            label={t('admin.stats.urgent')}
            value={urgCount}
            sub={urgCount > 0 ? t('admin.stats.urgentSub') : t('admin.stats.nonePending')}
            variant={urgCount > 0 ? 'red' : 'green'}
            to="/campground"
          />
          <StatTile
            label={t('admin.stats.open')}
            value={opCount}
            sub={opCount > 0 ? t('admin.stats.highPriority', { count: issues.filter(i => i.priority === 'high' && i.status !== 'resolved').length }) : t('admin.stats.allResolved')}
            variant={opCount > 0 ? 'default' : 'green'}
            to="/campground"
          />
          <StatTile
            label={t('admin.stats.safety')}
            value={`${safetyPct}%`}
            sub={safetyStats.overdue > 0 ? t('admin.stats.overdueN', { count: safetyStats.overdue }) : safetyStats.dueSoon > 0 ? t('admin.stats.dueSoonN', { count: safetyStats.dueSoon }) : t('admin.stats.allCurrent')}
            variant={safetyStats.overdue > 0 ? 'red' : safetyStats.dueSoon > 0 ? 'amber' : 'green'}
            to="/safety"
            hidden={!modules.enabled('safety')}
          />
          <StatTile
            label={t('admin.stats.assetsOut')}
            value={checkedOutNow.length}
            sub={overdueOuts.length > 0 ? t('admin.stats.overdueN', { count: overdueOuts.length }) : fleet.available > 0 ? t('admin.stats.availableN', { count: fleet.available }) : t('admin.stats.allCheckedOut')}
            variant={overdueOuts.length > 0 ? 'red' : 'default'}
            to="/assets"
            hidden={!modules.enabled('assets')}
          />
          {acaDays !== null ? (
            <StatTile
              label={t('admin.stats.aca')}
              value={acaDays < 0 ? t('admin.stats.acaPast') : t('admin.stats.days', { count: acaDays })}
              sub={acaDays < 0 ? t('admin.stats.acaPassed') : acaDays === 0 ? t('admin.stats.acaToday') : fmtDay(parseDateStr(season!.acaInspectionDate!), 'short', lang)}
              variant={acaDays < 0 ? 'red' : acaDays <= 14 ? 'amber' : 'default'}
              to="/safety"
              hidden={!modules.enabled('safety')}
            />
          ) : (
            <StatTile
              label={t('admin.stats.repairCosts')}
              value={formatCost(totalCosts())}
              sub={t('admin.stats.thisSeason')}
              to="/campground"
            />
          )}
        </div>

        {/* ── Action required ──────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-forest">
              {t('admin.queue.title')}
              {deduped.length > 0 && (
                <span className="ms-2 text-[11px] font-semibold bg-red/10 text-red px-1.5 py-0.5 rounded-full">
                  {deduped.length}
                </span>
              )}
            </h2>
            {deduped.length > 0 && (
              <p className="text-[11px] text-ink-faint">
                {t('admin.queue.counts', { critical: deduped.filter(i => i.priority === 'critical').length, warnings: deduped.filter(i => i.priority === 'warning').length })}
              </p>
            )}
          </div>
          <ActionQueue items={deduped} />

          {issues.filter(i => i.status !== 'resolved' && i.priority === 'normal').length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[12px] font-semibold text-ink-soft">{t('admin.queue.normal')}</h3>
                <Link to="/campground" className="text-[11px] text-sage hover:text-sage-light flex items-center gap-0.5 transition-colors">
                  {t('admin.allIssues')} <ArrowRight className="w-3 h-3 rtl:-scale-x-100" />
                </Link>
              </div>
              <div className="bg-white rounded-card border border-border overflow-hidden">
                {issues
                  .filter(i => i.status !== 'resolved' && i.priority === 'normal')
                  .slice(0, 4)
                  .map((issue, i, arr) => (
                    <Link
                      key={issue.id}
                      to="/campground"
                      onClick={() => selectIssue(issue.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-cream-dark transition-colors group ${i < arr.length - 1 ? 'border-b border-border' : ''}`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-sage shrink-0" />
                      <TranslatedText as="p" source="issues" id={issue.id} field="title" text={issue.title} className="text-[12px] text-forest flex-1 min-w-0 truncate" />
                      <p className="text-[10px] text-ink-faint shrink-0">{issue.locations?.[0]}</p>
                      <ChevronRight className="w-3 h-3 text-forest/25 group-hover:text-ink-soft shrink-0 rtl:-scale-x-100" />
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Upcoming deadlines ───────────────────────────────────────── */}
        {deadlineItems.length > 0 && <DeadlineStrip items={deadlineItems} />}

        {/* ── Pools & waterfront ───────────────────────────────────────── */}
        {modules.enabled('pool') && activePools.length > 0 && (
          <div>
            <SectionHeader
              icon={<Droplets className="w-4 h-4 text-ink-faint" />}
              title={t('admin.pool.title')}
              badge={closedPools.length}
              badgeRed
              to="/pool"
              linkLabel={t('admin.manage')}
            />
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-4">
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

        {/* ── Compliance ───────────────────────────────────────────────── */}
        {modules.enabled('safety') && (
        <div>
          <SectionHeader
            icon={<Shield className="w-4 h-4 text-ink-faint" />}
            title={t('admin.compliance.title')}
            badge={safetyStats.overdue + failedDevices.length + expiredCerts}
            badgeRed
            to="/safety"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* Compliance overview */}
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-3">{t('admin.compliance.overview')}</p>
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
                    <span className="text-ink-soft">{t('admin.compliance.compliant')}</span>
                    <span className="font-semibold text-forest font-mono">{safetyStats.compliant}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-amber">{t('admin.compliance.dueSoon')}</span>
                    <span className="font-semibold text-amber font-mono">{safetyStats.dueSoon}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-red">{t('admin.compliance.overdue')}</span>
                    <span className="font-semibold text-red font-mono">{safetyStats.overdue}</span>
                  </div>
                  {safetyTotal > 0 && (
                    <p className="text-[10px] text-forest/30 pt-0.5">{t('admin.compliance.totalItems', { count: safetyTotal })}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                {expiredCerts > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-red">{t('admin.compliance.certsExpired')}</span>
                    <span className="font-semibold text-red font-mono">{expiredCerts}</span>
                  </div>
                )}
                {expiringCerts > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-amber">{t('admin.compliance.certsExpiring')}</span>
                    <span className="font-semibold text-amber font-mono">{expiringCerts}</span>
                  </div>
                )}
                {expiredLicenses > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-red">{t('admin.compliance.licensesExpired')}</span>
                    <span className="font-semibold text-red font-mono">{expiredLicenses}</span>
                  </div>
                )}
                {expiredCerts === 0 && expiringCerts === 0 && expiredLicenses === 0 && (
                  <p className="text-[11px] text-green-muted-text font-medium">{t('admin.compliance.allCertsCurrent')}</p>
                )}
              </div>

              {nextDrill && (
                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-1">{t('admin.compliance.nextDrill')}</p>
                  <p className="text-[12px] text-forest font-medium">{DRILL_TYPE_LABELS[nextDrill.drillType as keyof typeof DRILL_TYPE_LABELS]}</p>
                  <p className="text-[11px] text-ink-faint">{fmtDay(parseDateStr(nextDrill.scheduledDate), 'weekdayShort', lang)}</p>
                  {nextDrill.lead && <p className="text-[10px] text-ink-faint mt-0.5">{t('admin.deadlines.lead', { name: nextDrill.lead })}</p>}
                </div>
              )}
            </div>

            {/* Items needing attention */}
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-3">{t('admin.compliance.attention')}</p>
              {failedDevices.length === 0 && overdueItems_.length === 0 ? (
                <div className="flex flex-col items-center py-4 sm:py-6">
                  <CheckCircle2 className="w-6 h-6 text-sage mb-1.5" />
                  <p className="text-[12px] text-green-muted-text font-medium">{t('admin.compliance.allItemsCurrent')}</p>
                  <p className="text-[10px] text-ink-faint mt-0.5">{t('admin.compliance.noFailed')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {failedDevices.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-red uppercase tracking-wide mb-2">{t('admin.compliance.failedLast')}</p>
                      <div className="space-y-0">
                        {failedDevices.map((item, i) => (
                          <div key={item.id} className={`flex items-start gap-2 py-1.5 ${i < failedDevices.length - 1 ? 'border-b border-border' : ''}`}>
                            <div className="w-1.5 h-1.5 rounded-full bg-red shrink-0 mt-1.5" />
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium text-forest truncate">{item.name}</p>
                              <p className="text-[10px] text-ink-faint">{item.location}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {overdueItems_.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-amber uppercase tracking-wide mb-2">{t('admin.compliance.overdueInspections')}</p>
                      <div className="space-y-0">
                        {overdueItems_.slice(0, 6).map((item, i, arr) => (
                          <div key={item.id} className={`flex items-start gap-2 py-1.5 ${i < arr.length - 1 ? 'border-b border-border' : ''}`}>
                            <div className="w-1.5 h-1.5 rounded-full bg-amber shrink-0 mt-1.5" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium text-forest truncate">{item.name}</p>
                              <p className="text-[10px] text-ink-faint">{item.location}</p>
                            </div>
                            {item.nextDue && (
                              <p className="text-[10px] text-red shrink-0">
                                {t('admin.due', { date: fmtDay(parseDateStr(item.nextDue), 'short', lang) })}
                              </p>
                            )}
                          </div>
                        ))}
                        {overdueItems_.length > 6 && (
                          <p className="text-[10px] text-ink-faint pt-1.5">{t('admin.moreOverdue', { count: overdueItems_.length - 6 })}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Staff certifications */}
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-3">{t('admin.compliance.staffCerts')}</p>
              {staffList.length === 0 ? (
                <p className="text-[12px] text-ink-faint">{t('admin.compliance.noStaff')}</p>
              ) : (
                <div className="overflow-y-auto max-h-[260px]">
                  {staffList.map(({ staff, certs }, i) => {
                    const hasExpired  = certs.some(c => certExpiryStatus(c.expiryDate) === 'expired');
                    const hasExpiring = certs.some(c => certExpiryStatus(c.expiryDate) === 'expiring');
                    const status = hasExpired ? 'expired' : hasExpiring ? 'expiring' : 'ok';
                    const pillCls = status === 'expired' ? 'bg-red/10 text-red' : status === 'expiring' ? 'bg-amber/10 text-amber' : 'bg-sage/10 text-sage';
                    const pillLabel = status === 'expired' ? t('admin.compliance.pillExpired') : status === 'expiring' ? t('admin.compliance.pillExpiring') : t('admin.compliance.pillCurrent');
                    return (
                      <div key={staff.id} className={`flex items-center gap-2 py-1.5 ${i < staffList.length - 1 ? 'border-b border-border' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-forest truncate">{staff.name}</p>
                          <p className="text-[10px] text-ink-faint">{t('admin.compliance.certCount', { count: certs.length })}</p>
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

        )}

        {/* ── Assets & vehicles ────────────────────────────────────────── */}
        {modules.enabled('assets') && (
        <div>
          <SectionHeader
            icon={<Truck className="w-4 h-4 text-ink-faint" />}
            title={t('admin.assets.title')}
            badge={overdueOuts.length + maintOverdue.length || null}
            badgeRed={overdueOuts.length > 0}
            to="/assets"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Fleet status + maintenance overdue */}
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-3">{t('admin.assets.fleetStatus')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                {[
                  { label: t('admin.assets.available'), val: fleet.available, cls: 'text-green-muted-text' },
                  { label: t('admin.assets.checkedOut'), val: fleet.checkedOut, cls: fleet.checkedOut > 0 ? 'text-amber' : 'text-forest' },
                  { label: t('admin.assets.inService'), val: fleet.inService, cls: 'text-ink-soft' },
                ].map(({ label, val, cls }) => (
                  <div key={label} className="text-center bg-cream-dark/60 rounded-md py-2.5">
                    <p className={`font-mono text-[22px] font-semibold leading-none ${cls}`}>{val}</p>
                    <p className="text-[9px] text-ink-faint mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-2">{t('admin.assets.maintOverdue')}</p>
                {maintOverdue.length === 0 ? (
                  <p className="text-[11px] text-green-muted-text font-medium">{t('admin.assets.allServiceCurrent')}</p>
                ) : (
                  <div>
                    {maintOverdue.slice(0, 5).map((entry, i) => (
                      <div key={entry.record.id} className={`flex items-center gap-2 py-1.5 ${i < Math.min(maintOverdue.length, 5) - 1 ? 'border-b border-border' : ''}`}>
                        <div className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-forest truncate">{entry.asset.name}</p>
                          <p className="text-[10px] text-ink-faint truncate">
                            {SERVICE_TYPE_LABELS[entry.record.serviceType] ?? entry.record.serviceType}
                            {entry.record.nextServiceDate && ` · ${t('admin.due', { date: fmtDay(parseDateStr(entry.record.nextServiceDate), 'short', lang) })}`}
                          </p>
                        </div>
                      </div>
                    ))}
                    {maintOverdue.length > 5 && (
                      <p className="text-[10px] text-ink-faint pt-1.5">{t('admin.moreOverdue', { count: maintOverdue.length - 5 })}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Currently checked out */}
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide mb-3">
                {t('admin.assets.currentlyOut')}
                {checkedOutNow.length > 0 && (
                  <span className="ms-1.5 font-mono">({checkedOutNow.length})</span>
                )}
              </p>
              {checkedOutNow.length === 0 ? (
                <div className="flex flex-col items-center py-4 sm:py-6">
                  <CheckCircle2 className="w-6 h-6 text-sage mb-1.5" />
                  <p className="text-[12px] text-ink-faint">{t('admin.assets.allReturned')}</p>
                </div>
              ) : (
                <div>
                  <div className="grid text-[10px] font-semibold text-ink-faint uppercase tracking-wide pb-1.5 border-b border-border mb-0"
                    style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                    <span>{t('admin.assets.asset')}</span>
                    <span>{t('admin.assets.checkedOutBy')}</span>
                    <span className="text-end">{t('admin.assets.expectedReturn')}</span>
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
                          <p className="text-[10px] text-ink-faint truncate">{asset.category}</p>
                        </div>
                        <p className="text-[11px] text-ink-soft truncate pt-0.5">{checkout.checkedOutBy}</p>
                        <div className="text-end">
                          {isOverdue ? (
                            <span className="text-[10px] font-semibold text-red bg-red/8 px-1.5 py-0.5 rounded">
                              {t('admin.assets.daysOverdue', { count: daysOver })}
                            </span>
                          ) : (
                            <p className="text-[11px] text-ink-soft">
                              {fmtDay(new Date(checkout.expectedReturnAt), 'dayTime', lang)}
                            </p>
                          )}
                          <p className="text-[10px] text-forest/30 mt-0.5">
                            {t('admin.assets.outSince', { when: relativeTime(checkout.checkedOutAt) })}
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

        )}

        {/* ── Activity feed ────────────────────────────────────────────── */}
        <ActivityFeed items={recentActivity} />

      </div>
    </div>
  );
}
