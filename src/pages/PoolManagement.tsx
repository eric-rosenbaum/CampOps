import { format } from 'date-fns';
import { ChevronLeft, Waves } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { ChemicalLogTab } from '@/components/pool/ChemicalLogTab';
import { EquipmentTab } from '@/components/pool/EquipmentTab';
import { InspectionsTab } from '@/components/pool/InspectionsTab';
import { SeasonalChecklistTab } from '@/components/pool/SeasonalChecklistTab';
import { AllPoolsDashboard } from '@/components/pool/AllPoolsDashboard';
import { LogReadingModal } from '@/components/pool/LogReadingModal';
import { LogServiceModal } from '@/components/pool/LogServiceModal';
import { LogInspectionModal } from '@/components/pool/LogInspectionModal';
import { AddEquipmentModal } from '@/components/pool/AddEquipmentModal';
import { AddEditPoolModal } from '@/components/pool/AddEditPoolModal';
import { usePoolStore, type PoolTab, isWaterfrontType, POOL_TYPE_LABELS } from '@/store/poolStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';

const CHEM_TABS: { id: PoolTab; label: string }[] = [
  { id: 'chemical', label: 'Chemical log' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'inspections', label: 'Inspections' },
  { id: 'seasonal', label: 'Seasonal checklist' },
];

const WATERFRONT_TABS: { id: PoolTab; label: string }[] = [
  { id: 'equipment', label: 'Equipment & safety' },
  { id: 'inspections', label: 'Inspections' },
  { id: 'seasonal', label: 'Seasonal checklist' },
];

export function PoolManagement() {
  const {
    pools, activePoolId, activeTab,
    setActivePool, setActiveTab,
    latestReading, activePool,
  } = usePoolStore();
  const {
    isLogReadingModalOpen, isLogServiceModalOpen,
    isLogInspectionModalOpen, isAddEquipmentModalOpen,
    isAddEditPoolModalOpen,
    openLogReadingModal, openAddEditPoolModal,
  } = useUIStore();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const pool = activePool();
  const isWaterfront = pool ? isWaterfrontType(pool.type) : false;
  const tabs = isWaterfront ? WATERFRONT_TABS : CHEM_TABS;

  // If activeTab is 'chemical' but we switched to a waterfront pool, reset to equipment
  const effectiveTab = isWaterfront && activeTab === 'chemical' ? 'equipment' : activeTab;

  const latest = latestReading();
  const lastReadingText = latest
    ? `Last reading ${format(new Date(latest.readingTime), 'MMM d · h:mm a')}`
    : 'No readings yet';

  const subtitle = pool
    ? `${POOL_TYPE_LABELS[pool.type]}${!isWaterfront ? ` · ${lastReadingText}` : ''}`
    : `${pools.length} location${pools.length !== 1 ? 's' : ''} · Select a pool to log data`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title={pool ? pool.name : 'Pool & waterfront'}
        subtitle={subtitle}
        actions={
          <div className="flex gap-2">
            {isAdmin && pool && (
              <Button variant="ghost" size="sm" onClick={() => openAddEditPoolModal(pool.id)}>
                Edit pool
              </Button>
            )}
            {pool && !isWaterfront && (
              <Button size="sm" onClick={() => openLogReadingModal()}>+ Log reading</Button>
            )}
          </div>
        }
      />

      {/* Pool selector tab strip */}
      <div className="bg-white border-b border-border px-7 flex-shrink-0 overflow-x-auto">
        <div className="flex min-w-max">
          {/* All pools tab */}
          <button
            onClick={() => setActivePool(null)}
            className={`px-4 py-3 text-body border-b-2 transition-colors flex-shrink-0 ${
              !activePoolId
                ? 'text-forest font-semibold border-sage'
                : 'text-forest/40 font-medium border-transparent hover:text-forest/70'
            }`}
          >
            All pools
          </button>

          {/* Separator */}
          {pools.length > 0 && (
            <div className="w-px bg-border my-2 mx-1 flex-shrink-0" />
          )}

          {/* Per-pool tabs */}
          {pools.filter((p) => p.isActive).map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePool(p.id)}
              className={`px-4 py-3 text-body border-b-2 transition-colors flex-shrink-0 ${
                activePoolId === p.id
                  ? 'text-forest font-semibold border-sage'
                  : 'text-forest/40 font-medium border-transparent hover:text-forest/70'
              }`}
            >
              {p.name}
            </button>
          ))}

        </div>
      </div>

      {/* Sub-tab bar — only visible when a pool is selected */}
      {activePoolId && (
        <div className="bg-white border-b border-border px-7 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActivePool(null)}
              className="flex items-center gap-1 text-meta text-forest/40 hover:text-forest mr-3 transition-colors py-3"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              All pools
            </button>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-body border-b-2 transition-colors ${
                  effectiveTab === tab.id
                    ? 'text-forest font-semibold border-sage'
                    : 'text-forest/40 font-medium border-transparent hover:text-forest/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-7 py-6">
        {pools.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
            <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
              <Waves className="w-7 h-7 text-stone-400" />
            </div>
            <h3 className="text-[15px] font-semibold text-forest mb-1.5">No pools set up yet</h3>
            <p className="text-[13px] text-forest/50 leading-relaxed">
              Add pools and waterfront locations from <strong>Camp Info → Pools & Waterfront</strong>.
            </p>
          </div>
        )}
        {pools.length > 0 && !activePoolId && <AllPoolsDashboard />}

        {activePoolId && effectiveTab === 'chemical' && <ChemicalLogTab />}
        {activePoolId && effectiveTab === 'equipment' && <EquipmentTab />}
        {activePoolId && effectiveTab === 'inspections' && <InspectionsTab />}
        {activePoolId && effectiveTab === 'seasonal' && <SeasonalChecklistTab />}
      </div>

      {isLogReadingModalOpen && <LogReadingModal />}
      {isLogServiceModalOpen && <LogServiceModal />}
      {isLogInspectionModalOpen && <LogInspectionModal />}
      {isAddEquipmentModalOpen && <AddEquipmentModal />}
      {isAddEditPoolModalOpen && <AddEditPoolModal />}
    </div>
  );
}
