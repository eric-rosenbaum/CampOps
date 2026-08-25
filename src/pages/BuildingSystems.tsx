import { Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { useBuildingStore, type BuildingTab } from '@/store/buildingStore';
import { useAuth } from '@/lib/auth';
import { BuildingsOverview } from '@/components/building/BuildingsOverview';
import { BuildingDetail } from '@/components/building/BuildingDetail';
import { ElectricalTab } from '@/components/building/ElectricalTab';
import { PlumbingTab } from '@/components/building/PlumbingTab';
import { AddEditRoomModal } from '@/components/building/AddEditRoomModal';
import { AddEditComponentModal } from '@/components/building/AddEditComponentModal';
import { AddEditCircuitModal } from '@/components/building/AddEditCircuitModal';
import { FlagComponentIssueModal } from '@/components/building/FlagComponentIssueModal';
import { useBuildings } from '@/components/building/useBuildings';

const TABS: { id: BuildingTab; label: string }[] = [
  { id: 'buildings', label: 'Buildings' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'plumbing', label: 'Plumbing' },
];

export function BuildingSystems() {
  const {
    activeTab, activeBuildingId,
    setActiveTab, setActiveBuilding, modal,
  } = useBuildingStore();
  const buildings = useBuildings();
  const { can } = useAuth();
  const canManage = can('manageBuildingSystems');

  const subtitle = `${buildings.length} building${buildings.length !== 1 ? 's' : ''} · electrical & plumbing infrastructure`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* No "add building" here on purpose: Camp Info owns the location tree, and a second
          place to create one produced buildings that only half the app agreed existed. */}
      <Topbar title="Building Systems" subtitle={subtitle} />

      {/* Tab strip */}
      <div className="bg-paper-raised border-b border-border px-4 sm:px-7 flex-shrink-0 overflow-x-auto overflow-y-hidden no-scrollbar">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (tab.id !== 'buildings') setActiveBuilding(null); }}
              className={`-mb-px whitespace-nowrap border-b-[3px] px-4 pb-2.5 pt-3 text-[13px] font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-red text-forest'
                  : 'border-transparent text-ink-soft hover:text-forest'
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
          <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
            <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
              <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
                <Building2 className="w-7 h-7 text-ink-faint" />
              </div>
              <h3 className="text-[15px] font-semibold text-forest mb-1.5">No buildings yet</h3>
              <p className="text-[13px] text-ink-soft leading-relaxed mb-4">
                Buildings come from your camp's locations. Add your cabins, bathhouses, dining
                hall and utility buildings under Camp Info, then map their electrical and
                plumbing room by room here.
              </p>
              {canManage && (
                <Link to="/settings">
                  <Button size="sm">Go to Camp Info</Button>
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'buildings' && !activeBuildingId && <BuildingsOverview />}
            {activeTab === 'buildings' && activeBuildingId && <BuildingDetail />}
            {activeTab === 'electrical' && <ElectricalTab />}
            {activeTab === 'plumbing' && <PlumbingTab />}
          </>
        )}
      </div>

      {/* Modals */}
      {modal?.kind === 'room' && <AddEditRoomModal buildingId={modal.buildingId} editId={modal.editId} />}
      {modal?.kind === 'component' && (
        <AddEditComponentModal
          buildingId={modal.buildingId}
          editId={modal.editId}
          defaultLocationId={modal.defaultLocationId}
          defaultSystem={modal.defaultSystem}
        />
      )}
      {modal?.kind === 'circuit' && <AddEditCircuitModal panelId={modal.panelId} editId={modal.editId} />}
      {modal?.kind === 'flag' && <FlagComponentIssueModal componentId={modal.componentId} />}
    </div>
  );
}
