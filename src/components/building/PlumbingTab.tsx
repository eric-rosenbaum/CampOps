import { Building2, Gauge } from 'lucide-react';
import { useBuildingStore, componentSummary } from '@/store/buildingStore';
import { CrossBuildingList } from './CrossBuildingList';
import { useJumpToComponent } from './useBuildingNav';

export function PlumbingTab() {
  const { shutoffValves, buildings } = useBuildingStore();
  const jump = useJumpToComponent();
  const valves = shutoffValves();

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6 space-y-7">
      {/* Shutoff valve map — the emergency reference */}
      <section>
        <h3 className="text-card-title font-semibold text-forest mb-1">Shutoff valves</h3>
        <p className="text-meta text-forest/40 mb-3">Where to cut the water in a hurry.</p>
        {valves.length === 0 ? (
          <p className="text-body text-forest/40">No shutoff valves recorded yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {valves.map((v) => {
              const building = buildings.find((b) => b.id === v.buildingId);
              const summary = componentSummary(v);
              return (
                <button
                  key={v.id}
                  onClick={() => jump(v)}
                  className="text-left bg-white border border-border rounded-card p-3.5 hover:border-sage transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Gauge className="w-4 h-4 text-forest/50" />
                    <span className="text-body font-semibold text-forest truncate">{v.label}</span>
                  </div>
                  {building && (
                    <p className="inline-flex items-center gap-1 text-meta text-forest/40 mb-1">
                      <Building2 className="w-3 h-3" /> {building.name}
                    </p>
                  )}
                  {v.locationDetail && <p className="text-body text-forest/70">{v.locationDetail}</p>}
                  {summary && <p className="text-meta text-forest/40 mt-0.5">{summary}</p>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* All plumbing components */}
      <section>
        <h3 className="text-card-title font-semibold text-forest mb-3">All plumbing components</h3>
        <CrossBuildingList system="plumbing" />
      </section>
    </div>
  );
}
