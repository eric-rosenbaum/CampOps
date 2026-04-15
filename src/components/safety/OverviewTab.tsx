import { useSafetyStore, safetyItemStatus, certExpiryStatus, CERT_TYPE_LABELS, DRILL_TYPE_LABELS } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { useChecklistStore } from '@/store/checklistStore';
import type { LicenseType } from '@/lib/types';

const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  health_permit: 'Health permit',
  state_camping: 'State camping license',
  food_service: 'Food service license',
  boating: 'Boating / watercraft permit',
  aca_accreditation: 'ACA accreditation',
  other: 'License / permit',
};

function ProgressBar({ label, ok, warn, alert, total }: { label: string; ok: number; warn: number; alert: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((ok / total) * 100);
  const isAmber = alert === 0 && warn > 0;
  return (
    <div className="bg-white border border-border rounded-card px-5 py-4 mb-3 flex items-center gap-6">
      <div className="flex-1">
        <p className="text-[13px] font-semibold text-forest mb-2">{label}</p>
        <div className="h-2 bg-cream-dark rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${isAmber ? 'bg-amber' : alert > 0 ? 'bg-red' : 'bg-sage'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[11px] text-forest/40 mt-1.5">
          {ok} of {total} items current
          {alert > 0 ? ` · ${alert} overdue` : ''}
          {warn > 0 ? ` · ${warn} due this week` : ''}
        </p>
      </div>
      <div className="flex gap-5 flex-shrink-0">
        {[
          { val: alert, label: 'Overdue', cls: alert > 0 ? 'text-red' : 'text-forest/30' },
          { val: warn, label: 'Due soon', cls: warn > 0 ? 'text-amber' : 'text-forest/30' },
          { val: ok, label: 'Current', cls: ok > 0 ? 'text-green-muted-text' : 'text-forest/30' },
        ].map(({ val, label, cls }) => (
          <div key={label} className="text-center">
            <p className={`text-[20px] font-semibold font-mono ${cls}`}>{val}</p>
            <p className="text-[10px] text-forest/40 uppercase tracking-wide mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewTab() {
  const {
    allStats, overdueItems, dueSoonItems, categoryStats, drills,
    staffWithCerts, licenses, items, tempLogs,
  } = useSafetyStore();
  const { season } = useChecklistStore();
  const { openSafetyLogInspectionModal, openAddLicenseModal } = useUIStore();

  const { overdue, dueSoon, compliant } = allStats();
  const overdue_items = overdueItems();
  const due_soon_items = dueSoonItems();

  const fireSt = categoryStats('fire');
  const waterSt = categoryStats('water');
  const kitchenSt = categoryStats('kitchen');

  const completedDrills = drills.filter((d) => d.status === 'completed').length;
  const scheduledDrills = drills.filter((d) => d.status === 'scheduled').length;
  const drillStats = {
    ok: completedDrills,
    warn: scheduledDrills,
    alert: 0,
    total: drills.filter((d) => d.status !== 'cancelled').length,
  };

  const acaDate = season?.acaInspectionDate;
  const acaDaysAway = acaDate
    ? Math.round((new Date(acaDate + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))
    : null;

  // Build action items list
  type ActionItem = { id: string; variant: 'alert' | 'warn'; message: string; action?: () => void; actionLabel?: string };
  const actionItems: ActionItem[] = [];

  // Overdue safety items
  overdue_items.forEach((item) => {
    actionItems.push({
      id: `item-${item.id}`,
      variant: 'alert',
      message: `${item.name} inspection is overdue`,
      action: () => openSafetyLogInspectionModal(item.id),
      actionLabel: 'Log now',
    });
  });

  // Expired licenses
  licenses.filter((l) => certExpiryStatus(l.expiryDate) === 'expired').forEach((l) => {
    actionItems.push({
      id: `lic-expired-${l.id}`,
      variant: 'alert',
      message: `${l.name} has expired`,
      action: () => openAddLicenseModal(l.id),
      actionLabel: 'Update',
    });
  });

  // Expired staff certs
  staffWithCerts().forEach(({ staff, certs }) => {
    certs.filter((c) => certExpiryStatus(c.expiryDate) === 'expired').forEach((c) => {
      actionItems.push({
        id: `cert-expired-${c.id}`,
        variant: 'alert',
        message: `${staff.name}'s ${CERT_TYPE_LABELS[c.certType]} has expired`,
      });
    });
  });

  // Items due soon
  due_soon_items.forEach((item) => {
    actionItems.push({
      id: `soon-${item.id}`,
      variant: 'warn',
      message: `${item.name} inspection due ${item.nextDue ? `${new Date(item.nextDue + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'soon'}`,
      action: () => openSafetyLogInspectionModal(item.id),
      actionLabel: 'Log',
    });
  });

  // Expiring licenses (within 30 days)
  licenses.filter((l) => certExpiryStatus(l.expiryDate) === 'expiring').forEach((l) => {
    actionItems.push({
      id: `lic-expiring-${l.id}`,
      variant: 'warn',
      message: `${l.name} expires ${l.expiryDate ? new Date(l.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'soon'}`,
      action: () => openAddLicenseModal(l.id),
      actionLabel: 'Update',
    });
  });

  // Expiring staff certs (30 days)
  staffWithCerts().forEach(({ staff, certs }) => {
    certs.filter((c) => certExpiryStatus(c.expiryDate) === 'expiring').forEach((c) => {
      actionItems.push({
        id: `cert-expiring-${c.id}`,
        variant: 'warn',
        message: `${staff.name}'s ${CERT_TYPE_LABELS[c.certType]} expires ${c.expiryDate ? new Date(c.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'soon'}`,
      });
    });
  });

  // Missing today's temp logs
  const today = new Date().toISOString().slice(0, 10);
  const refrigerationItems = items.filter((i) => i.type === 'refrigeration');
  refrigerationItems.forEach((item) => {
    const todayLogs = tempLogs.filter((l) => l.itemId === item.id && l.logDate === today);
    const hasAm = todayLogs.some((l) => l.session === 'am');
    const hasPm = todayLogs.some((l) => l.session === 'pm');
    if (!hasAm || !hasPm) {
      const missing = !hasAm && !hasPm ? 'AM and PM readings' : !hasAm ? 'AM reading' : 'PM reading';
      actionItems.push({
        id: `temp-${item.id}`,
        variant: 'warn',
        message: `${item.name}: missing today's ${missing}`,
      });
    }
  });

  const alerts = actionItems.filter((a) => a.variant === 'alert');
  const warnings = actionItems.filter((a) => a.variant === 'warn');

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <div className={`bg-white border border-border rounded-card px-4 py-4 ${overdue > 0 ? 'border-l-[3px] border-l-red' : ''}`}>
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Overdue items</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${overdue > 0 ? 'text-red' : 'text-green-muted-text'}`}>{overdue}</p>
          <p className="text-meta text-forest/40 mt-0.5">{overdue > 0 ? 'Require immediate action' : 'Nothing overdue'}</p>
        </div>
        <div className={`bg-white border border-border rounded-card px-4 py-4 ${dueSoon > 0 ? 'border-l-[3px] border-l-amber' : ''}`}>
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Due this week</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${dueSoon > 0 ? 'text-amber' : 'text-forest'}`}>{dueSoon}</p>
          <p className="text-meta text-forest/40 mt-0.5">{dueSoon > 0 ? 'Coming up soon' : 'Nothing due soon'}</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Compliant items</p>
          <p className="font-mono font-semibold text-stat mt-1 text-green-muted-text">{compliant}</p>
          <p className="text-meta text-forest/40 mt-0.5">Up to date</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">ACA inspection</p>
          {acaDate && acaDaysAway !== null ? (
            <>
              <p className="font-semibold text-[18px] mt-2 text-forest">
                {new Date(acaDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
              <p className={`text-meta mt-0.5 ${acaDaysAway <= 14 ? 'text-amber' : 'text-forest/40'}`}>
                {acaDaysAway > 0 ? `${acaDaysAway} days away` : acaDaysAway === 0 ? 'Today' : 'Past'}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-[18px] mt-2 text-forest/30">—</p>
              <p className="text-meta text-forest/40 mt-0.5">Not set in season</p>
            </>
          )}
        </div>
      </div>

      {/* Action items */}
      {actionItems.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[14px] font-semibold text-forest mb-3">Needs attention</h3>

          {alerts.length > 0 && (
            <div className="bg-red-bg border border-red/20 rounded-card px-4 py-3.5 mb-3">
              <p className="text-[12px] font-semibold text-red mb-2">
                {alerts.length} item{alerts.length === 1 ? '' : 's'} require immediate action
              </p>
              <div className="space-y-2">
                {alerts.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <span className="text-[12px] text-red/80">• {item.message}</span>
                    {item.action && (
                      <button onClick={item.action} className="text-[11px] font-semibold text-red hover:underline cursor-pointer flex-shrink-0 ml-4">
                        {item.actionLabel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="bg-amber-bg border border-amber/20 rounded-card px-4 py-3.5">
              <p className="text-[12px] font-semibold text-amber-text mb-2">
                {warnings.length} item{warnings.length === 1 ? '' : 's'} need attention soon
              </p>
              <div className="space-y-2">
                {warnings.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <span className="text-[12px] text-amber-text/80">• {item.message}</span>
                    {item.action && (
                      <button onClick={item.action} className="text-[11px] font-semibold text-amber-text hover:underline cursor-pointer flex-shrink-0 ml-4">
                        {item.actionLabel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {actionItems.length === 0 && (fireSt.total + waterSt.total + kitchenSt.total) > 0 && (
        <div className="bg-green-muted-bg border border-green-muted-text/20 rounded-card px-4 py-3.5 mb-6">
          <p className="text-[13px] font-semibold text-green-muted-text">All compliance items are current — no action needed.</p>
        </div>
      )}

      {/* Permits & Licenses */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-forest">Permits & licenses</h3>
        <button
          onClick={() => openAddLicenseModal()}
          className="text-[12px] text-sage font-medium hover:underline cursor-pointer"
        >
          + Add permit
        </button>
      </div>

      {licenses.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-5 py-6 text-center mb-6">
          <p className="text-[13px] text-forest/40">No permits or licenses on file.</p>
          <button onClick={() => openAddLicenseModal()} className="text-[12px] text-sage font-medium mt-1 cursor-pointer hover:underline">
            + Add health permit, state camping license, or other permit
          </button>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-card mb-6 overflow-hidden">
          {licenses.map((lic, i, arr) => {
            const status = certExpiryStatus(lic.expiryDate);
            const badge =
              status === 'expired' ? { text: 'Expired', cls: 'bg-red-bg text-red' } :
              status === 'expiring' ? { text: 'Expiring soon', cls: 'bg-amber-bg text-amber-text' } :
              lic.expiryDate ? { text: 'Valid', cls: 'bg-green-muted-bg text-green-muted-text' } :
              { text: 'No expiry on file', cls: 'bg-cream-dark text-forest/40' };
            return (
              <div
                key={lic.id}
                className={`flex items-center justify-between px-4 py-3 ${i < arr.length - 1 ? 'border-b border-cream-dark' : ''}`}
              >
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-[13px] font-medium text-forest">{lic.name}</p>
                  <p className="text-[11px] text-forest/40 mt-0.5">
                    {LICENSE_TYPE_LABELS[lic.licenseType]}
                    {lic.issuingAuthority ? ` · ${lic.issuingAuthority}` : ''}
                    {lic.expiryDate ? ` · Expires ${new Date(lic.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-tag uppercase tracking-wide ${badge.cls}`}>
                    {badge.text}
                  </span>
                  <button
                    onClick={() => openAddLicenseModal(lic.id)}
                    className="text-[11px] text-forest/40 hover:text-forest cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Category progress */}
      <h3 className="text-[14px] font-semibold text-forest mb-3.5">Compliance summary by category</h3>
      <ProgressBar label="Fire safety" {...fireSt} />
      <ProgressBar label="Water safety" {...waterSt} />
      <ProgressBar label="Kitchen safety" {...kitchenSt} />
      <ProgressBar
        label="Drills & training"
        ok={drillStats.ok}
        warn={drillStats.warn}
        alert={drillStats.alert}
        total={drillStats.total}
      />

      {(fireSt.total + waterSt.total + kitchenSt.total) === 0 && (
        <p className="text-[13px] text-forest/40 text-center py-8">
          No safety items set up yet. Use the Fire Safety, Water Safety, and Kitchen tabs to add items to track.
        </p>
      )}

      {/* Upcoming drills */}
      {drills.filter((d) => d.status === 'scheduled').length > 0 && (
        <div className="mt-6">
          <h3 className="text-[14px] font-semibold text-forest mb-3">Upcoming drills</h3>
          {drills
            .filter((d) => d.status === 'scheduled')
            .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
            .slice(0, 3)
            .map((d) => (
              <div key={d.id} className="bg-white border border-border border-l-[3px] border-l-amber rounded-card px-5 py-3.5 mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-forest">{DRILL_TYPE_LABELS[d.drillType]}</p>
                  <p className="text-[11px] text-forest/40 mt-0.5">
                    {new Date(d.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {d.lead ? ` · Lead: ${d.lead}` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-amber-bg text-amber-text">
                  Scheduled
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
