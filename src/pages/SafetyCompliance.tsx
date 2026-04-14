import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { useSafetyStore, type SafetyTab, safetyItemStatus, certExpiryStatus, CERT_TYPE_LABELS, DRILL_TYPE_LABELS } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import { useChecklistStore } from '@/store/checklistStore';
import { OverviewTab } from '@/components/safety/OverviewTab';
import { FireSafetyTab } from '@/components/safety/FireSafetyTab';
import { WaterSafetyTab } from '@/components/safety/WaterSafetyTab';
import { KitchenTab } from '@/components/safety/KitchenTab';
import { DrillsTab } from '@/components/safety/DrillsTab';
import { LogInspectionModal } from '@/components/safety/LogInspectionModal';
import { LogDrillModal } from '@/components/safety/LogDrillModal';
import { AddSafetyItemModal } from '@/components/safety/AddSafetyItemModal';
import { LogTempModal } from '@/components/safety/LogTempModal';
import { AddStaffModal } from '@/components/safety/AddStaffModal';
import { StaffCertModal } from '@/components/safety/StaffCertModal';

const TABS: { id: SafetyTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'fire', label: 'Fire safety' },
  { id: 'water', label: 'Water safety' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'drills', label: 'Drills & training' },
];

function exportComplianceReport(
  items: ReturnType<typeof useSafetyStore.getState>['items'],
  drills: ReturnType<typeof useSafetyStore.getState>['drills'],
  staff: ReturnType<typeof useSafetyStore.getState>['staff'],
  certifications: ReturnType<typeof useSafetyStore.getState>['certifications'],
) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  function statusLabel(item: (typeof items)[0]) {
    const s = safetyItemStatus(item);
    return s === 'alert' ? '<span style="color:#c0392b;font-weight:600">Overdue</span>' :
           s === 'warn'  ? '<span style="color:#c47d08;font-weight:600">Due soon</span>' :
                           '<span style="color:#1e6b1e;font-weight:600">Current</span>';
  }

  function itemTable(filteredItems: typeof items) {
    if (!filteredItems.length) return '<p style="color:#999;font-size:12px">No items on file.</p>';
    return `
      <table>
        <thead><tr><th>Item</th><th>Location</th><th>Units</th><th>Last Inspected</th><th>Next Due</th><th>Status</th></tr></thead>
        <tbody>
          ${filteredItems.map((i) => `
            <tr>
              <td>${i.name}</td>
              <td>${i.location}</td>
              <td>${i.unitCount}</td>
              <td>${i.lastInspected ? new Date(i.lastInspected + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
              <td>${i.nextDue ? new Date(i.nextDue + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
              <td>${statusLabel(i)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }

  const completedDrills = drills.filter((d) => d.status === 'completed');
  const scheduledDrills = drills.filter((d) => d.status === 'scheduled');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Safety & Compliance Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1a2e1a; padding: 32px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .sub { font-size: 12px; color: #666; margin-bottom: 28px; }
    h2 { font-size: 14px; font-weight: 700; margin-top: 28px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #1a2e1a; }
    h3 { font-size: 12px; font-weight: 700; margin-top: 16px; margin-bottom: 6px; color: #4a6741; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th { background: #1a2e1a; color: white; padding: 6px 10px; text-align: left; font-size: 11px; }
    td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
    tr:nth-child(even) td { background: #fafaf8; }
    .section-empty { color: #999; font-size: 11px; margin-bottom: 12px; }
    @media print { body { padding: 16px; } @page { margin: 1cm; } }
  </style>
</head>
<body>
  <h1>Safety &amp; Compliance Report</h1>
  <p class="sub">Generated ${today}</p>

  <h2>Fire Safety</h2>
  <h3>Fire Extinguishers</h3>${itemTable(items.filter(i => i.type === 'extinguisher'))}
  <h3>Smoke &amp; CO Alarms</h3>${itemTable(items.filter(i => i.type === 'smoke_alarm' || i.type === 'co_alarm'))}

  <h2>Water Safety</h2>
  <h3>Lifeguard Certifications</h3>
  ${staff.filter(s => s.isActive).length === 0 ? '<p class="section-empty">No staff on file.</p>' : `
    <table>
      <thead><tr><th>Name</th><th>Title</th>${['cpr_aed','mandatory_reporter','lifeguard','first_aid','wsi'].map(t => `<th>${CERT_TYPE_LABELS[t as keyof typeof CERT_TYPE_LABELS]}</th>`).join('')}</tr></thead>
      <tbody>
        ${staff.filter(s => s.isActive).map(s => {
          const certs = certifications.filter(c => c.staffId === s.id);
          return `<tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.title}</td>
            ${(['cpr_aed','mandatory_reporter','lifeguard','first_aid','wsi'] as const).map(type => {
              const cert = certs.filter(c => c.certType === type).sort((a,b) => (b.expiryDate ?? '').localeCompare(a.expiryDate ?? ''))[0];
              if (!cert) return '<td style="color:#999">—</td>';
              const status = certExpiryStatus(cert.expiryDate);
              const color = status === 'expired' ? '#c0392b' : status === 'expiring' ? '#c47d08' : '#1e6b1e';
              const label = status === 'expired' ? 'Expired' : status === 'expiring' ? 'Expiring' : 'Current';
              return `<td style="color:${color};font-weight:600">${label}${cert.expiryDate ? ` (${new Date(cert.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})` : ''}</td>`;
            }).join('')}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `}
  <h3>Waterfront Safety Checks</h3>${itemTable(items.filter(i => i.type === 'waterfront_check'))}

  <h2>Kitchen Safety</h2>
  <h3>Hood Fan Cleaning</h3>${itemTable(items.filter(i => i.type === 'hood_fan'))}
  <h3>Health Department Inspections</h3>${itemTable(items.filter(i => i.type === 'health_inspection'))}

  <h2>Drills &amp; Training</h2>
  <h3>Completed Drills</h3>
  ${completedDrills.length === 0 ? '<p class="section-empty">No completed drills on file.</p>' : `
    <table>
      <thead><tr><th>Drill Type</th><th>Date</th><th>Lead</th><th>Participants</th><th>Response Time</th><th>All Accounted</th></tr></thead>
      <tbody>
        ${completedDrills.sort((a,b) => (b.completedDate ?? b.scheduledDate).localeCompare(a.completedDate ?? a.scheduledDate)).map(d => `
          <tr>
            <td>${DRILL_TYPE_LABELS[d.drillType]}</td>
            <td>${new Date(d.completedDate ?? d.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
            <td>${d.lead || '—'}</td>
            <td>${d.participantCount ?? '—'}</td>
            <td>${d.responseTime ?? '—'}</td>
            <td>${d.allAccounted === null ? '—' : d.allAccounted ? 'Yes' : 'No'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `}
  ${scheduledDrills.length > 0 ? `<h3>Upcoming Scheduled Drills</h3>
    <table>
      <thead><tr><th>Drill Type</th><th>Scheduled Date</th><th>Lead</th></tr></thead>
      <tbody>
        ${scheduledDrills.sort((a,b) => a.scheduledDate.localeCompare(b.scheduledDate)).map(d => `
          <tr>
            <td>${DRILL_TYPE_LABELS[d.drillType]}</td>
            <td>${new Date(d.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
            <td>${d.lead || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }
}

export function SafetyCompliance() {
  const {
    activeTab, setActiveTab, items, drills, staff, certifications,
    allStats,
  } = useSafetyStore();
  const { season } = useChecklistStore();

  const {
    isSafetyLogInspectionModalOpen,
    isSafetyAddItemModalOpen,
    isLogDrillModalOpen,
    isLogTempModalOpen,
    isSafetyAddStaffModalOpen,
    isStaffCertModalOpen,
    openSafetyLogInspectionModal,
  } = useUIStore();

  const { overdue, dueSoon } = allStats();

  const subtitleParts = [season?.name ?? 'Current season'];
  if (overdue > 0) subtitleParts.push(`${overdue} overdue`);
  if (dueSoon > 0) subtitleParts.push(`${dueSoon} due this week`);

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title="Safety & compliance"
        subtitle={subtitleParts.join(' · ')}
        actions={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => exportComplianceReport(items, drills, staff, certifications)}
            >
              Export compliance report
            </Button>
            <Button size="sm" onClick={() => openSafetyLogInspectionModal()}>+ Log inspection</Button>
          </div>
        }
      />

      {/* Tab bar */}
      <div className="bg-white border-b border-border px-7 flex-shrink-0">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-body border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'text-forest font-semibold border-sage'
                  : 'text-forest/40 font-medium border-transparent hover:text-forest/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-7 py-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'fire'     && <FireSafetyTab />}
        {activeTab === 'water'    && <WaterSafetyTab />}
        {activeTab === 'kitchen'  && <KitchenTab />}
        {activeTab === 'drills'   && <DrillsTab />}
      </div>

      {/* Modals */}
      {isSafetyLogInspectionModalOpen && <LogInspectionModal />}
      {isSafetyAddItemModalOpen && <AddSafetyItemModal />}
      {isLogDrillModalOpen && <LogDrillModal />}
      {isLogTempModalOpen && <LogTempModal />}
      {isSafetyAddStaffModalOpen && <AddStaffModal />}
      {isStaffCertModalOpen && <StaffCertModal />}
    </div>
  );
}
