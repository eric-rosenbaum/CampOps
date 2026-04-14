import { useState } from 'react';
import { useSafetyStore, safetyItemStatus, certExpiryStatus, CERT_TYPE_LABELS } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { Button } from '@/components/shared/Button';
import type { SafetyStaff, StaffCertification } from '@/lib/types';

const LIFEGUARD_CERT_TYPES = ['lifeguard', 'cpr_aed', 'first_aid', 'wsi'] as const;

function CertPill({ cert, onClick }: { cert: StaffCertification | undefined; onClick: () => void }) {
  if (!cert) {
    return (
      <button onClick={onClick} className="text-[10px] px-2 py-0.5 rounded-tag bg-cream-dark text-forest/40 cursor-pointer hover:bg-cream-dark/80">
        — N/A
      </button>
    );
  }
  const status = certExpiryStatus(cert.expiryDate);
  const cls =
    status === 'expired' ? 'bg-red-bg text-red' :
    status === 'expiring' ? 'bg-amber-bg text-amber-text' :
    'bg-green-muted-bg text-green-muted-text';
  return (
    <button onClick={onClick} className={`text-[10px] font-semibold px-2 py-0.5 rounded-tag uppercase tracking-wide cursor-pointer ${cls}`}>
      {status === 'expired' ? 'Expired' : status === 'expiring' ? 'Expiring' : 'Current'}
    </button>
  );
}

function LifeguardCard({
  staff,
  certs,
  onAddCert,
  onEditCert,
  onEditStaff,
}: {
  staff: SafetyStaff;
  certs: StaffCertification[];
  onAddCert: () => void;
  onEditCert: (certId: string) => void;
  onEditStaff: () => void;
}) {
  const lgCert = certs.find((c) => c.certType === 'lifeguard');
  const hasExpired = certs.some((c) => certExpiryStatus(c.expiryDate) === 'expired');
  const hasExpiring = certs.some((c) => certExpiryStatus(c.expiryDate) === 'expiring');
  const borderCls = hasExpired ? 'border-l-red' : hasExpiring ? 'border-l-amber' : 'border-l-sage';

  return (
    <div className={`bg-white border border-border border-l-[3px] ${borderCls} rounded-card px-5 py-4`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="text-[13px] font-semibold text-forest">{staff.name}</h4>
          <p className="text-[11px] text-forest/40 mt-0.5">
            {staff.title}
            {lgCert ? ` · ${lgCert.certName}` : ''}
          </p>
        </div>
        <div className="text-right flex-shrink-0 flex items-start gap-2">
          <div>
            {hasExpired ? (
              <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-red-bg text-red">Cert expired</span>
            ) : hasExpiring ? (
              <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-amber-bg text-amber-text">Expiring soon</span>
            ) : certs.length > 0 ? (
              <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-green-muted-bg text-green-muted-text">All current</span>
            ) : (
              <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-cream-dark text-forest/40">No certs</span>
            )}
            {lgCert?.expiryDate && (
              <p className="font-mono text-[12px] text-forest/40 mt-1.5">
                Expires: {new Date(lgCert.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
          <button
            onClick={onEditStaff}
            className="text-[11px] text-sage hover:underline cursor-pointer mt-0.5 flex-shrink-0"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-cream-dark">
        {LIFEGUARD_CERT_TYPES.map((type) => {
          const cert = certs.find((c) => c.certType === type);
          return (
            <div key={type}>
              <p className="text-[10px] text-forest/40 font-medium mb-1">{CERT_TYPE_LABELS[type]}</p>
              <CertPill
                cert={cert}
                onClick={() => cert ? onEditCert(cert.id) : onAddCert()}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WATERFRONT_TYPE_LABELS: Record<string, string> = {
  life_ring: 'Life ring',
  rescue_tube: 'Rescue tube',
  rescue_board: 'Rescue board',
  waterfront_check: 'Daily check',
};

const RESULT_LABELS: Record<string, string> = {
  passed: 'Passed',
  passed_with_notes: 'Passed w/ notes',
  action_taken: 'Action taken',
  failed: 'Failed',
};

function WaterfrontItemCard({ item, onLog, onEdit }: { item: import('@/lib/types').SafetyItem; onLog: () => void; onEdit: () => void }) {
  const status = safetyItemStatus(item);
  const { recentLogsForItem } = useSafetyStore();
  const { openEditInspectionLogModal } = useUIStore();
  const [showHistory, setShowHistory] = useState(false);
  const recentLogs = recentLogsForItem(item.id, 7);
  const historyLogs = recentLogsForItem(item.id, 20);
  const borderCls = status === 'alert' ? 'border-l-red' : status === 'warn' ? 'border-l-amber' : 'border-l-sage';
  const meta = item.metadata as Record<string, string>;
  const isEquip = ['life_ring', 'rescue_tube', 'rescue_board'].includes(item.type);

  return (
    <div className={`bg-white border border-border border-l-[3px] ${borderCls} rounded-card px-5 py-4`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-4">
          <h4 className="text-[13px] font-semibold text-forest">{item.name}</h4>
          <p className="text-[11px] text-forest/40 mt-0.5">
            {WATERFRONT_TYPE_LABELS[item.type] ?? item.type} · {item.location}
            {item.unitCount > 1 ? ` · ×${item.unitCount}` : ''}
            {meta.condition ? ` · ${meta.condition.charAt(0).toUpperCase() + meta.condition.slice(1)} condition` : ''}
            {!isEquip ? ` · Required ${item.frequency}` : ''}
            {item.notes ? ` · ${item.notes}` : ''}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          {status === 'ok' && item.lastInspected ? (
            <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-green-muted-bg text-green-muted-text">
              {isEquip ? 'Checked' : 'Completed today'}
            </span>
          ) : status === 'alert' ? (
            <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-red-bg text-red">Overdue</span>
          ) : (
            <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-amber-bg text-amber-text">Due today</span>
          )}
          {item.lastInspected && (
            <p className="font-mono text-[12px] text-forest/40 mt-1.5">
              Last: {new Date(item.lastInspected + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>
      </div>

      {recentLogs.length > 0 && !isEquip && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-cream-dark flex-wrap">
          <span className="text-[11px] text-forest/40 mr-1">Recent checks:</span>
          {recentLogs.map((log) => (
            <span key={log.id} className="text-[11px] bg-cream-dark text-forest/60 px-2 py-0.5 rounded-tag font-mono">
              {new Date(log.inspectionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button variant="primary" size="sm" onClick={onLog}>{isEquip ? 'Log inspection' : 'Log check'}</Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
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

export function WaterSafetyTab() {
  const { staffWithCerts, certSummary, itemsByCategory, categoryStats } = useSafetyStore();
  const { openSafetyLogInspectionModal, openSafetyAddItemModal, openSafetyAddStaffModal, openStaffCertModal } = useUIStore();
  const { can } = useAuth();

  const allStaffWithCerts = staffWithCerts();
  // Show all active staff in lifeguard certifications section
  const lifeguards = allStaffWithCerts.filter(({ staff }) => staff.isActive);
  const lgSummary = certSummary('lifeguard');

  const waterfrontItems = itemsByCategory('water');
  const stats = categoryStats('water');

  const overdueWater = waterfrontItems.filter((i) => safetyItemStatus(i) === 'alert' && i.nextDue);

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Lifeguards</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${lifeguards.length > 0 ? 'text-green-muted-text' : 'text-forest/30'}`}>{lifeguards.length}</p>
          <p className="text-meta text-forest/40 mt-0.5">
            {lgSummary.current > 0 ? `${lgSummary.current} cert${lgSummary.current === 1 ? '' : 's'} current` : 'None certified'}
          </p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Rescue equipment</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${stats.ok > 0 ? 'text-green-muted-text' : 'text-forest/30'}`}>
            {stats.total > 0 ? (stats.alert === 0 ? '100%' : `${Math.round((stats.ok / stats.total) * 100)}%`) : '—'}
          </p>
          <p className="text-meta text-forest/40 mt-0.5">Checks current</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Expiring certs</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${lgSummary.expiring > 0 ? 'text-amber' : 'text-forest/30'}`}>{lgSummary.expiring}</p>
          <p className="text-meta text-forest/40 mt-0.5">Within 30 days</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Expired certs</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${lgSummary.expired > 0 ? 'text-red' : 'text-forest/30'}`}>{lgSummary.expired}</p>
          <p className={`text-meta mt-0.5 ${lgSummary.expired > 0 ? 'text-red' : 'text-forest/40'}`}>
            {lgSummary.expired > 0 ? 'Require immediate renewal' : 'All valid'}
          </p>
        </div>
      </div>

      {overdueWater.map((item) => (
        <AlertBanner
          key={item.id}
          variant="alert"
          message={`${item.name} is overdue. Waterfront operations require a current daily safety check to remain compliant.`}
          action={{ label: 'Log check', onClick: () => openSafetyLogInspectionModal(item.id) }}
        />
      ))}

      {/* Lifeguard certifications */}
      <div className="flex items-center justify-between mb-3 mt-2">
        <h3 className="text-[14px] font-semibold text-forest">Lifeguard certifications</h3>
        {can('manageSafetyStaff') && (
          <Button variant="ghost" size="sm" onClick={() => openSafetyAddStaffModal()}>+ Add lifeguard</Button>
        )}
      </div>

      {lifeguards.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-8 text-center mb-6">
          <p className="text-[13px] text-forest/40">No lifeguard certifications on file.</p>
          {can('manageSafetyStaff') && (
            <button onClick={() => openSafetyAddStaffModal()} className="text-[12px] text-sage font-medium mt-1 cursor-pointer hover:underline">
              + Add a lifeguard
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 mb-6">
          {lifeguards.map(({ staff, certs }) => (
            <LifeguardCard
              key={staff.id}
              staff={staff}
              certs={certs}
              onAddCert={() => openStaffCertModal({ staffId: staff.id })}
              onEditCert={(certId) => openStaffCertModal({ certId })}
              onEditStaff={() => openSafetyAddStaffModal(staff.id)}
            />
          ))}
        </div>
      )}

      {/* Waterfront rescue equipment */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-forest">Waterfront rescue equipment & checks</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => openSafetyLogInspectionModal()}>Log daily check</Button>
          {can('manageSafetyItems') && (
            <>
              <Button variant="ghost" size="sm" onClick={() => openSafetyAddItemModal({ type: 'life_ring' })}>+ Life ring</Button>
              <Button variant="ghost" size="sm" onClick={() => openSafetyAddItemModal({ type: 'rescue_tube' })}>+ Rescue tube</Button>
              <Button variant="ghost" size="sm" onClick={() => openSafetyAddItemModal({ type: 'rescue_board' })}>+ Rescue board</Button>
              <Button variant="ghost" size="sm" onClick={() => openSafetyAddItemModal({ type: 'waterfront_check' })}>+ Daily check</Button>
            </>
          )}
        </div>
      </div>

      {waterfrontItems.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-8 text-center">
          <p className="text-[13px] text-forest/40">No waterfront safety items set up yet.</p>
          {can('manageSafetyItems') && (
            <div className="flex justify-center gap-3 mt-1 flex-wrap">
              <button onClick={() => openSafetyAddItemModal({ type: 'life_ring' })} className="text-[12px] text-sage font-medium cursor-pointer hover:underline">+ Life ring</button>
              <span className="text-forest/20">·</span>
              <button onClick={() => openSafetyAddItemModal({ type: 'rescue_tube' })} className="text-[12px] text-sage font-medium cursor-pointer hover:underline">+ Rescue tube</button>
              <span className="text-forest/20">·</span>
              <button onClick={() => openSafetyAddItemModal({ type: 'rescue_board' })} className="text-[12px] text-sage font-medium cursor-pointer hover:underline">+ Rescue board</button>
              <span className="text-forest/20">·</span>
              <button onClick={() => openSafetyAddItemModal({ type: 'waterfront_check' })} className="text-[12px] text-sage font-medium cursor-pointer hover:underline">+ Daily check</button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {waterfrontItems.map((item) => (
            <WaterfrontItemCard
              key={item.id}
              item={item}
              onLog={() => openSafetyLogInspectionModal(item.id)}
              onEdit={() => openSafetyAddItemModal({ itemId: item.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
