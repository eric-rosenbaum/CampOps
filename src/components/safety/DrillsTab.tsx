import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useSafetyStore, DRILL_TYPE_LABELS } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { Button } from '@/components/shared/Button';
import type { EmergencyDrill } from '@/lib/types';

const REQUIRED_DRILL_TYPES: EmergencyDrill['drillType'][] = ['fire_evacuation', 'nighttime_cabin', 'missing_swimmer', 'severe_weather'];

function DrillCard({ drill }: { drill: EmergencyDrill }) {
  const { openLogDrillModal } = useUIStore();
  const [hovered, setHovered] = useState(false);

  const isScheduled = drill.status === 'scheduled';
  const isCompleted = drill.status === 'completed';
  const drillDate = isCompleted && drill.completedDate ? drill.completedDate : drill.scheduledDate;
  const drillLabel = DRILL_TYPE_LABELS[drill.drillType];
  const displayName = drill.drillType === 'other' && drill.drillName ? drill.drillName : drillLabel;
  const borderCls = isScheduled ? 'border-l-amber' : isCompleted ? 'border-l-sage' : 'border-l-forest/20';

  return (
    <div
      className={`bg-white border border-border border-l-[3px] ${borderCls} rounded-card px-5 py-4`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-4">
          <h4 className="text-[13px] font-semibold text-forest">{displayName}</h4>
          <p className="text-[11px] text-forest/40 mt-0.5 leading-relaxed">
            {drill.lead ? `Lead: ${drill.lead}` : ''}
            {drill.lead && drill.participantCount ? ' · ' : ''}
            {drill.participantCount ? `${drill.participantCount} participants` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isScheduled && (
            <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-amber-bg text-amber-text">
              Scheduled {new Date(drill.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {isCompleted && (
            <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-green-muted-bg text-green-muted-text">
              Completed
            </span>
          )}
          {drill.status === 'cancelled' && (
            <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-cream-dark text-forest/40">
              Cancelled
            </span>
          )}
          <button
            onClick={() => openLogDrillModal(drill.id)}
            className={`p-1.5 rounded text-forest/40 hover:text-forest hover:bg-cream transition-all ${hovered ? 'opacity-100' : 'opacity-0'}`}
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isCompleted && (
        <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-cream-dark">
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Date</p>
            <p className="text-[12px] font-semibold font-mono text-forest">
              {new Date(drillDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Response time</p>
            <p className={`text-[12px] font-semibold font-mono ${drill.responseTime ? 'text-green-muted-text' : 'text-forest/30'}`}>
              {drill.responseTime ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">All accounted</p>
            <p className={`text-[12px] font-semibold ${drill.allAccounted === null ? 'text-forest/30' : drill.allAccounted ? 'text-green-muted-text' : 'text-red'}`}>
              {drill.allAccounted === null ? '—' : drill.allAccounted ? 'Yes' : 'No — see notes'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-forest/40 font-medium mb-0.5">Participants</p>
            <p className="text-[12px] font-medium text-forest">{drill.participantCount ?? '—'}</p>
          </div>
        </div>
      )}

      {drill.notes && (
        <p className="text-[11px] text-forest/50 mt-3 pt-3 border-t border-cream-dark leading-relaxed">{drill.notes}</p>
      )}

      {isScheduled && (
        <div className="flex gap-2 mt-3">
          <Button variant="primary" size="sm" onClick={() => openLogDrillModal(drill.id)}>Log when complete</Button>
          <Button variant="ghost" size="sm" onClick={() => openLogDrillModal(drill.id)}>Edit / cancel</Button>
        </div>
      )}
    </div>
  );
}

export function DrillsTab() {
  const { drills, certSummary, completedDrillCount } = useSafetyStore();
  const { openScheduleDrillModal, openLogDrillModal } = useUIStore();

  const completed = drills.filter((d) => d.status === 'completed');
  const scheduled = drills.filter((d) => d.status === 'scheduled');
  const fireDrillsDone = completedDrillCount('fire_evacuation');

  const cprSummary = certSummary('cpr_aed');
  const cprPct = cprSummary.total > 0 ? Math.round((cprSummary.current / cprSummary.total) * 100) : null;

  const nextDrill = [...scheduled].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] ?? null;
  const acaMet = REQUIRED_DRILL_TYPES.every((type) => completedDrillCount(type) > 0);

  // Which required drill types still haven't been completed?
  const missingDrillTypes = REQUIRED_DRILL_TYPES.filter((type) => completedDrillCount(type) === 0);

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Fire drills</p>
          <p className="font-mono font-semibold text-stat mt-1 text-green-muted-text">{fireDrillsDone}</p>
          <p className="text-meta text-forest/40 mt-0.5">Completed this season</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Staff CPR certified</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${cprPct === 100 ? 'text-green-muted-text' : cprPct !== null ? 'text-amber' : 'text-forest/30'}`}>
            {cprPct !== null ? `${cprPct}%` : '—'}
          </p>
          <p className="text-meta text-forest/40 mt-0.5">
            {cprSummary.total > 0 ? `${cprSummary.current} of ${cprSummary.total} staff` : 'No staff added'}
          </p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Next drill</p>
          {nextDrill ? (
            <>
              <p className="font-semibold text-[18px] mt-2 text-forest">
                {new Date(nextDrill.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
              <p className="text-meta text-forest/40 mt-0.5 truncate">{DRILL_TYPE_LABELS[nextDrill.drillType]}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-[18px] mt-2 text-forest/30">—</p>
              <p className="text-meta text-forest/40 mt-0.5">None scheduled</p>
            </>
          )}
        </div>
        <div className={`bg-white border border-border rounded-card px-4 py-4 ${drills.length > 0 && !acaMet ? 'border-l-[3px] border-l-amber' : ''}`}>
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">ACA requirement</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${drills.length === 0 ? 'text-forest/30' : acaMet ? 'text-green-muted-text' : 'text-amber'}`}>
            {drills.length === 0 ? '—' : acaMet ? 'Met' : 'In progress'}
          </p>
          <p className="text-meta text-forest/40 mt-0.5">All mandatory drill types</p>
        </div>
      </div>

      {/* ACA drill requirement checklist */}
      {missingDrillTypes.length > 0 && drills.length > 0 && (
        <div className="bg-amber-bg border border-amber/20 rounded-card px-4 py-3.5 mb-5">
          <p className="text-[12px] font-semibold text-amber-text mb-1">ACA required drills not yet completed this season:</p>
          <ul className="text-[11px] text-amber-text/80 space-y-0.5">
            {missingDrillTypes.map((t) => (
              <li key={t}>• {DRILL_TYPE_LABELS[t]}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Drills list */}
      <div className="flex items-center justify-between mb-3 mt-2">
        <h3 className="text-[14px] font-semibold text-forest">Emergency drills</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={openScheduleDrillModal}>+ Schedule drill</Button>
          <Button variant="ghost" size="sm" onClick={() => openLogDrillModal()}>+ Log completed</Button>
        </div>
      </div>

      {drills.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-10 text-center">
          <p className="text-[13px] text-forest/40">No drills logged yet.</p>
          <div className="flex justify-center gap-3 mt-2">
            <button onClick={openScheduleDrillModal} className="text-[12px] text-sage font-medium cursor-pointer hover:underline">+ Schedule upcoming drill</button>
            <span className="text-forest/20">·</span>
            <button onClick={() => openLogDrillModal()} className="text-[12px] text-sage font-medium cursor-pointer hover:underline">+ Log completed drill</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {scheduled
            .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
            .map((d) => <DrillCard key={d.id} drill={d} />)}
          {[...completed]
            .sort((a, b) => (b.completedDate ?? b.scheduledDate).localeCompare(a.completedDate ?? a.scheduledDate))
            .map((d) => <DrillCard key={d.id} drill={d} />)}
        </div>
      )}
    </div>
  );
}
