import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import {
  useBuildingStore, componentTypesFor, COMPONENT_SPECS, STATUS_LABELS, type SpecField,
} from '@/store/buildingStore';
import { generateId } from '@/lib/utils';
import type {
  BuildingComponent, BuildingComponentType, BuildingSystem, ComponentStatus,
} from '@/lib/types';

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

interface Props {
  buildingId: string;
  editId?: string;
  defaultRoomId?: string | null;
  defaultSystem?: BuildingSystem;
}

export function AddEditComponentModal({ buildingId, editId, defaultRoomId, defaultSystem }: Props) {
  const { components, roomsForBuilding, addComponent, updateComponent, closeModal } = useBuildingStore();
  const existing = editId ? components.find((c) => c.id === editId) ?? null : null;
  const rooms = roomsForBuilding(buildingId);

  const [system, setSystem] = useState<BuildingSystem>(existing?.system ?? defaultSystem ?? 'electrical');
  const initialTypes = componentTypesFor(existing?.system ?? defaultSystem ?? 'electrical');
  const [type, setType] = useState<BuildingComponentType>(existing?.type ?? (initialTypes[0].value as BuildingComponentType));
  const [label, setLabel] = useState(existing?.label ?? '');
  const [roomId, setRoomId] = useState<string | null>(existing?.roomId ?? defaultRoomId ?? null);
  const [locationDetail, setLocationDetail] = useState(existing?.locationDetail ?? '');
  const [status, setStatus] = useState<ComponentStatus>(existing?.status ?? 'operational');
  const [statusDetail, setStatusDetail] = useState(existing?.statusDetail ?? '');
  const [metadata, setMetadata] = useState<Record<string, unknown>>(existing?.metadata ?? {});
  const [lastServiced, setLastServiced] = useState(existing?.lastServiced ?? '');
  const [nextServiceDue, setNextServiceDue] = useState(existing?.nextServiceDue ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const typeOptions = componentTypesFor(system);
  const specs: SpecField[] = COMPONENT_SPECS[type] ?? [];

  function changeSystem(s: BuildingSystem) {
    setSystem(s);
    const first = componentTypesFor(s)[0].value as BuildingComponentType;
    setType(first);
    setMetadata({});
  }

  function changeType(t: BuildingComponentType) {
    setType(t);
    setMetadata({}); // specs differ per type
  }

  function setMeta(key: string, value: unknown) {
    setMetadata((m) => ({ ...m, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    // Prune empty metadata values.
    const cleanMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(metadata)) {
      if (v !== '' && v !== undefined && v !== null) cleanMeta[k] = v;
    }
    const now = new Date().toISOString();
    if (existing) {
      updateComponent({
        ...existing, system, type, label: label.trim(), roomId,
        locationDetail: locationDetail || null, status, statusDetail: statusDetail || null,
        metadata: cleanMeta, lastServiced: lastServiced || null, nextServiceDue: nextServiceDue || null,
        notes: notes || null,
      });
    } else {
      const c: BuildingComponent = {
        id: generateId(), buildingId, roomId, system, type, label: label.trim(),
        locationDetail: locationDetail || null, status, statusDetail: statusDetail || null,
        lastServiced: lastServiced || null, nextServiceDue: nextServiceDue || null,
        photoUrl: null, metadata: cleanMeta, controllingCircuitId: null, notes: notes || null,
        sortOrder: components.filter((x) => x.buildingId === buildingId).length,
        createdAt: now, updatedAt: now,
      };
      addComponent(c);
    }
    closeModal();
  }

  return (
    <Modal title={existing ? 'Edit component' : 'Add component'} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* System toggle */}
        <div className="grid grid-cols-2 gap-2">
          {(['electrical', 'plumbing'] as BuildingSystem[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => changeSystem(s)}
              className={`text-body font-medium rounded-btn py-2 border transition-colors capitalize ${
                system === s ? 'border-sage bg-sage/[0.1] text-forest' : 'border-border text-forest/50 hover:bg-cream-dark'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Type</label>
            <select value={type} onChange={(e) => changeType(e.target.value as BuildingComponentType)} className={inputClass}>
              {typeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Room</label>
            <select value={roomId ?? ''} onChange={(e) => setRoomId(e.target.value || null)} className={inputClass}>
              <option value="">Unassigned</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Label *</label>
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} placeholder="e.g. North wall outlet, Main shutoff" />
        </div>

        <div>
          <label className={labelClass}>Location detail</label>
          <input value={locationDetail} onChange={(e) => setLocationDetail(e.target.value)} className={inputClass} placeholder="where in the room — optional" />
        </div>

        {/* Dynamic specs */}
        {specs.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {specs.map((f) => (
              <div key={f.key} className={f.kind === 'bool' ? 'col-span-2' : ''}>
                {f.kind === 'bool' ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={Boolean(metadata[f.key])} onChange={(e) => setMeta(f.key, e.target.checked)} className="w-4 h-4 accent-forest rounded" />
                    <span className="text-body text-forest/80">{f.label}</span>
                  </label>
                ) : f.kind === 'select' ? (
                  <>
                    <label className={labelClass}>{f.label}</label>
                    <select value={String(metadata[f.key] ?? '')} onChange={(e) => setMeta(f.key, e.target.value)} className={inputClass}>
                      <option value="">—</option>
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <label className={labelClass}>{f.label}</label>
                    <input
                      value={String(metadata[f.key] ?? '')}
                      onChange={(e) => setMeta(f.key, f.kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                      inputMode={f.kind === 'number' ? 'numeric' : undefined}
                      className={inputClass}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as ComponentStatus)} className={inputClass}>
              {(Object.keys(STATUS_LABELS) as ComponentStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          {status !== 'operational' && (
            <div>
              <label className={labelClass}>Status detail</label>
              <input value={statusDetail} onChange={(e) => setStatusDetail(e.target.value)} className={inputClass} placeholder="what's wrong" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Last serviced</label>
            <input type="date" value={lastServiced} onChange={(e) => setLastServiced(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Next service due</label>
            <input type="date" value={nextServiceDue} onChange={(e) => setNextServiceDue(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="optional" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center">{existing ? 'Save changes' : 'Add component'}</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
