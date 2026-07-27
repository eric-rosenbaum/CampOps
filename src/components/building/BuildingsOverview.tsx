import { Building2, Droplet, Power, Flame, Zap } from 'lucide-react';
import { useBuildingStore, BUILDING_TYPE_LABELS } from '@/store/buildingStore';
import { ComponentStatusBadge } from './buildingUi';
import { useBuildings, useRooms, useBuildingDetail } from './useBuildings';
import type { BuildingType, CampLocation } from '@/lib/types';

function BuildingCard({ building }: { building: CampLocation }) {
  const { setActiveBuilding, componentsForBuilding, buildingStatus } = useBuildingStore();
  const detail = useBuildingDetail(building.id);
  const rooms = useRooms(building.id);
  const components = componentsForBuilding(building.id);
  const status = buildingStatus(building.id);
  const electrical = components.filter((c) => c.system === 'electrical').length;
  const plumbing = components.filter((c) => c.system === 'plumbing').length;
  const flagged = components.filter((c) => c.status !== 'operational').length;
  const typeLabel = detail?.buildingType
    ? (BUILDING_TYPE_LABELS[detail.buildingType as BuildingType] ?? detail.buildingType)
    : 'Building';

  const refs = [
    { icon: Droplet, label: 'Water shutoff', value: detail?.mainWaterShutoff },
    { icon: Power, label: 'Main panel', value: detail?.mainElectricalPanel },
    { icon: Flame, label: 'Gas shutoff', value: detail?.mainGasShutoff },
  ].filter((r) => r.value);

  return (
    <button
      onClick={() => setActiveBuilding(building.id)}
      className="text-left bg-white border border-border rounded-card p-4 hover:border-sage transition-colors flex flex-col"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-btn bg-cream-dark flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-forest/60" />
          </div>
          <div className="min-w-0">
            <p className="text-card-title font-semibold text-forest truncate">{building.name}</p>
            <p className="text-meta text-forest/40">{typeLabel}</p>
          </div>
        </div>
        {components.length > 0 && <ComponentStatusBadge status={status} />}
      </div>

      <div className="flex items-center gap-3 text-meta text-forest/50 mb-3">
        <span className="inline-flex items-center gap-1"><Zap className="w-3 h-3" /> {electrical}</span>
        <span className="inline-flex items-center gap-1"><Droplet className="w-3 h-3" /> {plumbing}</span>
        <span className="text-forest/30">·</span>
        <span>{rooms.length} room{rooms.length !== 1 ? 's' : ''}</span>
        {flagged > 0 && <span className="ml-auto text-amber-text font-medium">{flagged} flagged</span>}
      </div>

      {refs.length > 0 ? (
        <div className="mt-auto pt-2 border-t border-border/60 space-y-1">
          {refs.map((r) => (
            <div key={r.label} className="flex items-start gap-1.5 text-meta">
              <r.icon className="w-3 h-3 text-forest/40 mt-0.5 flex-shrink-0" />
              <span className="text-forest/40">{r.label}:</span>
              <span className="text-forest/70 font-medium">{r.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-auto pt-2 text-meta text-forest/30 italic">No shutoff locations recorded yet</p>
      )}
    </button>
  );
}

export function BuildingsOverview() {
  const buildings = useBuildings();

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {buildings.map((b) => <BuildingCard key={b.id} building={b} />)}
      </div>
    </div>
  );
}
