import { useState } from 'react';
import { useSafetyStore, safetyItemStatus, certExpiryStatus } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { Button } from '@/components/shared/Button';
import { generateId } from '@/lib/utils';
import type { SafetyItem, SafetyTempLog } from '@/lib/types';

const RESULT_LABELS: Record<string, string> = {
  passed: 'Passed',
  passed_with_notes: 'Passed w/ notes',
  action_taken: 'Action taken',
  failed: 'Failed',
};

function statusBorderClass(status: 'ok' | 'warn' | 'alert') {
  if (status === 'alert') return 'border-l-red';
  if (status === 'warn') return 'border-l-amber';
  return 'border-l-sage';
}


function StatusBadge({ status, nextDue }: { status: 'ok' | 'warn' | 'alert'; nextDue: string | null }) {
  if (status === 'alert') {
    const days = nextDue ? Math.abs(Math.round((new Date(nextDue + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000)) : 0;
    return <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-red-bg text-red">Overdue {days} day{days === 1 ? '' : 's'}</span>;
  }
  if (status === 'warn') {
    const days = nextDue ? Math.round((new Date(nextDue + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000) : 0;
    return <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-amber-bg text-amber-text">Due in {days} day{days === 1 ? '' : 's'}</span>;
  }
  return <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-green-muted-bg text-green-muted-text">Current</span>;
}

function QuickTempInput({ session, item, loggedBy, onLog }: {
  session: 'am' | 'pm';
  item: SafetyItem;
  loggedBy: string;
  onLog: (log: SafetyTempLog) => void;
}) {
  const [value, setValue] = useState('');
  const tempMin = item.metadata.temp_min as number | undefined;
  const tempMax = item.metadata.temp_max as number | undefined;
  const temp = value ? parseFloat(value) : null;
  const inRange = temp !== null && tempMin !== undefined && tempMax !== undefined
    ? temp >= tempMin && temp <= tempMax
    : null;

  function handleLog() {
    if (!value || temp === null) return;
    const now = new Date().toISOString();
    const log: SafetyTempLog = {
      id: generateId(),
      itemId: item.id,
      logDate: now.slice(0, 10),
      session,
      temperature: temp,
      inRange: inRange ?? true,
      loggedBy,
      notes: null,
      createdAt: now,
    };
    onLog(log);
    setValue('');
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold text-forest/40 uppercase w-5">{session}</span>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleLog()}
        className="w-20 text-[13px] font-mono bg-white border border-border rounded-btn px-2 py-1 focus:outline-none focus:border-sage"
        placeholder="°F"
      />
      {inRange !== null && (
        <span className={`text-[11px] font-semibold ${inRange ? 'text-green-muted-text' : 'text-red'}`}>
          {inRange ? '✓' : '✗'}
        </span>
      )}
      <button
        onClick={handleLog}
        disabled={!value}
        className="text-[11px] font-semibold text-white bg-sage px-2.5 py-1 rounded disabled:opacity-30 cursor-pointer disabled:cursor-default hover:bg-sage/90 transition-colors"
      >
        Log
      </button>
    </div>
  );
}

function KitchenItemCard({ item, onLog, onEdit }: { item: SafetyItem; onLog: () => void; onEdit: () => void }) {
  const status = safetyItemStatus(item);
  const meta = item.metadata as Record<string, unknown>;
  const { recentLogsForItem } = useSafetyStore();
  const { openEditInspectionLogModal } = useUIStore();
  const recentLogs = recentLogsForItem(item.id, 5);
  const [showHistory, setShowHistory] = useState(false);
  const historyLogs = recentLogsForItem(item.id, 20);

  return (
    <div className={`bg-white border border-border border-l-[3px] ${statusBorderClass(status)} rounded-card px-5 py-4`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-4">
          <h4 className="text-[13px] font-semibold text-forest">{item.name}</h4>
          <p className="text-[11px] text-forest/40 mt-0.5 leading-relaxed">
            {item.type === 'hood_fan' ? 'Fire code required' : ''} every {item.frequencyDays} days
            {item.vendor ? ` · Vendor: ${item.vendor}` : ''}
            {item.lastInspected ? ` · Last: ${new Date(item.lastInspected + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <StatusBadge status={status} nextDue={item.nextDue} />
          {item.nextDue && (
            <p className="font-mono text-[12px] text-forest/40 mt-1.5">
              {status === 'ok' ? 'Next:' : 'Due:'} {new Date(item.nextDue + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>
      </div>

      {item.type === 'hood_fan' && (
        <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-cream-dark">
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Fan units</p>
            <p className="text-[12px] font-medium text-forest">{item.unitCount}</p>
          </div>
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Last cleaned</p>
            <p className={`text-[12px] font-semibold font-mono ${status === 'ok' ? 'text-green-muted-text' : status === 'warn' ? 'text-amber' : 'text-red'}`}>
              {item.lastInspected ? new Date(item.lastInspected + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Frequency</p>
            <p className="text-[12px] font-medium text-forest">Every {item.frequencyDays} days</p>
          </div>
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Vendor</p>
            <p className="text-[12px] font-medium text-forest truncate">{item.vendor ?? '—'}</p>
          </div>
        </div>
      )}

      {item.type === 'health_inspection' && (
        <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-cream-dark">
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Inspecting authority</p>
            <p className="text-[12px] font-medium text-forest">{item.vendor ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Last result</p>
            <p className={`text-[12px] font-semibold ${
              recentLogs[0]?.result === 'failed' ? 'text-red' :
              recentLogs[0]?.result === 'passed_with_notes' || recentLogs[0]?.result === 'action_taken' ? 'text-amber-text' :
              recentLogs[0]?.result === 'passed' ? 'text-green-muted-text' :
              'text-forest/40'
            }`}>
              {recentLogs[0] ? (RESULT_LABELS[recentLogs[0].result] ?? recentLogs[0].result) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Last inspected</p>
            <p className="text-[12px] font-semibold font-mono text-forest/70">
              {item.lastInspected ? new Date(item.lastInspected + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
            </p>
          </div>
        </div>
      )}

      {recentLogs.length > 0 && item.type === 'hood_fan' && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-cream-dark flex-wrap">
          <span className="text-[11px] text-forest/40 mr-1">Cleaning history:</span>
          {recentLogs.map((log) => (
            <span key={log.id} className="text-[11px] bg-cream-dark text-forest/60 px-2 py-0.5 rounded-tag font-mono">
              {new Date(log.inspectionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button variant="primary" size="sm" onClick={onLog}>
          {item.type === 'hood_fan' ? 'Log cleaning' : 'Log inspection'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? 'Hide history' : 'View history'}
        </Button>
      </div>

      {showHistory && (
        <div className="mt-3 pt-3 border-t border-cream-dark">
          <p className="text-[11px] font-semibold text-forest/50 mb-2">
            {item.type === 'hood_fan' ? 'Cleaning history' : 'Inspection history'}
          </p>
          {historyLogs.length === 0 ? (
            <p className="text-[11px] text-forest/30 italic">No entries logged yet.</p>
          ) : (
            <div className="space-y-1.5">
              {historyLogs.map((log) => {
                const resultColor =
                  log.result === 'passed' ? 'text-green-muted-text' :
                  log.result === 'failed' ? 'text-red' : 'text-amber-text';
                return (
                  <div key={log.id} className="flex items-start gap-4 text-[11px]">
                    <span className="font-mono text-forest/60 flex-shrink-0">
                      {new Date(log.inspectionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="text-forest/40 flex-shrink-0">{log.completedBy}</span>
                    <span className={`font-semibold flex-shrink-0 ${resultColor}`}>{RESULT_LABELS[log.result] ?? log.result}</span>
                    {log.notes && <span className="text-forest/40 truncate flex-1">{log.notes}</span>}
                    <button
                      onClick={() => openEditInspectionLogModal(log.id)}
                      className="flex-shrink-0 text-forest/30 hover:text-sage cursor-pointer ml-auto"
                    >
                      Edit
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TempCard({ item, onEdit }: { item: SafetyItem; onEdit: () => void }) {
  const { tempLogsForItem, tempLogs, addTempLog } = useSafetyStore();
  const { openLogTempModal, openEditTempLogModal } = useUIStore();
  const { currentUser } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const { am, pm } = tempLogsForItem(item.id, today);
  const meta = item.metadata as Record<string, number>;
  const [showHistory, setShowHistory] = useState(false);

  // All logs for this item, sorted newest first, grouped by date
  const allLogs = tempLogs
    .filter((l) => l.itemId === item.id)
    .sort((a, b) => b.logDate.localeCompare(a.logDate) || (b.session === 'pm' ? 1 : -1));

  // Build date-grouped list for display (up to 14 days)
  const dateMap = new Map<string, { am: typeof allLogs[0] | null; pm: typeof allLogs[0] | null }>();
  for (const log of allLogs) {
    if (!dateMap.has(log.logDate)) dateMap.set(log.logDate, { am: null, pm: null });
    const entry = dateMap.get(log.logDate)!;
    if (log.session === 'am') entry.am = log;
    else entry.pm = log;
  }
  const historyDates = [...dateMap.entries()].slice(0, 14);

  const amStatus = am ? (am.inRange ? 'ok' : 'alert') : 'pending';
  const pmStatus = pm ? (pm.inRange ? 'ok' : 'alert') : 'pending';

  const overallStatus = (am && !am.inRange) || (pm && !pm.inRange) ? 'alert' : (!am || !pm) ? 'warn' : 'ok';

  return (
    <div className={`bg-white border border-border border-l-[3px] ${statusBorderClass(overallStatus)} rounded-card px-5 py-4`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-4">
          <h4 className="text-[13px] font-semibold text-forest">{item.name}</h4>
          <p className="text-[11px] text-forest/40 mt-0.5">
            Required range: {meta.temp_min}–{meta.temp_max}°F · Logged {item.frequency}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          {overallStatus === 'ok' ? (
            <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-green-muted-bg text-green-muted-text">In range</span>
          ) : overallStatus === 'alert' ? (
            <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-red-bg text-red">Out of range</span>
          ) : (
            <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-amber-bg text-amber-text">Log pending</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-cream-dark">
        <div>
          <p className="text-[10px] text-forest/40 font-medium mb-0.5">AM reading</p>
          <p className={`text-[13px] font-semibold font-mono ${amStatus === 'ok' ? 'text-green-muted-text' : amStatus === 'alert' ? 'text-red' : 'text-forest/30'}`}>
            {am ? `${am.temperature}°F` : '— pending'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-forest/40 font-medium mb-0.5">PM reading</p>
          <p className={`text-[13px] font-semibold font-mono ${pmStatus === 'ok' ? 'text-green-muted-text' : pmStatus === 'alert' ? 'text-red' : 'text-forest/30'}`}>
            {pm ? `${pm.temperature}°F` : '— pending'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-forest/40 font-medium mb-0.5">Required range</p>
          <p className="text-[12px] font-medium text-forest">{meta.temp_min}–{meta.temp_max}°F</p>
        </div>
        <div>
          <p className="text-[10px] text-forest/40 font-medium mb-0.5">Logged by</p>
          <p className="text-[12px] font-medium text-forest">{am?.loggedBy ?? pm?.loggedBy ?? '—'}</p>
        </div>
      </div>

      {/* Quick inline log */}
      {(!am || !pm) && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-cream-dark flex-wrap">
          <span className="text-[11px] text-forest/40 font-medium">Quick log:</span>
          {!am && (
            <QuickTempInput session="am" item={item} loggedBy={currentUser.name} onLog={addTempLog} />
          )}
          {!pm && (
            <QuickTempInput session="pm" item={item} loggedBy={currentUser.name} onLog={addTempLog} />
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        {(am && pm) && <Button variant="ghost" size="sm" onClick={() => openLogTempModal(item.id)}>Correct a reading</Button>}
        <Button variant="ghost" size="sm" onClick={onEdit}>Edit unit</Button>
        <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? 'Hide history' : 'View history'}
        </Button>
      </div>

      {showHistory && (
        <div className="mt-3 pt-3 border-t border-cream-dark">
          <p className="text-[11px] font-semibold text-forest/50 mb-2">Temperature log history</p>
          {historyDates.length === 0 ? (
            <p className="text-[11px] text-forest/30 italic">No temperature logs yet.</p>
          ) : (
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-forest/30">Date</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-forest/30">AM</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-forest/30">PM</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-forest/30">Logged by</span>
                <span></span>
              </div>
              {historyDates.map(([date, { am: amLog, pm: pmLog }]) => {
                const anyOutOfRange = (amLog && !amLog.inRange) || (pmLog && !pmLog.inRange);
                return (
                  <div key={date} className={`grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 py-1.5 border-t border-cream-dark text-[11px] ${anyOutOfRange ? 'bg-red-bg/30 -mx-1 px-1 rounded' : ''}`}>
                    <span className="font-mono text-forest/60">
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {date === today ? <span className="text-sage ml-1 font-semibold">today</span> : ''}
                    </span>
                    <button
                      onClick={() => amLog && openEditTempLogModal(amLog.id)}
                      className={`font-mono font-semibold text-left ${amLog ? ((amLog.inRange ? 'text-green-muted-text' : 'text-red') + ' hover:underline cursor-pointer') : 'text-forest/25 cursor-default'}`}
                    >
                      {amLog ? `${amLog.temperature}°F` : '—'}
                    </button>
                    <button
                      onClick={() => pmLog && openEditTempLogModal(pmLog.id)}
                      className={`font-mono font-semibold text-left ${pmLog ? ((pmLog.inRange ? 'text-green-muted-text' : 'text-red') + ' hover:underline cursor-pointer') : 'text-forest/25 cursor-default'}`}
                    >
                      {pmLog ? `${pmLog.temperature}°F` : '—'}
                    </button>
                    <span className="text-forest/40 truncate">{amLog?.loggedBy ?? pmLog?.loggedBy ?? '—'}</span>
                    <div className="flex gap-2">
                      {amLog && <button onClick={() => openEditTempLogModal(amLog.id)} className="text-forest/30 hover:text-sage cursor-pointer">Edit AM</button>}
                      {pmLog && <button onClick={() => openEditTempLogModal(pmLog.id)} className="text-forest/30 hover:text-sage cursor-pointer">Edit PM</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function KitchenTab() {
  const { itemsByType, categoryStats, licenses } = useSafetyStore();
  const { openSafetyLogInspectionModal, openSafetyAddItemModal, openLogTempModal, openAddLicenseModal } = useUIStore();
  const openEditItem = (itemId: string) => openSafetyAddItemModal({ itemId });
  const addHoodFan = () => openSafetyAddItemModal({ type: 'hood_fan' });
  const addRefrigeration = () => openSafetyAddItemModal({ type: 'refrigeration' });
  const addHealthInspection = () => openSafetyAddItemModal({ type: 'health_inspection' });

  const hoodFans = itemsByType('hood_fan');
  const refrigeration = itemsByType('refrigeration');
  const healthInspections = itemsByType('health_inspection');

  const stats = categoryStats('kitchen');
  const today = new Date().toISOString().slice(0, 10);

  const overdueKitchen = [...hoodFans, ...refrigeration, ...healthInspections].filter((i) => safetyItemStatus(i) === 'alert');

  // For temp log today summary
  const { tempLogsForItem } = useSafetyStore();
  const tempLogsToday = refrigeration.filter((item) => {
    const { am, pm } = tempLogsForItem(item.id, today);
    return am || pm;
  }).length;
  const tempLogsPending = refrigeration.length - tempLogsToday;

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <div className={`bg-white border border-border rounded-card px-4 py-4 ${stats.alert > 0 ? 'border-l-[3px] border-l-red' : ''}`}>
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Hood fan cleaning</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${hoodFans.some(i => safetyItemStatus(i) === 'alert') ? 'text-red' : hoodFans.some(i => safetyItemStatus(i) === 'warn') ? 'text-amber' : 'text-green-muted-text'}`}>
            {hoodFans.length === 0 ? '—' : hoodFans.every(i => safetyItemStatus(i) === 'ok') ? 'Current' : hoodFans.some(i => safetyItemStatus(i) === 'alert') ? 'Overdue' : 'Due soon'}
          </p>
          <p className="text-meta text-forest/40 mt-0.5">{hoodFans.length} unit group{hoodFans.length === 1 ? '' : 's'}</p>
        </div>
        {(() => {
          const healthPermit = licenses.find((l) => l.licenseType === 'health_permit');
          const ps = healthPermit ? certExpiryStatus(healthPermit.expiryDate) : null;
          const expiryLabel = healthPermit?.expiryDate
            ? `Expires ${new Date(healthPermit.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : healthPermit ? 'Expiry not on file' : 'Not on file';
          return (
            <div
              className={`bg-white border border-border rounded-card px-4 py-4 ${ps === 'expired' ? 'border-l-[3px] border-l-red' : ps === 'expiring' ? 'border-l-[3px] border-l-amber' : ''}`}
            >
              <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Health permit</p>
              <p className={`font-mono font-semibold text-stat mt-1 ${ps === 'ok' ? 'text-green-muted-text' : ps === 'expiring' ? 'text-amber' : ps === 'expired' ? 'text-red' : 'text-forest/30'}`}>
                {ps === 'ok' ? 'Valid' : ps === 'expiring' ? 'Expiring' : ps === 'expired' ? 'Expired' : '—'}
              </p>
              <p className={`text-meta mt-0.5 ${ps === 'expired' ? 'text-red' : ps === 'expiring' ? 'text-amber-text' : 'text-forest/40'}`}>
                {healthPermit ? (
                  expiryLabel
                ) : (
                  <button onClick={() => openAddLicenseModal()} className="text-sage hover:underline cursor-pointer">
                    + Add health permit
                  </button>
                )}
              </p>
            </div>
          );
        })()}
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Last inspection</p>
          {healthInspections[0]?.lastInspected ? (
            <>
              <p className="font-semibold text-[18px] mt-2 text-green-muted-text">
                {new Date(healthInspections[0].lastInspected + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
              <p className="text-meta text-forest/40 mt-0.5">Health dept.</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-[18px] mt-2 text-forest/30">—</p>
              <p className="text-meta text-forest/40 mt-0.5">None on file</p>
            </>
          )}
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Temp logs today</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${tempLogsPending > 0 ? 'text-amber' : refrigeration.length === 0 ? 'text-forest/30' : 'text-green-muted-text'}`}>
            {refrigeration.length === 0 ? '—' : `${tempLogsToday}/${refrigeration.length}`}
          </p>
          <p className="text-meta text-forest/40 mt-0.5">
            {refrigeration.length === 0 ? 'No units set up' : tempLogsPending > 0 ? `${tempLogsPending} log${tempLogsPending === 1 ? '' : 's'} pending` : 'All logged'}
          </p>
        </div>
      </div>

      {/* Alert banners */}
      {overdueKitchen.map((item) => (
        <AlertBanner
          key={item.id}
          variant="alert"
          message={`${item.name} is overdue. ${item.type === 'hood_fan' ? 'Fire code requires cleaning every 90 days. Operating with an overdue hood fan creates fire and insurance risk.' : 'This compliance item requires immediate attention.'}`}
          action={{ label: item.type === 'hood_fan' ? 'Log cleaning' : 'Log action', onClick: () => openSafetyLogInspectionModal(item.id) }}
        />
      ))}

      {/* Hood fan cleaning */}
      <div className="flex items-center justify-between mb-3 mt-2">
        <h3 className="text-[14px] font-semibold text-forest">Kitchen hood fan cleaning</h3>
        <Button variant="ghost" size="sm" onClick={addHoodFan}>+ Add hood fan</Button>
      </div>
      {hoodFans.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-8 text-center mb-6">
          <p className="text-[13px] text-forest/40">No hood fans added yet.</p>
          <button onClick={addHoodFan} className="text-[12px] text-sage font-medium mt-1 cursor-pointer hover:underline">+ Add hood fan</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 mb-6">
          {hoodFans.map((item) => (
            <KitchenItemCard key={item.id} item={item} onLog={() => openSafetyLogInspectionModal(item.id)} onEdit={() => openEditItem(item.id)} />
          ))}
        </div>
      )}

      {/* Refrigeration temp logs */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-forest">Refrigeration temperature logs</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => openLogTempModal()}>+ Log temps</Button>
          <Button variant="ghost" size="sm" onClick={addRefrigeration}>+ Add unit</Button>
        </div>
      </div>
      {refrigeration.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-8 text-center mb-6">
          <p className="text-[13px] text-forest/40">No refrigeration units added yet.</p>
          <button onClick={addRefrigeration} className="text-[12px] text-sage font-medium mt-1 cursor-pointer hover:underline">+ Add refrigeration unit</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 mb-6">
          {refrigeration.map((item) => (
            <TempCard key={item.id} item={item} onEdit={() => openEditItem(item.id)} />
          ))}
        </div>
      )}

      {/* Health department inspections */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-forest">Health department inspections</h3>
        <Button variant="ghost" size="sm" onClick={addHealthInspection}>+ Add inspection</Button>
      </div>
      {healthInspections.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-8 text-center">
          <p className="text-[13px] text-forest/40">No health inspection records added yet.</p>
          <button onClick={addHealthInspection} className="text-[12px] text-sage font-medium mt-1 cursor-pointer hover:underline">+ Add inspection</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {healthInspections.map((item) => (
            <KitchenItemCard key={item.id} item={item} onLog={() => openSafetyLogInspectionModal(item.id)} onEdit={() => openEditItem(item.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
