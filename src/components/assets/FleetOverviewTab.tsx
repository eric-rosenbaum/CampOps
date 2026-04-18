import { AlertTriangle, Truck } from 'lucide-react';
import { useAssetStore, ASSET_CATEGORY_LABELS } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';
import { AssetCard } from './AssetCard';
import type { AssetCategory } from '@/lib/types';

const CATEGORIES: AssetCategory[] = ['vehicle', 'golf_cart', 'watercraft', 'large_equipment', 'trailer', 'other'];

export function FleetOverviewTab() {
  const {
    filteredAssets, activeCategoryFilter, setCategoryFilter,
    fleetStats, overdueCheckouts, maintenanceOverdue,
    setActiveAsset, setPageTab,
  } = useAssetStore();
  const { openAddAssetModal } = useUIStore();

  const stats = fleetStats();
  const overdue = overdueCheckouts();
  const maintOverdue = maintenanceOverdue();
  const assets = filteredAssets();

  return (
    <div className="space-y-4">
      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total assets" value={stats.total} />
        <StatCard label="Available" value={stats.available} color="text-sage" />
        <StatCard label="Checked out" value={stats.checkedOut} color="text-blue-600" />
        <StatCard label="In service" value={stats.inService} color="text-amber-text" />
      </div>

      {/* Alert banners */}
      {overdue.length > 0 && (
        <div className="bg-red/5 border border-red/20 rounded-card px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-body font-semibold text-red">{overdue.length} overdue checkout{overdue.length > 1 ? 's' : ''}</p>
            <p className="text-meta text-red/70 mt-0.5">
              {overdue.map((o) => o.asset.name).join(', ')}
              {' — '}
              <button className="underline" onClick={() => setPageTab('checked_out')}>View checked-out tab</button>
            </p>
          </div>
        </div>
      )}

      {maintOverdue.length > 0 && (
        <div className="bg-amber-bg border border-amber/20 rounded-card px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-text mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-body font-semibold text-amber-text">{maintOverdue.length} asset{maintOverdue.length > 1 ? 's' : ''} with overdue service</p>
            <p className="text-meta text-amber-text/70 mt-0.5">
              {maintOverdue.map((m) => m.asset.name).join(', ')}
              {' — '}
              <button className="underline" onClick={() => setPageTab('maintenance_due')}>View maintenance tab</button>
            </p>
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <FilterChip label="All" active={activeCategoryFilter === 'all'} onClick={() => setCategoryFilter('all')} />
        {CATEGORIES.map((cat) => (
          <FilterChip key={cat} label={ASSET_CATEGORY_LABELS[cat]} active={activeCategoryFilter === cat} onClick={() => setCategoryFilter(cat)} />
        ))}
      </div>

      {/* Asset list */}
      {assets.length === 0 ? (
        <div className="text-center py-16">
          <Truck className="w-10 h-10 text-forest/20 mx-auto mb-3" />
          <p className="text-body text-forest/40">No assets found</p>
          <button onClick={openAddAssetModal} className="mt-3 text-body text-sage hover:text-forest transition-colors underline">Add your first asset</button>
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onClick={() => setActiveAsset(asset.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = 'text-forest' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white border border-border rounded-card px-4 py-3">
      <p className="text-meta text-forest/50 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-label font-medium rounded-btn border transition-colors ${active ? 'bg-forest border-forest text-cream' : 'border-border text-forest/60 hover:border-forest/40 bg-white'}`}
    >
      {label}
    </button>
  );
}
