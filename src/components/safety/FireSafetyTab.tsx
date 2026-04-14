import { useState } from 'react';
import { useSafetyStore, safetyItemStatus } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { Button } from '@/components/shared/Button';
import type { SafetyItem } from '@/lib/types';

function statusBorderClass(status: 'ok' | 'warn' | 'alert') {
  if (status === 'alert') return 'border-l-red';
  if (status === 'warn') return 'border-l-amber';
  return 'border-l-sage';
}

function StatusBadge({ status, nextDue }: { status: 'ok' | 'warn' | 'alert'; nextDue: string | null }) {
  if (status === 'alert') {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = nextDue ? Math.abs(Math.round((new Date(nextDue + 'T00:00:00').getTime() - today.getTime()) / 86400000)) : 0;
    return <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-red-bg text-red">Overdue {days} day{days === 1 ? '' : 's'}</span>;
  }
  if (status === 'warn') {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = nextDue ? Math.round((new Date(nextDue + 'T00:00:00').getTime() - today.getTime()) / 86400000) : 0;
    return <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-amber-bg text-amber-text">Due in {days} day{days === 1 ? '' : 's'}</span>;
  }
  return <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-green-muted-bg text-green-muted-text">Current</span>;
}

const RESULT_LABELS: Record<string, string> = {
  passed: 'Passed',
  passed_with_notes: 'Passed w/ notes',
  action_taken: 'Action taken',
  failed: 'Failed',
};

function ItemCard({ item, onLog }: { item: SafetyItem; onLog: () => void }) {
  const status = safetyItemStatus(item);
  const meta = item.metadata as Record<string, string>;
  const { recentLogsForItem } = useSafetyStore();
  const { openEditInspectionLogModal } = useUIStore();
  const [showHistory, setShowHistory] = useState(false);
  const historyLogs = recentLogsForItem(item.id, 20);

  return (
    <div className={`bg-white border border-border border-l-[3px] ${statusBorderClass(status)} rounded-card px-5 py-4`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <h4 className="text-[13px] font-semibold text-forest">
            {item.name}
            {item.unitCount > 1 ? <span className="text-forest/40 font-normal"> (×{item.unitCount})</span> : ''}
          </h4>
          <p className="text-[11px] text-forest/40 mt-0.5 leading-relaxed">
            {item.location}
            {meta.extinguisher_class ? ` · Type: ${meta.extinguisher_class}` : ''}
            {' · '}{item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1)} inspection
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

      {/* Details grid */}
      <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-cream-dark">
        <div>
          <p className="text-[10px] text-forest/40 font-medium mb-0.5">Units</p>
          <p className={`text-[12px] font-semibold font-mono ${status === 'ok' ? 'text-green-muted-text' : status === 'warn' ? 'text-amber' : 'text-red'}`}>
            {item.unitCount} unit{item.unitCount === 1 ? '' : 's'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-forest/40 font-medium mb-0.5">Last inspected</p>
          <p className={`text-[12px] font-semibold font-mono ${item.lastInspected ? (status === 'ok' ? 'text-green-muted-text' : status === 'warn' ? 'text-amber' : 'text-red') : 'text-forest/30'}`}>
            {item.lastInspected ? new Date(item.lastInspected + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
          </p>
        </div>
        {meta.expiry_year && (
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Cylinder expiry</p>
            <p className="text-[12px] font-semibold font-mono text-forest">{meta.expiry_year}</p>
          </div>
        )}
        <div>
          <p className="text-[10px] text-forest/40 font-medium mb-0.5">{item.vendor ? 'Inspector' : 'Frequency'}</p>
          <p className="text-[12px] font-medium text-forest">{item.vendor ?? item.frequency}</p>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <Button variant="primary" size="sm" onClick={onLog}>Log inspection</Button>
        <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? 'Hide history' : 'View history'}
        </Button>
      </div>

      {showHistory && (
        <div className="mt-3 pt-3 border-t border-cream-dark">
          <p className="text-[11px] font-semibold text-forest/50 mb-2">Inspection history</p>
          {historyLogs.length === 0 ? (
            <p className="text-[11px] text-forest/30 italic">No inspections logged yet.</p>
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

export function FireSafetyTab() {
  const { itemsByType, categoryStats, overdueItems: getOverdue } = useSafetyStore();
  const { openSafetyLogInspectionModal, openSafetyAddItemModal } = useUIStore();

  const extinguishers = itemsByType('extinguisher');
  const smokeAlarms = itemsByType('smoke_alarm');
  const coAlarms = itemsByType('co_alarm');
  const allFireItems = [...extinguishers, ...smokeAlarms, ...coAlarms];

  const stats = categoryStats('fire');
  const overdue = getOverdue().filter((i) => i.category === 'fire');
  const totalUnits = allFireItems.reduce((s, i) => s + i.unitCount, 0);

  // Next service among warn items
  const nextWarn = allFireItems
    .filter((i) => safetyItemStatus(i) === 'warn')
    .sort((a, b) => (a.nextDue ?? '').localeCompare(b.nextDue ?? ''))
    [0] ?? null;

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Extinguishers</p>
          <p className="font-mono font-semibold text-stat mt-1 text-forest">{extinguishers.reduce((s, i) => s + i.unitCount, 0)}</p>
          <p className="text-meta text-forest/40 mt-0.5">Total on property</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Inspected</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${stats.ok > 0 ? 'text-green-muted-text' : 'text-forest/30'}`}>{stats.ok}</p>
          <p className="text-meta text-forest/40 mt-0.5">Current this period</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Overdue</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${stats.alert > 0 ? 'text-red' : 'text-forest/30'}`}>{stats.alert}</p>
          <p className={`text-meta mt-0.5 ${stats.alert > 0 ? 'text-red' : 'text-forest/40'}`}>{stats.alert > 0 ? 'Need inspection now' : 'All current'}</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Next service</p>
          {nextWarn ? (
            <>
              <p className="font-semibold text-[18px] mt-2 text-forest">
                {new Date(nextWarn.nextDue! + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
              <p className="text-meta text-forest/40 mt-0.5 truncate">{nextWarn.location}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-[18px] mt-2 text-forest/30">—</p>
              <p className="text-meta text-forest/40 mt-0.5">Nothing due soon</p>
            </>
          )}
        </div>
      </div>

      {/* Alert banners */}
      {overdue.map((item) => (
        <AlertBanner
          key={item.id}
          variant="alert"
          message={`${item.name} inspection is overdue. This is required by fire code. Log the inspection or contact your vendor immediately.`}
          action={{ label: 'Log inspection', onClick: () => openSafetyLogInspectionModal(item.id) }}
        />
      ))}

      {/* Fire extinguishers */}
      <div className="flex items-center justify-between mb-3 mt-2">
        <h3 className="text-[14px] font-semibold text-forest">Fire extinguishers</h3>
        <Button variant="ghost" size="sm" onClick={() => openSafetyAddItemModal({ type: 'extinguisher' })}>+ Add extinguisher</Button>
      </div>

      {extinguishers.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-8 text-center mb-6">
          <p className="text-[13px] text-forest/40">No fire extinguishers added yet.</p>
          <button onClick={() => openSafetyAddItemModal({ type: 'extinguisher' })} className="text-[12px] text-sage font-medium mt-1 cursor-pointer hover:underline">+ Add fire extinguisher</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 mb-6">
          {extinguishers.map((item) => (
            <ItemCard key={item.id} item={item} onLog={() => openSafetyLogInspectionModal(item.id)} />
          ))}
        </div>
      )}

      {/* Smoke & CO alarms */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-forest">Smoke & carbon monoxide alarms</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => openSafetyAddItemModal({ type: 'smoke_alarm' })}>+ Smoke alarm</Button>
          <Button variant="ghost" size="sm" onClick={() => openSafetyAddItemModal({ type: 'co_alarm' })}>+ CO alarm</Button>
          <Button variant="ghost" size="sm" onClick={() => openSafetyLogInspectionModal()}>Log weekly test</Button>
        </div>
      </div>

      {smokeAlarms.length === 0 && coAlarms.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-8 text-center mb-6">
          <p className="text-[13px] text-forest/40">No alarms added yet.</p>
          <div className="flex justify-center gap-3 mt-1">
            <button onClick={() => openSafetyAddItemModal({ type: 'smoke_alarm' })} className="text-[12px] text-sage font-medium cursor-pointer hover:underline">+ Add smoke alarm</button>
            <span className="text-forest/20">·</span>
            <button onClick={() => openSafetyAddItemModal({ type: 'co_alarm' })} className="text-[12px] text-sage font-medium cursor-pointer hover:underline">+ Add CO alarm</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 mb-6">
          {[...smokeAlarms, ...coAlarms].map((item) => (
            <ItemCard key={item.id} item={item} onLog={() => openSafetyLogInspectionModal(item.id)} />
          ))}
        </div>
      )}

      {totalUnits === 0 && (
        <p className="text-[13px] text-forest/40 text-center py-4">
          Use "+ Add unit" to register fire safety equipment and start tracking compliance.
        </p>
      )}
    </div>
  );
}
