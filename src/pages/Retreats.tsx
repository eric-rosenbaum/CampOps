import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { useRetreatStore, type RetreatTab } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';

import { OverviewTab } from '@/components/retreats/OverviewTab';
import { ActiveRetreatTab } from '@/components/retreats/ActiveRetreatTab';
import { DocumentsTab } from '@/components/retreats/DocumentsTab';
import { HousingTab } from '@/components/retreats/HousingTab';
import { RetreatMenuTab } from '@/components/retreats/RetreatMenuTab';
import { ChangeRequestsTab } from '@/components/retreats/ChangeRequestsTab';
import { RetreatCostsTab } from '@/components/retreats/RetreatCostsTab';
import { PortalTab } from '@/components/retreats/PortalTab';
import { FeedbackTab } from '@/components/retreats/FeedbackTab';

import { RetreatFormModal } from '@/components/retreats/RetreatFormModal';
import { RespondRequestModal } from '@/components/retreats/RespondRequestModal';
import { SendReminderModal } from '@/components/retreats/SendReminderModal';
import { DocumentModal } from '@/components/retreats/DocumentModal';
import { AddMealModal } from '@/components/retreats/AddMealModal';
import { LogIssueModal } from '@/components/retreats/LogIssueModal';
import { InvoiceModal } from '@/components/retreats/InvoiceModal';
import { HousingHistoryModal } from '@/components/retreats/HousingHistoryModal';
import { SpacesModal } from '@/components/retreats/SpacesModal';
import { HousingAssignModal } from '@/components/retreats/HousingAssignModal';
import { ChecklistModal } from '@/components/retreats/ChecklistModal';
import { ScheduleItemModal } from '@/components/retreats/ScheduleItemModal';
import { CostModal } from '@/components/retreats/CostModal';
import { ChargeModal } from '@/components/retreats/ChargeModal';
import { PaymentModal } from '@/components/retreats/PaymentModal';
import { FeedbackModal } from '@/components/retreats/FeedbackModal';

const TABS: { id: RetreatTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'active', label: 'Active retreat' },
  { id: 'documents', label: 'Documents & compliance' },
  { id: 'housing', label: 'Housing' },
  { id: 'menu', label: 'Menu & dining' },
  { id: 'requests', label: 'Change requests' },
  { id: 'costs', label: 'Costs & invoice' },
  { id: 'portal', label: 'Guest portal' },
  { id: 'feedback', label: 'Feedback' },
];

export function Retreats() {
  const { activeTab, setActiveTab, modal, openModal, retreats, retreatsByStatus, pendingRequestCount } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const byStatus = retreatsByStatus();
  const pending = pendingRequestCount();
  const subtitle = `${retreats.length} retreat${retreats.length === 1 ? '' : 's'} · ${byStatus.active.length} active · ${pending} pending request${pending === 1 ? '' : 's'}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title="Retreat manager"
        subtitle={subtitle}
        actions={canManage ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'spaces' })}>Manage spaces</Button>
            <Button size="sm" onClick={() => openModal({ kind: 'newRetreat' })}>+ New retreat</Button>
          </div>
        ) : undefined}
      />

      <div className="bg-paper-raised border-b border-border px-4 sm:px-7 flex-shrink-0 overflow-x-auto overflow-y-hidden no-scrollbar">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px whitespace-nowrap border-b-[3px] px-4 pb-2.5 pt-3 text-[13px] font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-red text-forest'
                  : 'border-transparent text-ink-soft hover:text-forest'
              }`}
            >
              {tab.label}
              {tab.id === 'requests' && pending > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber text-white text-[10px] font-bold">{pending}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'active' && <ActiveRetreatTab />}
        {activeTab === 'documents' && <DocumentsTab />}
        {activeTab === 'housing' && <HousingTab />}
        {activeTab === 'menu' && <RetreatMenuTab />}
        {activeTab === 'requests' && <ChangeRequestsTab />}
        {activeTab === 'costs' && <RetreatCostsTab />}
        {activeTab === 'portal' && <PortalTab />}
        {activeTab === 'feedback' && <FeedbackTab />}
      </div>

      {modal?.kind === 'newRetreat' && <RetreatFormModal />}
      {modal?.kind === 'editRetreat' && <RetreatFormModal retreatId={modal.retreatId} />}
      {modal?.kind === 'respondRequest' && <RespondRequestModal requestId={modal.requestId} />}
      {modal?.kind === 'sendReminder' && <SendReminderModal retreatId={modal.retreatId} reminderType={modal.reminderType} />}
      {modal?.kind === 'uploadDoc' && <DocumentModal retreatId={modal.retreatId} docType={modal.docType} />}
      {modal?.kind === 'editDoc' && <DocumentModal retreatId={modal.retreatId} docId={modal.docId} />}
      {modal?.kind === 'addMeal' && <AddMealModal retreatId={modal.retreatId} mealId={modal.mealId} dayDate={modal.dayDate} mealPeriod={modal.mealPeriod} />}
      {modal?.kind === 'logIssue' && <LogIssueModal retreatId={modal.retreatId} issueId={modal.issueId} />}
      {modal?.kind === 'invoice' && <InvoiceModal retreatId={modal.retreatId} />}
      {modal?.kind === 'housingHistory' && <HousingHistoryModal retreatId={modal.retreatId} />}
      {modal?.kind === 'spaces' && <SpacesModal />}
      {modal?.kind === 'housingAssign' && <HousingAssignModal retreatId={modal.retreatId} housingId={modal.housingId} />}
      {modal?.kind === 'checklist' && <ChecklistModal retreatId={modal.retreatId} phase={modal.phase} />}
      {modal?.kind === 'scheduleItem' && <ScheduleItemModal retreatId={modal.retreatId} itemId={modal.itemId} />}
      {modal?.kind === 'cost' && <CostModal retreatId={modal.retreatId} costId={modal.costId} />}
      {modal?.kind === 'charge' && <ChargeModal retreatId={modal.retreatId} chargeId={modal.chargeId} />}
      {modal?.kind === 'payment' && <PaymentModal retreatId={modal.retreatId} defaultKind={modal.defaultKind} />}
      {modal?.kind === 'feedback' && <FeedbackModal retreatId={modal.retreatId} />}
    </div>
  );
}
