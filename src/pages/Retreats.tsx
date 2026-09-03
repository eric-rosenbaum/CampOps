import { ArrowLeft } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { useRetreatStore, type RetreatTab } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { fmtRange, GROUP_TYPE_LABELS, billableHeadcount } from '@/components/retreats/retreatUi';

import { OverviewTab } from '@/components/retreats/OverviewTab';
import { ActiveRetreatTab } from '@/components/retreats/ActiveRetreatTab';
import { DocumentsTab } from '@/components/retreats/DocumentsTab';
import { HousingTab } from '@/components/retreats/HousingTab';
import { RetreatMenuTab } from '@/components/retreats/RetreatMenuTab';
import { ChangeRequestsTab } from '@/components/retreats/ChangeRequestsTab';
import { RetreatCostsTab } from '@/components/retreats/RetreatCostsTab';
import { RetreatCostsDetailTab } from '@/components/retreats/RetreatCostsDetailTab';
import { PortalTab } from '@/components/retreats/PortalTab';
import { FeedbackTab } from '@/components/retreats/FeedbackTab';
import { PipelineTab } from '@/components/retreats/PipelineTab';
import { SpacesTab } from '@/components/retreats/SpacesTab';
import { TurnoverCard } from '@/components/retreats/TurnoverCard';
import { ContactsPanel } from '@/components/retreats/ContactsPanel';
import { TouchpointsPanel } from '@/components/retreats/TouchpointsPanel';
import { ProposalsPanel } from '@/components/retreats/ProposalsPanel';
import { AddonsPanel } from '@/components/retreats/AddonsPanel';
import { OutboxPanel } from '@/components/retreats/OutboxPanel';
import { RentalsReview } from '@/components/retreats/RentalsReview';
import { PropertyCalendar } from '@/components/campground/PropertyCalendar';

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

// Two tabs answer questions about the season as a whole; the rest only make sense once you
// have said which group you mean. Splitting them is what stops someone changing tabs and
// quietly editing a different retreat than the one they thought they were looking at.
const SEASON_TABS: { id: RetreatTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  // The half of the job that happens before a booking exists. It sits second because a season
  // with nothing in the pipeline is the problem you want to notice in February, not in June.
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'costs', label: 'Costs & invoice' },
  { id: 'rentalsReview', label: 'Occupancy & revenue' },
  // The one screen where both halves of the product are visibly the same product: sessions,
  // groups, space bookings, out-of-service rooms and the turnover days where a departure and an
  // arrival meet. It lives here because "who is here this week, and what is free in October" is
  // a rentals question that only has an honest answer if you can also see the work.
  { id: 'calendar', label: 'Property calendar' },
  { id: 'outbox', label: 'Reminders' },
  { id: 'addons', label: 'Extras' },
];

const RETREAT_TABS: { id: RetreatTab; label: string }[] = [
  { id: 'active', label: 'Active retreat' },
  { id: 'documents', label: 'Documents & compliance' },
  { id: 'housing', label: 'Housing' },
  // Everything this group turns into work for the property team: the spaces they asked for, and
  // the cabins somebody has to turn over after they leave. Grouped together on purpose — it is
  // one question ("what does hosting them actually cost us in labour"), not two.
  { id: 'spaces', label: 'Spaces & set-up' },
  { id: 'relationship', label: 'Contacts & proposals' },
  { id: 'menu', label: 'Menu & dining' },
  { id: 'retreatCosts', label: 'Costs & invoice' },
  { id: 'requests', label: 'Requests' },
  { id: 'portal', label: 'Guest portal' },
  { id: 'feedback', label: 'Feedback' },
];

export function Retreats() {
  const {
    activeTab, setActiveTab, modal, openModal, retreats, retreatsByStatus,
    pendingRequestCount, selectedRetreat, exitRetreat,
  } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const byStatus = retreatsByStatus();
  const pending = pendingRequestCount();
  const retreat = selectedRetreat();

  // A per-retreat tab left selected after stepping out would render an empty shell, so the
  // view falls back to the season overview.
  const inRetreat = retreat != null;
  const tabs = inRetreat ? RETREAT_TABS : SEASON_TABS;
  const currentTab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0].id;

  const subtitle = inRetreat
    ? `${fmtRange(retreat.arrivalDate, retreat.departureDate)} · ${billableHeadcount(retreat)} guests · ${GROUP_TYPE_LABELS[retreat.groupType] ?? retreat.groupType}`
    : `${retreats.length} retreat${retreats.length === 1 ? '' : 's'} · ${byStatus.active.length} active · ${pending} pending request${pending === 1 ? '' : 's'}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title={inRetreat ? retreat.groupName : 'Retreat manager'}
        subtitle={subtitle}
        actions={
          <div className="flex gap-2">
            {inRetreat ? (
              <>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'editRetreat', retreatId: retreat.id })}>
                    Edit details
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={exitRetreat}>
                  <ArrowLeft className="w-3.5 h-3.5" /> All retreats
                </Button>
              </>
            ) : canManage ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'spaces' })}>Manage spaces</Button>
                <Button size="sm" onClick={() => openModal({ kind: 'newRetreat' })}>+ New retreat</Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="bg-paper-raised border-b border-border px-4 sm:px-7 flex-shrink-0 overflow-x-auto overflow-y-hidden no-scrollbar">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px whitespace-nowrap border-b-[3px] px-4 pb-2.5 pt-3 text-[13px] font-semibold transition-colors ${
                currentTab === tab.id
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
        {currentTab === 'overview' && <OverviewTab />}
        {currentTab === 'pipeline' && <PipelineTab />}
        {currentTab === 'rentalsReview' && <RentalsReview />}
        {currentTab === 'calendar' && <PropertyCalendar />}
        {currentTab === 'outbox' && <OutboxPanel />}
        {currentTab === 'addons' && <AddonsPanel />}
        {currentTab === 'costs' && <RetreatCostsTab />}
        {currentTab === 'retreatCosts' && <RetreatCostsDetailTab />}
        {currentTab === 'active' && <ActiveRetreatTab />}
        {currentTab === 'documents' && <DocumentsTab />}
        {currentTab === 'housing' && <HousingTab />}
        {currentTab === 'spaces' && retreat && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <SpacesTab retreatId={retreat.id} />
            <div className="px-4 pb-6 sm:px-7">
              <TurnoverCard retreatId={retreat.id} />
            </div>
          </div>
        )}
        {currentTab === 'relationship' && retreat && (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6 flex flex-col gap-6">
            <ProposalsPanel retreatId={retreat.id} />
            <ContactsPanel retreatId={retreat.id} />
            <TouchpointsPanel retreatId={retreat.id} />
          </div>
        )}
        {currentTab === 'menu' && <RetreatMenuTab />}
        {currentTab === 'requests' && <ChangeRequestsTab />}
        {currentTab === 'portal' && <PortalTab />}
        {currentTab === 'feedback' && <FeedbackTab />}
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
