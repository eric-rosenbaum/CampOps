import { Building2 } from 'lucide-react';
import { useBuildingStore, COMPONENT_TYPE_LABELS, componentSummary } from '@/store/buildingStore';
import { StatusDot, ComponentIcon } from './buildingUi';
import { useJumpToComponent } from './useBuildingNav';
import type { BuildingSystem } from '@/lib/types';

export function CrossBuildingList({ system }: { system: BuildingSystem }) {
  const { buildings, components } = useBuildingStore();
  const jump = useJumpToComponent();
  const sortedBuildings = [...buildings].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const withItems = sortedBuildings
    .map((b) => ({ building: b, comps: components.filter((c) => c.buildingId === b.id && c.system === system) }))
    .filter((g) => g.comps.length > 0);

  if (withItems.length === 0) {
    return <p className="text-body text-forest/40">No {system} components recorded yet.</p>;
  }

  return (
    <div className="space-y-5">
      {withItems.map(({ building, comps }) => (
        <div key={building.id}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Building2 className="w-3.5 h-3.5 text-forest/40" />
            <span className="text-body font-semibold text-forest">{building.name}</span>
            <span className="text-meta text-forest/30">{comps.length}</span>
          </div>
          <div className="bg-white border border-border rounded-card overflow-hidden">
            {comps.map((c, i) => {
              const summary = componentSummary(c);
              return (
                <button
                  key={c.id}
                  onClick={() => jump(c)}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-cream-dark transition-colors ${
                    i > 0 ? 'border-t border-border/60' : ''
                  }`}
                >
                  <ComponentIcon type={c.type} className="w-4 h-4 text-forest/50 flex-shrink-0" />
                  <StatusDot status={c.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-forest truncate">{c.label}</p>
                    <p className="text-meta text-forest/40 truncate">
                      {[COMPONENT_TYPE_LABELS[c.type], summary, c.locationDetail].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
