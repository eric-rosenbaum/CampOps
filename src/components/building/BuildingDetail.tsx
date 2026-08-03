import { ChevronLeft, Pencil, Plus, Zap, Droplet, Power, Flame } from 'lucide-react';
import {
  useBuildingStore, BUILDING_TYPE_LABELS, COMPONENT_TYPE_LABELS, componentSummary,
} from '@/store/buildingStore';
import { useLocationStore } from '@/store/locationStore';
import { useAuth } from '@/lib/auth';
import { StatusDot, ComponentIcon } from './buildingUi';
import { ComponentDetailPanel } from './ComponentDetailPanel';
import { useRooms, useBuildingDetail } from './useBuildings';
import type { BuildingComponent, BuildingSystem, BuildingType } from '@/lib/types';

function ComponentRow({ component }: { component: BuildingComponent }) {
  const { activeComponentId, setActiveComponent } = useBuildingStore();
  const summary = componentSummary(component);
  const isActive = activeComponentId === component.id;

  return (
    <button
      onClick={() => setActiveComponent(isActive ? null : component.id)}
      className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-btn border transition-colors ${
        isActive ? 'border-sage bg-sage/[0.06]' : 'border-transparent hover:bg-cream-dark'
      }`}
    >
      <ComponentIcon type={component.type} className="w-4 h-4 text-forest/50 flex-shrink-0" />
      <StatusDot status={component.status} />
      <div className="min-w-0 flex-1">
        <p className="text-body text-forest truncate">{component.label}</p>
        {(summary || component.locationDetail) && (
          <p className="text-meta text-forest/40 truncate">
            {[COMPONENT_TYPE_LABELS[component.type], summary, component.locationDetail].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </button>
  );
}

interface SystemGroupProps {
  system: BuildingSystem;
  components: BuildingComponent[];
  canManage: boolean;
  onAdd: () => void;
}

function SystemGroup({ system, components, canManage, onAdd }: SystemGroupProps) {
  const Icon = system === 'electrical' ? Zap : Droplet;
  const label = system === 'electrical' ? 'Electrical' : 'Plumbing';
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 px-1 mb-1">
        <Icon className="w-3.5 h-3.5 text-forest/40" />
        <span className="text-label font-semibold uppercase tracking-widest text-forest/40">{label}</span>
        <span className="text-meta text-forest/30">{components.length}</span>
        {canManage && (
          <button onClick={onAdd} className="ml-auto text-meta text-forest/50 hover:text-forest font-medium transition-colors">
            + Add
          </button>
        )}
      </div>
      {components.length === 0 ? (
        <p className="text-meta text-forest/30 px-3 py-1.5">None recorded.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {components.map((c) => <ComponentRow key={c.id} component={c} />)}
        </div>
      )}
    </div>
  );
}

export function BuildingDetail() {
  const { activeBuildingId, activeComponent, componentsForLocation, setActiveBuilding, openModal } = useBuildingStore();
  const building = useLocationStore((s) => (activeBuildingId ? s.locationById(activeBuildingId) : undefined));
  const detail = useBuildingDetail(activeBuildingId);
  const rooms = useRooms(activeBuildingId ?? '');
  const { can } = useAuth();
  const canManage = can('manageBuildingSystems');

  if (!building) return null;
  const buildingId = building.id;
  const selected = activeComponent();
  // Components attached directly to the building node (no room).
  const buildingLevel = componentsForLocation(buildingId);

  const typeLabel = detail?.buildingType
    ? (BUILDING_TYPE_LABELS[detail.buildingType as BuildingType] ?? detail.buildingType)
    : 'Building';

  const refs = [
    { icon: Droplet, label: 'Water shutoff', value: detail?.mainWaterShutoff },
    { icon: Power, label: 'Main panel', value: detail?.mainElectricalPanel },
    { icon: Flame, label: 'Gas shutoff', value: detail?.mainGasShutoff },
  ].filter((r) => r.value);

  function renderGroup(locationId: string, name: string, isRoom: boolean, subtitle?: string) {
    const comps = componentsForLocation(locationId);
    const electrical = comps.filter((c) => c.system === 'electrical');
    const plumbing = comps.filter((c) => c.system === 'plumbing');
    return (
      <div key={locationId} className="bg-white border border-border rounded-card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-card-title font-semibold text-forest">{name}</span>
          {subtitle && <span className="text-meta text-forest/40">{subtitle}</span>}
          <span className="text-meta text-forest/30 ml-1">{comps.length} item{comps.length !== 1 ? 's' : ''}</span>
          {canManage && isRoom && (
            <button
              onClick={() => openModal({ kind: 'room', buildingId, editId: locationId })}
              className="ml-auto p-1 rounded text-forest/30 hover:text-forest hover:bg-cream transition-colors"
              title="Edit room"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <SystemGroup
          system="electrical"
          components={electrical}
          canManage={canManage}
          onAdd={() => openModal({ kind: 'component', buildingId, defaultLocationId: locationId, defaultSystem: 'electrical' })}
        />
        <SystemGroup
          system="plumbing"
          components={plumbing}
          canManage={canManage}
          onAdd={() => openModal({ kind: 'component', buildingId, defaultLocationId: locationId, defaultSystem: 'plumbing' })}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Left: rooms + components */}
      <div className="flex-1 min-w-0 overflow-y-auto px-7 py-5">
        <button
          onClick={() => setActiveBuilding(null)}
          className="flex items-center gap-1 text-meta text-forest/40 hover:text-forest mb-3 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> All buildings
        </button>

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-panel-title font-semibold text-forest">{building.name}</h2>
            <p className="text-meta text-forest/40">{typeLabel}</p>
          </div>
          {canManage && (
            <button
              onClick={() => openModal({ kind: 'building', editId: buildingId })}
              className="inline-flex items-center gap-1 text-meta text-forest/50 hover:text-forest font-medium transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit building
            </button>
          )}
        </div>

        {/* Emergency reference */}
        {refs.length > 0 && (
          <div className="bg-amber-bg/60 border border-amber/20 rounded-card px-4 py-3 mb-5">
            <p className="text-label font-semibold uppercase tracking-widest text-amber-text/70 mb-1.5">Emergency reference</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-1">
              {refs.map((r) => (
                <div key={r.label} className="flex items-start gap-1.5 text-body">
                  <r.icon className="w-3.5 h-3.5 text-amber-text/60 mt-0.5 flex-shrink-0" />
                  <span className="text-forest/50">{r.label}:</span>
                  <span className="text-forest font-medium">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              onClick={() => openModal({ kind: 'component', buildingId, defaultLocationId: buildingId })}
              className="inline-flex items-center gap-1 text-meta font-medium text-forest/60 hover:text-forest border border-border rounded-btn px-2.5 py-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add component
            </button>
            <span className="text-meta text-forest/40">Rooms are added in <span className="font-medium">Camp Info → Locations</span> (as sub-locations of this building).</span>
          </div>
        )}

        {rooms.length === 0 && buildingLevel.length === 0 && (
          <p className="text-body text-forest/40 px-1">
            No rooms or components yet.{canManage ? ' Add a room, or add components directly to the building.' : ''}
          </p>
        )}

        {rooms.map((r) => renderGroup(r.id, r.name, true))}
        {buildingLevel.length > 0 && renderGroup(buildingId, 'Building-level', false, 'not tied to a room')}
      </div>

      {/* Right: component detail panel */}
      {selected && <ComponentDetailPanel component={selected} />}
    </div>
  );
}
