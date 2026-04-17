import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { usePoolStore } from '@/store/poolStore';
import type { ServiceType } from '@/lib/types';

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  routine_maintenance: 'Routine maintenance',
  repair: 'Repair',
  inspection: 'Inspection',
  part_replacement: 'Part replacement',
  vendor_service: 'Vendor service',
};

const SERVICE_TYPE_COLORS: Record<ServiceType, string> = {
  routine_maintenance: 'bg-green-muted-bg text-green-muted-text',
  repair: 'bg-red-bg text-red',
  inspection: 'bg-cream-dark text-forest/60',
  part_replacement: 'bg-amber-bg text-amber-text',
  vendor_service: 'bg-cream-dark text-forest/60',
};

export function EquipmentHistoryModal() {
  const { closeAllModals, historyEquipmentId, openLogServiceModal, openEditServiceLogModal } = useUIStore();
  const { equipment, serviceLog, deleteServiceLog } = usePoolStore();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const equip = equipment.find((e) => e.id === historyEquipmentId) ?? null;
  const history = [...serviceLog]
    .filter((s) => s.equipmentId === historyEquipmentId)
    .sort((a, b) => new Date(b.datePerformed).getTime() - new Date(a.datePerformed).getTime());

  if (!equip) return null;

  function handleDelete(id: string) {
    if (window.confirm('Delete this service record? This cannot be undone.')) {
      deleteServiceLog(id);
    }
  }

  return (
    <Modal title={`Service history — ${equip.name}`} onClose={closeAllModals} width="560px">
      <div className="space-y-4">
        {/* Equipment summary */}
        <div className="bg-cream rounded-card px-4 py-3 flex items-center gap-6 text-body -mt-1">
          <div>
            <span className="text-forest/50 text-secondary">Type</span>
            <span className="ml-2 font-medium text-forest capitalize">{equip.type}</span>
          </div>
          {equip.lastServiced && (
            <div>
              <span className="text-forest/50 text-secondary">Last serviced</span>
              <span className="ml-2 font-medium font-mono text-forest">
                {new Date(equip.lastServiced).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          )}
          {equip.nextServiceDue && (
            <div>
              <span className="text-forest/50 text-secondary">Next due</span>
              <span className="ml-2 font-medium font-mono text-forest">
                {new Date(equip.nextServiceDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          )}
        </div>

        {/* Log entries */}
        {history.length === 0 ? (
          <p className="text-body text-forest/40 text-center py-8">No service records yet for this equipment.</p>
        ) : (
          <div className="border border-border rounded-card overflow-hidden">
            {history.map((entry, idx) => (
              <div
                key={entry.id}
                className={`px-5 py-4 transition-colors ${hoveredId === entry.id ? 'bg-cream/40' : ''} ${idx < history.length - 1 ? 'border-b border-cream-dark' : ''}`}
                onMouseEnter={() => setHoveredId(entry.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide ${SERVICE_TYPE_COLORS[entry.serviceType]}`}>
                        {SERVICE_TYPE_LABELS[entry.serviceType]}
                      </span>
                      <span className="text-meta text-forest/40 font-mono">
                        {new Date(entry.datePerformed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-body text-forest/70">By {entry.performedBy}</p>
                    {entry.notes && (
                      <p className="text-secondary text-forest/50 mt-1">{entry.notes}</p>
                    )}
                  </div>
                  <div className="flex items-start gap-2 flex-shrink-0">
                    <div className="text-right">
                      {entry.cost != null && (
                        <p className="text-body font-mono font-semibold text-forest">
                          ${entry.cost.toFixed(2)}
                        </p>
                      )}
                      {entry.nextServiceDue && (
                        <p className="text-meta text-forest/40 mt-0.5">
                          Next: {new Date(entry.nextServiceDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className={`flex gap-1 transition-opacity ${hoveredId === entry.id ? 'opacity-100' : 'opacity-0'}`}>
                      <button
                        type="button"
                        onClick={() => { closeAllModals(); openEditServiceLogModal(entry.id); }}
                        className="p-1.5 rounded text-forest/40 hover:text-forest hover:bg-cream transition-colors"
                        title="Edit record"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="p-1.5 rounded text-forest/40 hover:text-red hover:bg-red-bg transition-colors"
                        title="Delete record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            onClick={() => { closeAllModals(); openLogServiceModal(equip.id); }}
          >
            + Log service
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
