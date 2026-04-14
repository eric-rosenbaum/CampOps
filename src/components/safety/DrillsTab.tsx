import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useSafetyStore, certExpiryStatus, CERT_TYPE_LABELS, DRILL_TYPE_LABELS } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/shared/Button';
import type { EmergencyDrill, CertType } from '@/lib/types';

const ALL_CERT_TYPES: CertType[] = ['cpr_aed', 'mandatory_reporter', 'lifeguard', 'first_aid', 'wsi'];
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

function CertSummaryCard({ certType }: { certType: CertType }) {
  const { certSummary, staffWithCerts } = useSafetyStore();
  const { openStaffCertModal } = useUIStore();
  const { can } = useAuth();

  const summary = certSummary(certType);
  const allStaff = staffWithCerts();
  const [expanded, setExpanded] = useState(false);

  if (summary.total === 0) return null;

  const pct = Math.round((summary.current / summary.total) * 100);
  const status = summary.expired > 0 ? 'alert' : summary.expiring > 0 || summary.uncertified > 0 ? 'warn' : 'ok';
  const borderCls = status === 'alert' ? 'border-l-red' : status === 'warn' ? 'border-l-amber' : 'border-l-sage';

  return (
    <div className={`bg-white border border-border border-l-[3px] ${borderCls} rounded-card px-5 py-4 mb-2.5`}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="text-[13px] font-semibold text-forest">{CERT_TYPE_LABELS[certType]} certification</h4>
            <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-tag uppercase tracking-wide ${
              status === 'alert' ? 'bg-red-bg text-red' :
              status === 'warn' ? 'bg-amber-bg text-amber-text' :
              'bg-green-muted-bg text-green-muted-text'
            }`}>
              {summary.current}/{summary.total} current
            </span>
          </div>
          <div className="h-1.5 bg-cream-dark rounded-full overflow-hidden">
            <div
              className={`h-1.5 rounded-full ${status === 'alert' ? 'bg-red' : status === 'warn' ? 'bg-amber' : 'bg-sage'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] text-forest/40 mt-1">
            {summary.current} current
            {summary.expiring > 0 ? ` · ${summary.expiring} expiring soon` : ''}
            {summary.expired > 0 ? ` · ${summary.expired} expired` : ''}
            {summary.uncertified > 0 ? ` · ${summary.uncertified} not on file` : ''}
          </p>
        </div>
        <span className="text-[11px] text-forest/40 ml-4">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-cream-dark space-y-1">
          {allStaff.filter(({ staff }) => staff.isActive).map(({ staff, certs }) => {
            const cert = certs
              .filter((c) => c.certType === certType)
              .sort((a, b) => (b.expiryDate ?? '').localeCompare(a.expiryDate ?? ''))[0];
            const certStatus = cert ? certExpiryStatus(cert.expiryDate) : 'none';
            return (
              <div key={staff.id} className="flex items-center justify-between py-1.5">
                <div>
                  <span className="text-[12px] font-medium text-forest">{staff.name}</span>
                  <span className="text-[11px] text-forest/40 ml-1.5">— {staff.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  {cert?.expiryDate && (
                    <span className="text-[11px] font-mono text-forest/40">
                      Exp: {new Date(cert.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-tag uppercase tracking-wide ${
                    certStatus === 'expired' ? 'bg-red-bg text-red' :
                    certStatus === 'expiring' ? 'bg-amber-bg text-amber-text' :
                    certStatus === 'ok' ? 'bg-green-muted-bg text-green-muted-text' :
                    'bg-cream-dark text-forest/40'
                  }`}>
                    {certStatus === 'none' ? 'Not on file' : certStatus === 'ok' ? 'Current' : certStatus === 'expiring' ? 'Expiring' : 'Expired'}
                  </span>
                  {can('manageSafetyCerts') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); cert ? openStaffCertModal({ certId: cert.id }) : openStaffCertModal({ staffId: staff.id }); }}
                      className="text-[11px] text-sage hover:underline cursor-pointer"
                    >
                      {cert ? 'Edit' : '+ Add'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DrillsTab() {
  const { drills, staff, certSummary, completedDrillCount } = useSafetyStore();
  const { openScheduleDrillModal, openLogDrillModal, openSafetyAddStaffModal } = useUIStore();
  const { can } = useAuth();

  const completed = drills.filter((d) => d.status === 'completed');
  const scheduled = drills.filter((d) => d.status === 'scheduled');
  const fireDrillsDone = completedDrillCount('fire_evacuation');

  const cprSummary = certSummary('cpr_aed');
  const cprPct = cprSummary.total > 0 ? Math.round((cprSummary.current / cprSummary.total) * 100) : null;

  const nextDrill = scheduled.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] ?? null;

  const acaMet = REQUIRED_DRILL_TYPES.every((type) => completedDrillCount(type) > 0);


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
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">ACA requirement</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${drills.length === 0 ? 'text-forest/30' : acaMet ? 'text-green-muted-text' : 'text-amber'}`}>
            {drills.length === 0 ? '—' : acaMet ? 'Met' : 'In progress'}
          </p>
          <p className="text-meta text-forest/40 mt-0.5">All mandatory drills</p>
        </div>
      </div>

      {/* Drills section */}
      <div className="flex items-center justify-between mb-3 mt-2">
        <h3 className="text-[14px] font-semibold text-forest">Emergency drills</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={openScheduleDrillModal}>+ Schedule drill</Button>
          <Button variant="ghost" size="sm" onClick={() => openLogDrillModal()}>+ Log completed</Button>
        </div>
      </div>

      {drills.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-10 text-center mb-6">
          <p className="text-[13px] text-forest/40">No drills logged yet.</p>
          <div className="flex justify-center gap-3 mt-2">
            <button onClick={openScheduleDrillModal} className="text-[12px] text-sage font-medium cursor-pointer hover:underline">+ Schedule upcoming drill</button>
            <span className="text-forest/20">·</span>
            <button onClick={() => openLogDrillModal()} className="text-[12px] text-sage font-medium cursor-pointer hover:underline">+ Log completed drill</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 mb-6">
          {/* Scheduled first */}
          {scheduled
            .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
            .map((d) => <DrillCard key={d.id} drill={d} />)}
          {/* Then completed, newest first */}
          {[...completed]
            .sort((a, b) => (b.completedDate ?? b.scheduledDate).localeCompare(a.completedDate ?? a.scheduledDate))
            .map((d) => <DrillCard key={d.id} drill={d} />)}
        </div>
      )}

      {/* Staff safety training */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-forest">Staff safety training</h3>
        <div className="flex gap-2">
          {can('manageSafetyStaff') && (
            <Button variant="ghost" size="sm" onClick={() => openSafetyAddStaffModal()}>+ Add staff</Button>
          )}
        </div>
      </div>

      {staff.filter((s) => s.isActive).length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-10 text-center">
          <p className="text-[13px] text-forest/40">No staff added yet.</p>
          {can('manageSafetyStaff') && (
            <button onClick={() => openSafetyAddStaffModal()} className="text-[12px] text-sage font-medium mt-1 cursor-pointer hover:underline">
              + Add staff to track certifications
            </button>
          )}
        </div>
      ) : (
        <div>
          {/* Staff roster */}
          <div className="bg-white border border-border rounded-card mb-4 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-cream-dark bg-cream">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Staff roster</p>
            </div>
            {staff.filter((s) => s.isActive).map((s, i, arr) => (
              <div
                key={s.id}
                className={`flex items-center justify-between px-4 py-2.5 ${i < arr.length - 1 ? 'border-b border-cream-dark' : ''}`}
              >
                <div>
                  <span className="text-[13px] font-medium text-forest">{s.name}</span>
                  <span className="text-[11px] text-forest/40 ml-2">{s.title}</span>
                </div>
                {can('manageSafetyStaff') && (
                  <button
                    onClick={() => openSafetyAddStaffModal(s.id)}
                    className="text-[11px] text-sage hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Cert summary by type */}
          {ALL_CERT_TYPES.map((certType) => (
            <CertSummaryCard key={certType} certType={certType} />
          ))}
        </div>
      )}
    </div>
  );
}
