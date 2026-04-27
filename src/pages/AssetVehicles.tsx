import { Plus } from 'lucide-react';
import { useAssetStore, type AssetPageTab } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { FleetOverviewTab } from '@/components/assets/FleetOverviewTab';
import { CheckedOutTab } from '@/components/assets/CheckedOutTab';
import { MaintenanceDueTab } from '@/components/assets/MaintenanceDueTab';
import { ActivityLogTab } from '@/components/assets/ActivityLogTab';
import { AssetDetailPanel } from '@/components/assets/AssetDetailPanel';
import { AddEditAssetModal } from '@/components/assets/AddEditAssetModal';
import { CheckoutModal } from '@/components/assets/CheckoutModal';
import { ReturnModal } from '@/components/assets/ReturnModal';
import { LogAssetServiceModal } from '@/components/assets/LogAssetServiceModal';
import { AddMaintenanceTaskModal } from '@/components/assets/AddMaintenanceTaskModal';

const PAGE_TABS: { id: AssetPageTab; label: string }[] = [
  { id: 'fleet', label: 'Fleet' },
  { id: 'checked_out', label: 'Checked Out' },
  { id: 'maintenance_due', label: 'Maintenance Due' },
  { id: 'log', label: 'Activity Log' },
];

export default function AssetVehicles() {
  const { activePageTab, setPageTab, activeAssetId, currentlyCheckedOut, overdueCheckouts, maintenanceOverdue } = useAssetStore();
  const { openAddAssetModal } = useUIStore();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const checkedOutCount = currentlyCheckedOut().length;
  const overdueCount = overdueCheckouts().length;
  const maintOverdueCount = maintenanceOverdue().length;

  function tabBadge(tab: AssetPageTab): number | null {
    if (tab === 'checked_out') return checkedOutCount > 0 ? checkedOutCount : null;
    if (tab === 'maintenance_due') return maintOverdueCount > 0 ? maintOverdueCount : null;
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white">
        <div>
          <h1 className="text-page-title font-semibold text-forest">Assets & Vehicles</h1>
          <p className="text-meta text-forest/50 mt-0.5">Fleet management, checkout tracking, and service history</p>
        </div>
        {isAdmin && (
          <button
            onClick={openAddAssetModal}
            className="flex items-center gap-2 px-4 py-2 text-body font-medium bg-forest text-cream rounded-btn hover:bg-forest/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add asset
          </button>
        )}
      </div>

      {/* Tab strip */}
      <div className="flex gap-0 border-b border-border bg-white px-6">
        {PAGE_TABS.map((tab) => {
          const badge = tabBadge(tab.id);
          const isAlert = tab.id === 'checked_out' && overdueCount > 0;
          return (
            <button
              key={tab.id}
              onClick={() => setPageTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-1 mr-6 text-body font-medium border-b-2 transition-colors -mb-px ${activePageTab === tab.id ? 'border-forest text-forest' : 'border-transparent text-forest/50 hover:text-forest/70'}`}
            >
              {tab.label}
              {badge !== null && (
                <span className={`text-label font-semibold px-1.5 py-0.5 rounded-full ${isAlert ? 'bg-red/10 text-red' : 'bg-amber-bg text-amber-text'}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-cream">
        <div className={`mx-auto py-5 px-5 ${activeAssetId ? 'max-w-7xl grid grid-cols-[1fr_420px] gap-5 items-start' : 'max-w-4xl'}`}>
          {/* Left / full column — page tab content */}
          <div>
            {activePageTab === 'fleet' && <FleetOverviewTab />}
            {activePageTab === 'checked_out' && <CheckedOutTab />}
            {activePageTab === 'maintenance_due' && <MaintenanceDueTab />}
            {activePageTab === 'log' && <ActivityLogTab />}
          </div>

          {/* Right column — asset detail panel (only when an asset is selected) */}
          {activeAssetId && (
            <div className="sticky top-5">
              <AssetDetailPanel />
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AddEditAssetModal />
      <CheckoutModal />
      <ReturnModal />
      <LogAssetServiceModal />
      <AddMaintenanceTaskModal />
    </div>
  );
}
