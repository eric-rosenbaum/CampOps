import { X, Pencil, Trash2, Flag, Plus, Zap, ChevronLeft } from 'lucide-react';
import {
  useBuildingStore, COMPONENT_TYPE_LABELS, COMPONENT_SPECS, type SpecField,
} from '@/store/buildingStore';
import { useLocationStore } from '@/store/locationStore';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { ComponentStatusBadge, ComponentIcon } from './buildingUi';
import { buildingLocationFor } from './useBuildings';
import type { BuildingComponent } from '@/lib/types';

function formatSpecValue(field: SpecField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '-';
  if (field.kind === 'bool') return value ? 'Yes' : 'No';
  if (field.kind === 'select') return field.options?.find((o) => o.value === String(value))?.label ?? String(value);
  return String(value);
}

export function ComponentDetailPanel({ component }: { component: BuildingComponent }) {
  const {
    setActiveComponent, deleteComponent, openModal, circuitsForPanel, deleteCircuit,
  } = useBuildingStore();
  const { can } = useAuth();
  const canManage = can('manageBuildingSystems');

  // The component's location is a room when it has a parent (the building node itself has none).
  const locationNode = useLocationStore((s) => s.locationById(component.locationId));
  const room = locationNode?.parentId ? locationNode : undefined;
  const buildingId = buildingLocationFor(component.locationId)?.id ?? component.locationId;
  const specs = COMPONENT_SPECS[component.type] ?? [];
  const isPanel = component.type === 'breaker_panel' || component.type === 'sub_panel';
  const circuits = isPanel ? circuitsForPanel(component.id) : [];

  function handleDelete() {
    if (confirm(`Delete "${component.label}"? This can't be undone.`)) {
      deleteComponent(component.id);
    }
  }

  return (
    <aside className="border-l border-border bg-white overflow-y-auto flex-shrink-0
      fixed inset-0 z-40 w-full
      lg:static lg:z-auto lg:w-detail lg:min-w-detail lg:h-full">
      <button
        onClick={() => setActiveComponent(null)}
        className="lg:hidden flex items-center gap-1.5 px-4 py-3 border-b border-border text-[13px] font-medium text-ink hover:text-forest w-full"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-btn bg-cream-dark flex items-center justify-center flex-shrink-0">
            <ComponentIcon type={component.type} className="w-5 h-5 text-ink-soft" />
          </div>
          <div className="min-w-0">
            <p className="text-card-title font-semibold text-forest truncate">{component.label}</p>
            <p className="text-meta text-ink-faint">{COMPONENT_TYPE_LABELS[component.type]}</p>
          </div>
        </div>
        <button onClick={() => setActiveComponent(null)} className="text-ink-faint hover:text-forest transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <ComponentStatusBadge status={component.status} />
          {component.statusDetail && <span className="text-meta text-ink-soft">{component.statusDetail}</span>}
        </div>

        {component.photoUrl && (
          <img src={component.photoUrl} alt={component.label} className="w-full rounded-card border border-border object-cover max-h-44" />
        )}

        <dl className="space-y-2">
          {room && <Row label="Room" value={room.name} />}
          {component.locationDetail && <Row label="Location" value={component.locationDetail} />}
          {specs.map((f) => {
            const v = component.metadata?.[f.key];
            if (v === undefined || v === null || v === '') return null;
            return <Row key={f.key} label={f.label} value={formatSpecValue(f, v)} />;
          })}
          {component.lastServiced && <Row label="Last serviced" value={formatDate(component.lastServiced)} />}
          {component.nextServiceDue && <Row label="Next service due" value={formatDate(component.nextServiceDue)} />}
        </dl>

        {component.notes && (
          <div>
            <p className="text-label font-semibold uppercase tracking-widest text-ink-faint mb-1">Notes</p>
            <p className="text-body text-ink whitespace-pre-wrap">{component.notes}</p>
          </div>
        )}

        {/* Panel schedule */}
        {isPanel && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Zap className="w-3.5 h-3.5 text-ink-faint" />
              <span className="text-label font-semibold uppercase tracking-widest text-ink-faint">Panel schedule</span>
              {canManage && (
                <button
                  onClick={() => openModal({ kind: 'circuit', panelId: component.id })}
                  className="ml-auto inline-flex items-center gap-0.5 text-meta text-ink-soft hover:text-forest font-medium transition-colors"
                >
                  <Plus className="w-3 h-3" /> Breaker
                </button>
              )}
            </div>
            {circuits.length === 0 ? (
              <p className="text-meta text-forest/30">No breakers mapped yet.</p>
            ) : (
              <div className="border border-border rounded-card overflow-hidden">
                {circuits.map((c, i) => (
                  <div
                    key={c.id}
                    className={`flex items-start gap-2 px-2.5 py-1.5 group ${i > 0 ? 'border-t border-border/60' : ''} ${
                      c.isOn ? '' : 'opacity-50'
                    }`}
                  >
                    <span className="text-meta font-mono font-semibold text-ink-soft w-7 flex-shrink-0 text-right">
                      {c.breakerNumber ?? '–'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body text-forest truncate">{c.label ?? c.controls ?? 'Unlabeled'}</p>
                      {(c.controls && c.label) && <p className="text-meta text-ink-faint truncate">{c.controls}</p>}
                      {c.amperage ? <p className="text-meta text-ink-faint">{c.amperage}A{c.isOn ? '' : ' · OFF'}</p> : (!c.isOn && <p className="text-meta text-ink-faint">OFF</p>)}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openModal({ kind: 'circuit', panelId: component.id, editId: c.id })} className="p-1 rounded text-ink-faint hover:text-forest hover:bg-cream" title="Edit breaker">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => deleteCircuit(c.id)} className="p-1 rounded text-ink-faint hover:text-red hover:bg-red-bg" title="Delete breaker">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {canManage && (
          <div className="flex flex-col gap-1.5 pt-1">
            <button
              onClick={() => openModal({ kind: 'flag', componentId: component.id })}
              className="inline-flex items-center justify-center gap-1.5 text-body font-medium text-amber-text bg-amber-bg border border-amber/20 rounded-btn py-2 hover:bg-amber-bg/70 transition-colors"
            >
              <Flag className="w-3.5 h-3.5" /> Flag issue
            </button>
            <div className="flex gap-1.5">
              <button
                onClick={() => openModal({ kind: 'component', buildingId, editId: component.id })}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-body font-medium text-forest border border-border rounded-btn py-2 hover:bg-cream-dark transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={handleDelete}
                className="inline-flex items-center justify-center gap-1.5 text-body font-medium text-red border border-border rounded-btn px-3 py-2 hover:bg-red-bg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-meta text-ink-faint w-28 flex-shrink-0">{label}</dt>
      <dd className="text-body text-ink min-w-0">{value}</dd>
    </div>
  );
}
