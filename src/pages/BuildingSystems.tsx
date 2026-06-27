import { Building2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { useBuildingStore, type BuildingTab } from '@/store/buildingStore';
import { useAuth } from '@/lib/auth';
import { BuildingsOverview } from '@/components/building/BuildingsOverview';
import { BuildingDetail } from '@/components/building/BuildingDetail';
import { ElectricalTab } from '@/components/building/ElectricalTab';
import { PlumbingTab } from '@/components/building/PlumbingTab';
import { BuildingSeasonalTab } from '@/components/building/BuildingSeasonalTab';
import { AddEditBuildingModal } from '@/components/building/AddEditBuildingModal';
import { AddEditRoomModal } from '@/components/building/AddEditRoomModal';
import { AddEditComponentModal } from '@/components/building/AddEditComponentModal';
import { AddEditCircuitModal } from '@/components/building/AddEditCircuitModal';
import { BuildingSeasonalTaskModal } from '@/components/building/BuildingSeasonalTaskModal';
import { FlagComponentIssueModal } from '@/components/building/FlagComponentIssueModal';

const TABS: { id: BuildingTab; label: string }[] = [
  { id: 'buildings', label: 'Buildings' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'seasonal', label: 'Seasonal' },
];

export function BuildingSystems() {
  const {
    buildings, activeTab, activeBuildingId,
    setActiveTab, setActiveBuilding, openModal, modal,
  } = useBuildingStore();
  const { can } = useAuth();
  const canManage = can('manageBuildingSystems');

  const subtitle = `${buildings.length} building${buildings.length !== 1 ? 's' : ''} · electrical & plumbing infrastructure`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title="Building Systems"
        subtitle={subtitle}
        actions={
          canManage && activeTab === 'buildings' && !activeBuildingId ? (
            <Button size="sm" onClick={() => openModal({ kind: 'building' })}>+ Add building</Button>
          ) : undefined
        }
      />

      {/* Tab strip */}
      <div className="bg-white border-b border-border px-7 flex-shrink-0">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (tab.id !== 'buildings') setActiveBuilding(null); }}
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

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {buildings.length === 0 && activeTab === 'buildings' && !activeBuildingId ? (
          <div className="flex-1 overflow-y-auto px-7 py-6">
            <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
              <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
                <Building2 className="w-7 h-7 text-stone-400" />
              </div>
              <h3 className="text-[15px] font-semibold text-forest mb-1.5">No buildings yet</h3>
              <p className="text-[13px] text-forest/50 leading-relaxed mb-4">
                Add your cabins, bathhouses, dining hall and utility buildings, then map their
                electrical and plumbing — outlets, panels, shutoffs and more — room by room.
              </p>
              {canManage && (
                <Button size="sm" onClick={() => openModal({ kind: 'building' })}>+ Add your first building</Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'buildings' && !activeBuildingId && <BuildingsOverview />}
            {activeTab === 'buildings' && activeBuildingId && <BuildingDetail />}
            {activeTab === 'electrical' && <ElectricalTab />}
            {activeTab === 'plumbing' && <PlumbingTab />}
            {activeTab === 'seasonal' && <BuildingSeasonalTab />}
          </>
        )}
      </div>

      {/* Modals */}
      {modal?.kind === 'building' && <AddEditBuildingModal editId={modal.editId} />}
      {modal?.kind === 'room' && <AddEditRoomModal buildingId={modal.buildingId} editId={modal.editId} />}
      {modal?.kind === 'component' && (
        <AddEditComponentModal
          buildingId={modal.buildingId}
          editId={modal.editId}
          defaultRoomId={modal.defaultRoomId}
          defaultSystem={modal.defaultSystem}
        />
      )}
      {modal?.kind === 'circuit' && <AddEditCircuitModal panelId={modal.panelId} editId={modal.editId} />}
      {modal?.kind === 'seasonal' && <BuildingSeasonalTaskModal editId={modal.editId} defaultPhase={modal.defaultPhase} />}
      {modal?.kind === 'flag' && <FlagComponentIssueModal componentId={modal.componentId} />}
    </div>
  );
}
