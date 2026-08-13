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
import { WasteTab } from '@/components/commissary/WasteTab';
import { SettingsTab } from '@/components/commissary/SettingsTab';

// Production guide and Cost tabs are archived (out of scope for v1). Their components,
// store selectors, and DB loaders remain in place and unreachable — re-add the entries
// here (and the renders below) to restore them.
const TABS: { id: CommissaryTab; label: string }[] = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'recipes', label: 'Recipe guide' },
  { id: 'menu', label: 'Menu builder' },
  { id: 'allergy', label: 'Allergy program' },
  { id: 'ordering', label: 'Ordering' },
  { id: 'waste', label: 'Waste' },
  { id: 'settings', label: 'Settings' },
];

export function Commissary() {
  const {
    activeTab, setActiveTab, modal, openModal,
    items, recipes, activeSession, portions, mode, setMode,
  } = useCommissaryStore();
  const { can, canViewCamperHealth } = useAuth();
  const canManage = can('manageCommissary');

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
    ? 'Retreats — all groups planned as one combined kitchen'
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
      // Adding campers requires health access, not just manageCommissary — the DB
      // would reject the write anyway, so don't offer a button that cannot work.
      if (!canViewCamperHealth) return undefined;
      return <Button size="sm" onClick={() => openModal({ kind: 'camper' })}>+ Add camper</Button>;
    }
    if (activeTab === 'ordering' || activeTab === 'settings' || activeTab === 'waste') return undefined;
    // Menu tab: session mode offers "+ New session"; retreats mode manages menus per retreat inside the builder.
    if (retreatsMode) return undefined;
    return <Button size="sm" onClick={() => openModal({ kind: 'session' })}>+ New session</Button>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar title="Commissary" subtitle={subtitle} actions={topAction()} />

      <div className="bg-white border-b border-border px-4 sm:px-7 flex-shrink-0 flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-body border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-forest font-semibold border-sage'
                  : 'text-forest/40 font-medium border-transparent hover:text-forest/70'
              }`}
            >
              {tab.label}
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
                mode === m ? 'bg-white text-forest shadow-sm' : 'text-forest/50 hover:text-forest'
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
        {activeTab === 'waste' && <WasteTab />}
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
