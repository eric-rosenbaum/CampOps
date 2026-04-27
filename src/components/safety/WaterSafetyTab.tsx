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


export function WaterSafetyTab() {
  const { staffWithCerts, certSummary, itemsByCategory, categoryStats } = useSafetyStore();
  const { openSafetyLogInspectionModal, openSafetyAddStaffModal, openStaffCertModal } = useUIStore();
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

    </div>
  );
}
