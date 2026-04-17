import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { usePoolStore } from '@/store/poolStore';
import { useUIStore } from '@/store/uiStore';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { Button } from '@/components/shared/Button';
import type { PoolInspection, InspectionLogEntry } from '@/lib/types';

function statusBorderColor(status: PoolInspection['status']) {
  if (status === 'overdue') return 'border-l-red';
  if (status === 'due') return 'border-l-amber';
  return 'border-l-sage';
}

function StatusBadge({ status, nextDue }: { status: PoolInspection['status']; nextDue: string | null }) {
  if (status === 'overdue') {
    const daysOverdue = nextDue
      ? Math.round((Date.now() - new Date(nextDue).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return (
      <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-red-bg text-red">
        Overdue{daysOverdue != null && daysOverdue > 0 ? ` ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}` : ''}
      </span>
    );
  }
  if (status === 'due' && nextDue) {
    const daysUntil = Math.round(
      (new Date(nextDue).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return (
      <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-amber-bg text-amber-text">
        Due in {daysUntil} day{daysUntil === 1 ? '' : 's'}
      </span>
    );
  }
  return (
    <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-green-muted-bg text-green-muted-text">
      Completed
    </span>
  );
}

const RESULT_LABELS: Record<InspectionLogEntry['result'], { label: string; cls: string }> = {
  passed: { label: 'Passed', cls: 'bg-green-muted-bg text-green-muted-text' },
  passed_with_notes: { label: 'Passed w/ notes', cls: 'bg-amber-bg text-amber-text' },
  conditional: { label: 'Conditional', cls: 'bg-amber-bg text-amber-text' },
  failed: { label: 'Failed', cls: 'bg-red-bg text-red' },
};

// Map hardcoded option values to readable names
const TYPE_LABELS: Record<string, string> = {
  health_dept: 'Health dept. water quality',
  aca_waterfront: 'ACA waterfront safety',
  equipment_monthly: 'Pool equipment monthly service',
  lifeguard_cert: 'Lifeguard certification verification',
  pre_season: 'Pre-season pool opening',
  end_of_season: 'End-of-season closing',
  other: 'Other',
};

function InspectionLogRow({
  entry,
  inspections,
  isLast,
  onEdit,
}: {
  entry: InspectionLogEntry;
  inspections: PoolInspection[];
  isLast: boolean;
  onEdit: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const matchedInsp = inspections.find((i) => i.id === entry.inspectionId);
  const typeName = matchedInsp?.name ?? TYPE_LABELS[entry.inspectionId] ?? entry.inspectionId ?? 'Inspection';
  const result = RESULT_LABELS[entry.result];

  return (
    <div
      className={`flex items-start justify-between px-5 py-3.5 transition-colors ${hovered ? 'bg-cream/40' : ''} ${isLast ? '' : 'border-b border-cream-dark'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-body font-medium text-forest">{typeName}</p>
        <p className="text-meta text-forest/40 mt-0.5">
          {new Date(entry.inspectionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {' · '}Conducted by {entry.conductedBy}
          {entry.notes ? ` · ${entry.notes}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={`text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide ${result.cls}`}>
          {result.label}
        </span>
        {entry.nextDue && (
          <span className="text-meta text-forest/40 font-mono">
            Next: {new Date(entry.nextDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        <button
          type="button"
          onClick={onEdit}
          className={`p-1.5 rounded text-forest/40 hover:text-forest hover:bg-cream transition-all ${hovered ? 'opacity-100' : 'opacity-0'}`}
          title="Edit record"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function InspectionsTab() {
  const { activeInspections, activeInspectionLog } = usePoolStore();
  const { openLogInspectionModal, openEditPoolInspectionLogModal } = useUIStore();

  const inspections = activeInspections();
  const inspectionLog = activeInspectionLog();
  const completed = inspections.filter((i) => i.status === 'ok').length;
  const comingDue = inspections.filter((i) => i.status === 'due').length;
  const overdue = inspections.filter((i) => i.status === 'overdue').length;
  const nextInspection = inspections.find((i) => i.status === 'due');

  const overdueItems = inspections.filter((i) => i.status === 'overdue');

  return (
    <div>
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        {[
          { label: 'Completed', value: completed, hint: 'This session', cls: 'text-green-muted-text' },
          { label: 'Coming due', value: comingDue, hint: 'Within 14 days', cls: comingDue > 0 ? 'text-amber' : 'text-forest' },
          { label: 'Overdue', value: overdue, hint: 'Needs immediate action', cls: overdue > 0 ? 'text-red' : 'text-forest' },
          {
            label: 'Next inspection',
            value: nextInspection?.nextDue ? new Date(nextInspection.nextDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
            hint: nextInspection?.name ?? 'None scheduled',
            cls: 'text-forest text-[18px]',
          },
        ].map(({ label, value, hint, cls }) => (
          <div key={label} className="bg-white border border-border rounded-card px-4 py-4">
            <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">{label}</p>
            <p className={`font-mono font-semibold mt-1 ${cls.includes('text-[18px]') ? 'text-[18px]' : 'text-stat'} ${cls}`}>
              {value}
            </p>
            <p className="text-meta text-forest/40 mt-0.5">{hint}</p>
          </div>
        ))}
      </div>

      {/* Overdue alert banners */}
      {overdueItems.map((insp) => (
        <AlertBanner
          key={insp.id}
          variant="alert"
          message={`${insp.name} is overdue. This is required to remain in compliance. Contact your county health office to reschedule immediately.`}
          action={{ label: 'Log contact made', onClick: () => openLogInspectionModal(insp.id) }}
        />
      ))}

      {/* Inspection list */}
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-card-title font-semibold text-forest">Inspection schedule</h3>
        <Button variant="ghost" size="sm" onClick={() => openLogInspectionModal()}>+ Log inspection</Button>
      </div>

      {inspections.length === 0 && inspectionLog.length === 0 && (
        <p className="text-body text-forest/40 text-center py-12">No inspection schedule set up yet. Use "+ Log inspection" to record a completed inspection.</p>
      )}

      <div className="flex flex-col gap-2.5">
        {inspections.map((insp) => (
          <div
            key={insp.id}
            className={`bg-white border border-border border-l-[3px] rounded-card px-5 py-4 ${statusBorderColor(insp.status)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <h4 className="text-card-title font-semibold text-forest">{insp.name}</h4>
                <p className="text-meta text-forest/40 mt-0.5 leading-relaxed">
                  {insp.frequency} · {insp.authority}
                  {insp.standard ? ` · ${insp.standard}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <StatusBadge status={insp.status} nextDue={insp.nextDue} />
                {insp.nextDue && (
                  <p className="font-mono text-secondary text-forest/50 mt-1.5">
                    {insp.status === 'ok' ? 'Valid through:' : 'Due:'}{' '}
                    {new Date(insp.nextDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )}
                {insp.lastCompleted && (
                  <p className="text-meta text-forest/40 mt-0.5">
                    {insp.status === 'ok' ? 'Completed:' : 'Frequency:'}{' '}
                    {insp.status === 'ok'
                      ? new Date(insp.lastCompleted).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : insp.frequency}
                  </p>
                )}
              </div>
            </div>

            {/* History chips */}
            {insp.history.length > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-cream-dark flex-wrap">
                <span className="text-meta text-forest/40 mr-1">
                  {insp.status === 'ok' && insp.id === 'pi4' ? 'Lifeguards verified:' : insp.status === 'ok' ? 'Items checked:' : 'Past inspections:'}
                </span>
                {insp.history.map((item) => (
                  <span
                    key={item}
                    className="text-meta bg-cream-dark text-forest/60 px-2 py-0.5 rounded-tag font-mono"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              {insp.status !== 'ok' && (
                <Button variant="primary" size="sm" onClick={() => openLogInspectionModal(insp.id)}>
                  Log inspection
                </Button>
              )}
              <Button variant="ghost" size="sm">
                {insp.status === 'ok' ? 'View records' : 'View requirements'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Inspection log history */}
      {inspectionLog.length > 0 && (
        <div className="mt-8">
          <h3 className="text-card-title font-semibold text-forest mb-3.5">Inspection log</h3>
          <div className="bg-white border border-border rounded-card overflow-hidden">
            {[...inspectionLog]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((entry, idx, arr) => (
                <InspectionLogRow
                  key={entry.id}
                  entry={entry}
                  inspections={inspections}
                  isLast={idx === arr.length - 1}
                  onEdit={() => openEditPoolInspectionLogModal(entry.id)}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
