import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { ChemicalLogTab } from '@/components/pool/ChemicalLogTab';
import { EquipmentTab } from '@/components/pool/EquipmentTab';
import { InspectionsTab } from '@/components/pool/InspectionsTab';
import { SeasonalChecklistTab } from '@/components/pool/SeasonalChecklistTab';
import { LogReadingModal } from '@/components/pool/LogReadingModal';
import { LogServiceModal } from '@/components/pool/LogServiceModal';
import { LogInspectionModal } from '@/components/pool/LogInspectionModal';
import { AddEquipmentModal } from '@/components/pool/AddEquipmentModal';
import { usePoolStore, type PoolTab } from '@/store/poolStore';
import { useUIStore } from '@/store/uiStore';

const TABS: { id: PoolTab; label: string }[] = [
  { id: 'chemical', label: 'Chemical log' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'inspections', label: 'Inspections' },
  { id: 'seasonal', label: 'Seasonal checklist' },
];

export function PoolManagement() {
  const { activeTab, setActiveTab, latestReading } = usePoolStore();
  const {
    isLogReadingModalOpen, isLogServiceModalOpen,
    isLogInspectionModalOpen, isAddEquipmentModalOpen,
    openLogReadingModal,
  } = useUIStore();

  const latest = latestReading();
  const lastReadingText = latest
    ? `Last reading today ${latest.timeOfDay}`
    : 'No readings yet';

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title="Pool management"
        subtitle={`Main pool · Session 2 · Jun 23 – Jul 18 · ${lastReadingText}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm">Export log</Button>
            <Button size="sm" onClick={openLogReadingModal}>+ Log reading</Button>
          </div>
        }
      />

      {/* Sub-tab bar */}
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
        {activeTab === 'chemical' && <ChemicalLogTab />}
        {activeTab === 'equipment' && <EquipmentTab />}
        {activeTab === 'inspections' && <InspectionsTab />}
        {activeTab === 'seasonal' && <SeasonalChecklistTab />}
      </div>

      {isLogReadingModalOpen && <LogReadingModal />}
      {isLogServiceModalOpen && <LogServiceModal />}
      {isLogInspectionModalOpen && <LogInspectionModal />}
      {isAddEquipmentModalOpen && <AddEquipmentModal />}
    </div>
  );
}
