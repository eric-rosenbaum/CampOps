import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSafetyStore, certExpiryStatus, CERT_TYPE_LABELS } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/shared/Button';
import type { CertType } from '@/lib/types';

const ALL_CERT_TYPES: CertType[] = ['cpr_aed', 'mandatory_reporter', 'lifeguard', 'first_aid', 'wsi'];

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
            <h4 className="text-[13px] font-semibold text-forest">{CERT_TYPE_LABELS[certType]}</h4>
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
                      onClick={(e) => {
                        e.stopPropagation();
                        cert ? openStaffCertModal({ certId: cert.id }) : openStaffCertModal({ staffId: staff.id });
                      }}
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

export function StaffTab() {
  const { staff, certSummary, updateStaff } = useSafetyStore();
  const { openSafetyAddStaffModal, openStaffCertModal } = useUIStore();
  const { can } = useAuth();
  const [showInactive, setShowInactive] = useState(false);

  const activeStaff = staff.filter((s) => s.isActive);
  const inactiveStaff = staff.filter((s) => !s.isActive);

  const totalCerts = ALL_CERT_TYPES.reduce((sum, t) => {
    const s = certSummary(t);
    return sum + s.total;
  }, 0);
  const currentCerts = ALL_CERT_TYPES.reduce((sum, t) => {
    const s = certSummary(t);
    return sum + s.current;
  }, 0);
  const expiredCerts = ALL_CERT_TYPES.reduce((sum, t) => {
    const s = certSummary(t);
    return sum + s.expired;
  }, 0);
  const expiringCerts = ALL_CERT_TYPES.reduce((sum, t) => {
    const s = certSummary(t);
    return sum + s.expiring;
  }, 0);
  const certPct = totalCerts > 0 ? Math.round((currentCerts / totalCerts) * 100) : null;

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Active staff</p>
          <p className="font-mono font-semibold text-stat mt-1 text-forest">{activeStaff.length}</p>
          <p className="text-meta text-forest/40 mt-0.5">Staff members tracked</p>
        </div>
        <div className={`bg-white border border-border rounded-card px-4 py-4 ${expiredCerts > 0 ? 'border-l-[3px] border-l-red' : expiringCerts > 0 ? 'border-l-[3px] border-l-amber' : ''}`}>
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Cert compliance</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${certPct === 100 ? 'text-green-muted-text' : certPct !== null ? (expiredCerts > 0 ? 'text-red' : 'text-amber') : 'text-forest/30'}`}>
            {certPct !== null ? `${certPct}%` : '—'}
          </p>
          <p className="text-meta text-forest/40 mt-0.5">{totalCerts > 0 ? `${currentCerts} of ${totalCerts} certs current` : 'No certs on file'}</p>
        </div>
        <div className={`bg-white border border-border rounded-card px-4 py-4 ${expiredCerts > 0 ? 'border-l-[3px] border-l-red' : ''}`}>
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Expired</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${expiredCerts > 0 ? 'text-red' : 'text-forest/30'}`}>{expiredCerts}</p>
          <p className={`text-meta mt-0.5 ${expiredCerts > 0 ? 'text-red' : 'text-forest/40'}`}>{expiredCerts > 0 ? 'Need immediate renewal' : 'None expired'}</p>
        </div>
        <div className={`bg-white border border-border rounded-card px-4 py-4 ${expiringCerts > 0 ? 'border-l-[3px] border-l-amber' : ''}`}>
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Expiring soon</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${expiringCerts > 0 ? 'text-amber' : 'text-forest/30'}`}>{expiringCerts}</p>
          <p className="text-meta text-forest/40 mt-0.5">Within 30 days</p>
        </div>
      </div>

      {/* Staff roster */}
      <div className="flex items-center justify-between mb-3 mt-2">
        <h3 className="text-[14px] font-semibold text-forest">Staff roster</h3>
        <div className="flex gap-2">
          {can('manageSafetyCerts') && (
            <Button variant="ghost" size="sm" onClick={() => openStaffCertModal()}>+ Add certification</Button>
          )}
          {can('manageSafetyStaff') && (
            <Button variant="ghost" size="sm" onClick={() => openSafetyAddStaffModal()}>+ Add staff</Button>
          )}
        </div>
      </div>

      {activeStaff.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-10 text-center mb-6">
          <p className="text-[13px] text-forest/40">No staff added yet.</p>
          {can('manageSafetyStaff') && (
            <button onClick={() => openSafetyAddStaffModal()} className="text-[12px] text-sage font-medium mt-1 cursor-pointer hover:underline">
              + Add staff to track certifications
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-border rounded-card mb-6 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-cream-dark bg-cream">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Active staff — {activeStaff.length} members</p>
          </div>
          {activeStaff.map((s, i, arr) => (
            <div
              key={s.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i < arr.length - 1 ? 'border-b border-cream-dark' : ''}`}
            >
              <div>
                <span className="text-[13px] font-medium text-forest">{s.name}</span>
                <span className="text-[11px] text-forest/40 ml-2">{s.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openStaffCertModal({ staffId: s.id })}
                  className="text-[11px] text-sage hover:underline cursor-pointer"
                >
                  + Add cert
                </button>
                {can('manageSafetyStaff') && (
                  <button
                    onClick={() => openSafetyAddStaffModal(s.id)}
                    className="text-[11px] text-forest/40 hover:text-forest cursor-pointer"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
          {inactiveStaff.length > 0 && (
            <>
              <button
                onClick={() => setShowInactive(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2 border-t border-cream-dark bg-cream hover:bg-cream-dark transition-colors"
              >
                <p className="text-[11px] text-forest/40">
                  {inactiveStaff.length} inactive staff member{inactiveStaff.length === 1 ? '' : 's'}
                </p>
                {showInactive
                  ? <ChevronUp className="w-3.5 h-3.5 text-forest/30" />
                  : <ChevronDown className="w-3.5 h-3.5 text-forest/30" />}
              </button>
              {showInactive && inactiveStaff.map((s, i, arr) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between px-4 py-2.5 bg-cream/50 ${i < arr.length - 1 ? 'border-b border-cream-dark' : ''}`}
                >
                  <div>
                    <span className="text-[13px] font-medium text-forest/40">{s.name}</span>
                    <span className="text-[11px] text-forest/30 ml-2">{s.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {can('manageSafetyStaff') && (
                      <>
                        <button
                          onClick={() => updateStaff(s.id, { isActive: true })}
                          className="text-[11px] text-sage hover:underline cursor-pointer font-medium"
                        >
                          Reactivate
                        </button>
                        <button
                          onClick={() => openSafetyAddStaffModal(s.id)}
                          className="text-[11px] text-forest/30 hover:text-forest cursor-pointer"
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Cert summaries */}
      {activeStaff.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold text-forest">Certification compliance by type</h3>
          </div>
          {ALL_CERT_TYPES.map((certType) => (
            <CertSummaryCard key={certType} certType={certType} />
          ))}
          {ALL_CERT_TYPES.every((t) => certSummary(t).total === 0) && (
            <div className="bg-white border border-border rounded-card px-5 py-8 text-center">
              <p className="text-[13px] text-forest/40">No certifications on file yet.</p>
              <button
                onClick={() => openStaffCertModal()}
                className="text-[12px] text-sage font-medium mt-1 cursor-pointer hover:underline"
              >
                + Add first certification
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
