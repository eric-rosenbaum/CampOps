import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore, type CommissaryTab } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import { InventoryTab } from '@/components/commissary/InventoryTab';
import { MenuTab } from '@/components/commissary/MenuTab';
import { RetreatMenuBuilder } from '@/components/commissary/RetreatMenuBuilder';
import { RetreatMenuEntryModal } from '@/components/commissary/RetreatMenuEntryModal';
import { RecipesTab } from '@/components/commissary/RecipesTab';
import { AddEditItemModal } from '@/components/commissary/AddEditItemModal';
import { CSVImportModal } from '@/components/commissary/CSVImportModal';
import { AdjustStockModal } from '@/components/commissary/AdjustStockModal';
import { AddEditRecipeModal } from '@/components/commissary/AddEditRecipeModal';
import { MenuEntryModal } from '@/components/commissary/MenuEntryModal';
import { SessionModal } from '@/components/commissary/SessionModal';
import { VendorsModal } from '@/components/commissary/VendorsModal';
import { AllergyTab } from '@/components/commissary/AllergyTab';
import { OrderingTab } from '@/components/commissary/OrderingTab';
import { AddCamperModal } from '@/components/commissary/AddCamperModal';
import { ImportCampersModal } from '@/components/commissary/ImportCampersModal';
import { SendOrderModal } from '@/components/commissary/SendOrderModal';
import { SendLiveOrderModal } from '@/components/commissary/SendLiveOrderModal';
import { ReceiveOrderModal } from '@/components/commissary/ReceiveOrderModal';
import { AddExpenseModal } from '@/components/commissary/AddExpenseModal';
import { MealEventModal } from '@/components/commissary/MealEventModal';
import { TemplateModal } from '@/components/commissary/TemplateModal';
import { ApplyTemplateModal } from '@/components/commissary/ApplyTemplateModal';
import { TemplateEntryModal } from '@/components/commissary/TemplateEntryModal';
import { DietCountsModal } from '@/components/commissary/DietCountsModal';
import { CountModal } from '@/components/commissary/CountModal';
import { CoursesModal } from '@/components/commissary/CoursesModal';
import { SubstitutionModal } from '@/components/commissary/SubstitutionModal';
import { SettingsTab } from '@/components/commissary/SettingsTab';
import { RequestsTab } from '@/components/foodRequests/RequestsTab';
import { useCampClock } from '@/components/foodRequests/useCampClock';
import { isPastDue, REQUESTS_VIEWS, type RequestsView } from '@/lib/foodRequests';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

// Production guide, Cost and Waste tabs are archived. Their components, store selectors,
// and DB loaders remain in place and unreachable, re-add the entries here (and the renders
// below) to restore them. Waste adjustments are still captured in Inventory, so the report
// keeps accruing data and comes back populated whenever it is switched on again.
const TABS: { id: CommissaryTab; label: string }[] = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'recipes', label: 'Recipe guide' },
  { id: 'menu', label: 'Menu builder' },
  { id: 'allergy', label: 'Allergy program' },
  { id: 'ordering', label: 'Ordering' },
  // Program food requests. Visible in both modes: a cooking club needs flour whether the kitchen
  // is planning sessions or retreats.
  { id: 'requests', label: 'Requests' },
  { id: 'settings', label: 'Settings' },
];

export function Commissary() {
  const {
    activeTab, setActiveTab, modal, openModal,
    items, recipes, activeSession, portions, mode, setMode,
  } = useCommissaryStore();
  const { can, canViewCamperHealth } = useAuth();
  const canManage = can('manageCommissary');
  const foodRequests = useCommissaryStore((s) => s.foodRequests);
  const waitingRequests = foodRequests.filter((r) => r.status === 'submitted').length;
  // Pickups nobody came for count too: they need a Missed tap as much as a new request needs a decision.
  const { timeZone, now } = useCampClock();
  const overdueRequests = foodRequests.filter((r) => isPastDue(r, now, timeZone)).length;
  const requestsBadge = waitingRequests + overdueRequests;

  // Deep links: /commissary?tab=requests&request=<id>. The emails to the kitchen and the demo
  // guide both land here, so the URL has to choose the tab rather than whatever was open last.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const openRequestId = searchParams.get('request');
  // ?view=pickups|inbox|history picks the Requests view (the demo guide's hand-over step uses it).
  const viewParam = searchParams.get('view');
  const requestsView = REQUESTS_VIEWS.includes(viewParam as RequestsView) ? (viewParam as RequestsView) : null;
  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) setActiveTab(tabParam as CommissaryTab);
  }, [tabParam, setActiveTab]);
  // A deep link to a tab past a phone's width must not open on a tab you cannot see. Keyed on the
  // tab, not every render, so a realtime reload never yanks a bar someone is scrolling.
  const tabBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabBarRef.current?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    const bar = tabBarRef.current;
    if (el && bar && (el.offsetLeft + el.offsetWidth > bar.scrollLeft + bar.clientWidth || el.offsetLeft < bar.scrollLeft)) {
      bar.scrollLeft = el.offsetLeft - 16;
    }
  }, [activeTab]);
  function openRequest(id: string | null) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'requests');
    if (id) next.set('request', id); else next.delete('request');
    setSearchParams(next, { replace: true });
  }
  function chooseRequestsView(v: RequestsView) {
    // Keeps a shared link honest, without adding history entries for each view.
    if (!searchParams.has('view')) return;
    const next = new URLSearchParams(searchParams);
    next.set('view', v);
    setSearchParams(next, { replace: true });
  }
  function openPrograms() {
    // Straight to the Programs section, not the top of a long Settings page.
    setActiveTab('settings');
    setSearchParams({ tab: 'settings', section: 'programs' }, { replace: true });
  }
  function chooseTab(id: CommissaryTab) {
    setActiveTab(id);
    // A tab picked by hand wins over the link that opened the page, including on refresh.
    if (searchParams.has('tab') || searchParams.has('request')) setSearchParams({}, { replace: true });
  }

  const session = activeSession();
  const total = portions();
  const retreatsMode = mode === 'retreats';

  // Allergy is session-camper-based; hide it in retreats mode.
  const visibleTabs = retreatsMode ? TABS.filter((t) => t.id !== 'allergy') : TABS;

  function switchMode(m: 'session' | 'retreats') {
    if (m === mode) return;
    setMode(m);
    if (m === 'retreats' && activeTab === 'allergy') setActiveTab('menu');
  }

  const subtitle = retreatsMode
    ? 'Retreats, all groups planned as one combined kitchen'
    : session
      ? `${session.name} · ${session.camperCount} campers + ${session.staffCount} staff = ${total} total`
      : `${items.length} item${items.length === 1 ? '' : 's'} · ${recipes.length} recipe${recipes.length === 1 ? '' : 's'}`;

  function topAction() {
    if (!canManage) return undefined;
    if (activeTab === 'inventory') {
      return (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'vendor' })}>Vendors</Button>
          <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'csvImport' })}>Import CSV</Button>
          <Button size="sm" onClick={() => openModal({ kind: 'item' })}>+ Add item</Button>
        </div>
      );
    }
    if (activeTab === 'recipes') {
      return <Button size="sm" onClick={() => openModal({ kind: 'recipe' })}>+ Add recipe</Button>;
    }
    if (activeTab === 'allergy') {
      // Adding campers requires health access, not just manageCommissary. The DB
      // would reject the write anyway, so don't offer a button that cannot work.
      if (!canViewCamperHealth) return undefined;
      return <Button size="sm" onClick={() => openModal({ kind: 'camper' })}>+ Add camper</Button>;
    }
    if (activeTab === 'ordering' || activeTab === 'settings' || activeTab === 'requests') return undefined;
    // Menu tab: session mode offers "+ New session"; retreats mode manages menus per retreat inside the builder.
    if (retreatsMode) return undefined;
    return <Button size="sm" onClick={() => openModal({ kind: 'session' })}>+ New session</Button>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar title="Commissary" subtitle={subtitle} actions={topAction()} />

      <div ref={tabBarRef} className="relative bg-paper-raised border-b border-border px-4 sm:px-7 flex-shrink-0 flex items-center justify-between gap-3 overflow-x-auto overflow-y-hidden no-scrollbar">
        <div className="flex">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              data-tab={tab.id}
              onClick={() => chooseTab(tab.id)}
              className={`-mb-px whitespace-nowrap border-b-[3px] px-4 pb-2.5 pt-3 text-[13px] font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-red text-forest'
                  : 'border-transparent text-ink-soft hover:text-forest'
              }`}
            >
              {tab.label}
              {tab.id === 'requests' && requestsBadge > 0 && (
                <span data-testid="requests-badge"
                  title={[waitingRequests ? `${waitingRequests} waiting for a decision` : '', overdueRequests ? `${overdueRequests} not picked up on time` : ''].filter(Boolean).join(' · ')}
                  className="ml-1.5 inline-grid min-w-[18px] place-items-center rounded-pill bg-red px-1 text-[10.5px] font-bold leading-[18px] text-paper">
                  {requestsBadge}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* Session ⇄ Retreats scope toggle */}
        <div className="flex gap-1 bg-cream-dark rounded-btn p-0.5">
          {(['session', 'retreats'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`text-[12px] font-semibold px-3 py-1 rounded-[6px] transition-colors capitalize ${
                mode === m ? 'bg-white text-forest shadow-sm' : 'text-ink-soft hover:text-forest'
              }`}
            >
              {m === 'session' ? 'Sessions' : 'Retreats'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'menu' && (retreatsMode ? <RetreatMenuBuilder /> : <MenuTab />)}
        {activeTab === 'recipes' && <RecipesTab />}
        {activeTab === 'allergy' && !retreatsMode && <AllergyTab />}
        {activeTab === 'ordering' && <OrderingTab />}
        {activeTab === 'requests' && <RequestsTab openRequestId={openRequestId} onOpenRequest={openRequest} view={requestsView} onViewChange={chooseRequestsView} onOpenPrograms={openPrograms} />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>

      {modal?.kind === 'item' && <AddEditItemModal editId={modal.editId} />}
      {modal?.kind === 'csvImport' && <CSVImportModal />}
      {modal?.kind === 'adjust' && <AdjustStockModal itemId={modal.itemId} />}
      {modal?.kind === 'recipe' && <AddEditRecipeModal editId={modal.editId} />}
      {modal?.kind === 'menuEntry' && (
        <MenuEntryModal weekNumber={modal.weekNumber} dayIndex={modal.dayIndex} mealPeriod={modal.mealPeriod} />
      )}
      {modal?.kind === 'retreatMenuEntry' && (
        <RetreatMenuEntryModal retreatId={modal.retreatId} dayDate={modal.dayDate} mealPeriod={modal.mealPeriod} editId={modal.editId} />
      )}
      {modal?.kind === 'session' && <SessionModal editId={modal.editId} />}
      {modal?.kind === 'vendor' && <VendorsModal editId={modal.editId} />}
      {modal?.kind === 'camper' && <AddCamperModal editId={modal.editId} />}
      {modal?.kind === 'importCampers' && <ImportCampersModal />}
      {modal?.kind === 'sendOrder' && <SendOrderModal orderId={modal.orderId} />}
      {modal?.kind === 'sendLive' && <SendLiveOrderModal />}
      {modal?.kind === 'receiveOrder' && <ReceiveOrderModal orderId={modal.orderId} />}
      {modal?.kind === 'expense' && <AddExpenseModal />}
      {modal?.kind === 'mealEvent' && <MealEventModal editId={modal.editId} date={modal.date} />}
      {modal?.kind === 'template' && <TemplateModal editId={modal.editId} />}
      {modal?.kind === 'applyTemplate' && <ApplyTemplateModal />}
      {modal?.kind === 'templateEntry' && (
        <TemplateEntryModal templateId={modal.templateId} weekNumber={modal.weekNumber} dayIndex={modal.dayIndex} mealPeriod={modal.mealPeriod} />
      )}
      {modal?.kind === 'dietCounts' && <DietCountsModal />}
      {modal?.kind === 'count' && <CountModal />}
      {modal?.kind === 'courses' && <CoursesModal />}
      {modal?.kind === 'substitution' && (
        <SubstitutionModal weekNumber={modal.weekNumber} dayIndex={modal.dayIndex} mealPeriod={modal.mealPeriod} editId={modal.editId} />
      )}
    </div>
  );
}
