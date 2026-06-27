import { Building2, Power } from 'lucide-react';
import { useBuildingStore } from '@/store/buildingStore';
import { CrossBuildingList } from './CrossBuildingList';
import { useJumpToComponent } from './useBuildingNav';

export function ElectricalTab() {
  const { panels, circuitsForPanel, buildings } = useBuildingStore();
  const jump = useJumpToComponent();
  const allPanels = panels();

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6 space-y-7">
      {/* Panels & breaker schedules */}
      <section>
        <h3 className="text-card-title font-semibold text-forest mb-3">Panels &amp; breaker schedules</h3>
        {allPanels.length === 0 ? (
          <p className="text-body text-forest/40">
            No panels mapped yet. Add a breaker panel to a building, then map its breakers.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {allPanels.map((panel) => {
              const building = buildings.find((b) => b.id === panel.buildingId);
              const circuits = circuitsForPanel(panel.id);
              return (
                <div key={panel.id} className="bg-white border border-border rounded-card p-4">
                  <button onClick={() => jump(panel)} className="flex items-center gap-2 mb-2 text-left group">
                    <Power className="w-4 h-4 text-forest/50" />
                    <span className="text-body font-semibold text-forest group-hover:text-sage transition-colors">{panel.label}</span>
                    {building && (
                      <span className="inline-flex items-center gap-1 text-meta text-forest/40">
                        <Building2 className="w-3 h-3" /> {building.name}
                      </span>
                    )}
                  </button>
                  {circuits.length === 0 ? (
                    <p className="text-meta text-forest/30">No breakers mapped yet.</p>
                  ) : (
                    <div className="border border-border rounded-btn overflow-hidden">
                      {circuits.map((c, i) => (
                        <div key={c.id} className={`flex items-start gap-2 px-2.5 py-1.5 ${i > 0 ? 'border-t border-border/60' : ''} ${c.isOn ? '' : 'opacity-50'}`}>
                          <span className="text-meta font-mono font-semibold text-forest/60 w-7 flex-shrink-0 text-right">{c.breakerNumber ?? '–'}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-body text-forest truncate">{c.label ?? c.controls ?? 'Unlabeled'}</p>
                            {c.controls && c.label && <p className="text-meta text-forest/40 truncate">{c.controls}</p>}
                          </div>
                          {c.amperage ? <span className="text-meta text-forest/40 flex-shrink-0">{c.amperage}A</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* All electrical components */}
      <section>
        <h3 className="text-card-title font-semibold text-forest mb-3">All electrical components</h3>
        <CrossBuildingList system="electrical" />
      </section>
    </div>
  );
}
