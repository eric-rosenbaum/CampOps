import { format } from 'date-fns';
import { usePoolStore, getChemicalStatus, isWaterfrontType, POOL_TYPE_LABELS } from '@/store/poolStore';
import { useUIStore } from '@/store/uiStore';
import { Button } from '@/components/shared/Button';
import type { CampPool } from '@/lib/types';

function PoolStatusCard({ pool }: { pool: CampPool }) {
  const { chemicalReadings, equipment, setActivePool } = usePoolStore();
  const { openAddEditPoolModal } = useUIStore();

  const isWaterfront = isWaterfrontType(pool.type);

  // Latest reading for this pool
  const poolReadings = chemicalReadings
    .filter((r) => r.poolId === pool.id)
    .sort((a, b) => new Date(b.readingTime).getTime() - new Date(a.readingTime).getTime());
  const latest = poolReadings[0] ?? null;

  // Equipment issues for this pool
  const poolEquip = equipment.filter((e) => e.poolId === pool.id);
  const equipIssues = poolEquip.filter((e) => e.status !== 'ok').length;

  // Chemical status
  let chemStatus: 'ok' | 'warn' | 'alert' | 'none' = 'none';
  if (latest) {
    const statuses = [
      getChemicalStatus('freeChlorine', latest.freeChlorine),
      getChemicalStatus('ph', latest.ph),
      getChemicalStatus('alkalinity', latest.alkalinity),
    ];
    if (statuses.includes('alert')) chemStatus = 'alert';
    else if (statuses.includes('warn')) chemStatus = 'warn';
    else chemStatus = 'ok';
  }

  // Today's reading check
  const today = new Date().toDateString();
  const hasReadingToday = latest && new Date(latest.readingTime).toDateString() === today;

  const borderColor = () => {
    if (!isWaterfront) {
      if (chemStatus === 'alert') return 'border-l-red';
      if (chemStatus === 'warn') return 'border-l-amber';
      if (chemStatus === 'ok') return 'border-l-sage';
    }
    if (equipIssues > 0) return 'border-l-amber';
    return 'border-l-sage';
  };

  const statusBadge = () => {
    if (!isWaterfront) {
      if (chemStatus === 'none') return { label: 'No readings', cls: 'bg-cream-dark text-forest/40' };
      if (chemStatus === 'alert') return { label: 'Action needed', cls: 'bg-red-bg text-red' };
      if (chemStatus === 'warn') return { label: 'Monitor', cls: 'bg-amber-bg text-amber-text' };
      return { label: hasReadingToday ? 'Logged today' : 'OK', cls: 'bg-green-muted-bg text-green-muted-text' };
    }
    if (equipIssues > 0) return { label: `${equipIssues} issue${equipIssues > 1 ? 's' : ''}`, cls: 'bg-amber-bg text-amber-text' };
    return { label: 'All clear', cls: 'bg-green-muted-bg text-green-muted-text' };
  };

  const badge = statusBadge();

  return (
    <div
      className={`bg-white border border-border border-l-[3px] rounded-card px-5 py-4 cursor-pointer hover:shadow-sm transition-shadow ${borderColor()}`}
      onClick={() => setActivePool(pool.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-card-title font-semibold text-forest">{pool.name}</h3>
          <p className="text-meta text-forest/40 mt-0.5">{POOL_TYPE_LABELS[pool.type]}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide ${badge.cls}`}>
            {badge.label}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openAddEditPoolModal(pool.id); }}
            className="text-forest/30 hover:text-forest transition-colors text-[11px] font-medium px-2 py-1 rounded hover:bg-cream-dark"
          >
            Edit
          </button>
        </div>
      </div>

      {!isWaterfront && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          {latest ? (
            <>
              <div>
                <p className="text-meta text-forest/40 mb-0.5">Free Cl</p>
                <p className={`text-body font-mono font-semibold ${getChemicalStatus('freeChlorine', latest.freeChlorine) === 'ok' ? 'text-forest' : getChemicalStatus('freeChlorine', latest.freeChlorine) === 'warn' ? 'text-amber' : 'text-red'}`}>
                  {latest.freeChlorine.toFixed(1)} ppm
                </p>
              </div>
              <div>
                <p className="text-meta text-forest/40 mb-0.5">pH</p>
                <p className={`text-body font-mono font-semibold ${getChemicalStatus('ph', latest.ph) === 'ok' ? 'text-forest' : getChemicalStatus('ph', latest.ph) === 'warn' ? 'text-amber' : 'text-red'}`}>
                  {latest.ph}
                </p>
              </div>
              <div>
                <p className="text-meta text-forest/40 mb-0.5">Last reading</p>
                <p className="text-body font-mono font-semibold text-forest">
                  {format(new Date(latest.readingTime), 'MMM d, h:mm a')}
                </p>
              </div>
            </>
          ) : (
            <div className="col-span-3">
              <p className="text-meta text-forest/40">No chemical readings yet</p>
            </div>
          )}
        </div>
      )}

      {isWaterfront && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-meta text-forest/40 mb-0.5">Equipment</p>
            <p className="text-body font-mono font-semibold text-forest">
              {poolEquip.length} item{poolEquip.length !== 1 ? 's' : ''}
              {equipIssues > 0 && <span className="text-amber ml-1">· {equipIssues} issue{equipIssues > 1 ? 's' : ''}</span>}
            </p>
          </div>
          <div>
            <p className="text-meta text-forest/40 mb-0.5">Type</p>
            <p className="text-body font-semibold text-forest capitalize">{POOL_TYPE_LABELS[pool.type]}</p>
          </div>
        </div>
      )}

      {pool.notes && (
        <p className="text-meta text-forest/40 border-t border-cream-dark pt-2 mt-1">{pool.notes}</p>
      )}

      <p className="text-[11px] text-forest/30 mt-2">Click to view details →</p>
    </div>
  );
}

export function AllPoolsDashboard() {
  const { pools } = usePoolStore();
  const { openAddEditPoolModal } = useUIStore();

  const activePools = pools.filter((p) => p.isActive);

  // Overall stats
  const chemPools = activePools.filter((p) => !isWaterfrontType(p.type));
  const waterfrontPools = activePools.filter((p) => isWaterfrontType(p.type));

  return (
    <div>
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Total locations</p>
          <p className="font-mono text-stat font-semibold text-forest mt-1">{activePools.length}</p>
          <p className="text-meta text-forest/40 mt-0.5">Active this season</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Chemical pools</p>
          <p className="font-mono text-stat font-semibold text-forest mt-1">{chemPools.length}</p>
          <p className="text-meta text-forest/40 mt-0.5">Require daily readings</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Waterfront</p>
          <p className="font-mono text-stat font-semibold text-forest mt-1">{waterfrontPools.length}</p>
          <p className="text-meta text-forest/40 mt-0.5">Waterfront locations</p>
        </div>
      </div>

      {/* Pool cards */}
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-card-title font-semibold text-forest">All pools & waterfront locations</h3>
        <Button variant="ghost" size="sm" onClick={() => openAddEditPoolModal()}>+ Add pool</Button>
      </div>

      {activePools.length === 0 ? (
        <div className="bg-white border border-border rounded-card px-6 py-12 text-center">
          <p className="text-[32px] mb-3">🏊</p>
          <p className="text-[15px] font-semibold text-forest/60">No pools added yet</p>
          <p className="text-[13px] text-forest/40 mt-1 mb-4">Add your first pool or waterfront location to get started.</p>
          <Button size="sm" onClick={() => openAddEditPoolModal()}>Add pool</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {activePools.map((pool) => (
            <PoolStatusCard key={pool.id} pool={pool} />
          ))}
        </div>
      )}
    </div>
  );
}
