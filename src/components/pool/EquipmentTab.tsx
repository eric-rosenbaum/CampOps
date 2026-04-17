import { usePoolStore } from '@/store/poolStore';
import { useUIStore } from '@/store/uiStore';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { Button } from '@/components/shared/Button';
import { FlagIssueModal } from './FlagIssueModal';
import { EquipmentHistoryModal } from './EquipmentHistoryModal';
import type { PoolEquipment } from '@/lib/types';

function statusBorderColor(status: PoolEquipment['status']) {
  if (status === 'alert') return 'border-l-red';
  if (status === 'warn') return 'border-l-amber';
  return 'border-l-sage';
}

function StatusBadge({ status, label }: { status: PoolEquipment['status']; label: string }) {
  const cls =
    status === 'ok'
      ? 'bg-green-muted-bg text-green-muted-text'
      : status === 'warn'
      ? 'bg-amber-bg text-amber-text'
      : 'bg-red-bg text-red';
  return (
    <span className={`text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function FieldBlock({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-meta text-forest/40 font-medium mb-0.5">{label}</p>
      <p className={`text-body font-medium font-mono ${valueClass || 'text-forest'}`}>{value}</p>
    </div>
  );
}

function statusLabel(equip: PoolEquipment): string {
  if (equip.status === 'ok') return 'Operational';
  if (equip.type === 'pump' && equip.status === 'warn') return 'Service needed';
  if (equip.status === 'warn') return 'Service due soon';
  return 'Issue flagged';
}

function getEquipmentFields(equip: PoolEquipment): { label: string; value: string; valueClass?: string }[] {
  const fields: { label: string; value: string; valueClass?: string }[] = [];

  fields.push({
    label: 'Status',
    value: equip.statusDetail || equip.status,
    valueClass:
      equip.status === 'ok'
        ? 'text-green-muted-text'
        : equip.status === 'warn'
        ? 'text-amber'
        : 'text-red',
  });

  if (equip.type === 'safety') {
    fields.push(
      { label: 'Rescue tubes', value: '4 of 4', valueClass: 'text-green-muted-text' },
      { label: 'Life rings', value: '2 of 2', valueClass: 'text-green-muted-text' },
      { label: 'AED device', value: 'Present & charged', valueClass: 'text-green-muted-text' },
    );
  } else if (equip.type === 'chlorinator') {
    fields.push(
      { label: 'Last refilled', value: equip.lastServiced ?? '—' },
      { label: 'Tablet level', value: equip.statusDetail, valueClass: 'text-amber' },
      { label: 'Setting', value: '4 of 10' },
    );
  } else if (equip.type === 'filter') {
    fields.push(
      { label: 'Last backwashed', value: equip.lastServiced ?? '—' },
      { label: 'Next backwash due', value: equip.nextServiceDue ?? '—', valueClass: equip.status === 'ok' ? 'text-green-muted-text' : 'text-amber' },
      { label: 'Sand replaced', value: 'Apr 2024' },
    );
  } else {
    if (equip.lastServiced) fields.push({ label: 'Last serviced', value: equip.lastServiced });
    if (equip.nextServiceDue)
      fields.push({
        label: 'Next service due',
        value: equip.nextServiceDue,
        valueClass: equip.status === 'warn' ? 'text-amber' : undefined,
      });
    if (equip.vendor) fields.push({ label: 'Vendor', value: equip.vendor });
  }

  return fields;
}

export function EquipmentTab() {
  const { activeEquipment, deleteEquipment } = usePoolStore();
  const {
    openLogServiceModal, openAddEquipmentModal,
    openFlagIssueModal, openEquipmentHistoryModal,
    isFlagIssueModalOpen, isEquipmentHistoryModalOpen,
  } = useUIStore();

  const equipment = activeEquipment();
  const total = equipment.length;
  const operational = equipment.filter((e) => e.status === 'ok').length;
  const serviceDue = equipment.filter((e) => e.status === 'warn').length;
  const needsRepair = equipment.filter((e) => e.status === 'alert').length;

  const warnEquip = equipment.filter((e) => e.status === 'warn' || e.status === 'alert');

  function handleDelete(equip: PoolEquipment) {
    if (window.confirm(`Delete "${equip.name}"? This cannot be undone.`)) {
      deleteEquipment(equip.id);
    }
  }

  return (
    <div>
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        {[
          { label: 'Total equipment', value: total, hint: 'Items tracked', cls: 'text-forest' },
          { label: 'Operational', value: operational, hint: 'Running normally', cls: 'text-green-muted-text' },
          { label: 'Service due', value: serviceDue, hint: 'Needs attention soon', cls: serviceDue > 0 ? 'text-amber' : 'text-forest' },
          { label: 'Needs repair', value: needsRepair, hint: 'Issue flagged', cls: needsRepair > 0 ? 'text-red' : 'text-forest' },
        ].map(({ label, value, hint, cls }) => (
          <div key={label} className="bg-white border border-border rounded-card px-4 py-4">
            <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">{label}</p>
            <p className={`font-mono text-stat font-semibold mt-1 ${cls}`}>{value}</p>
            <p className="text-meta text-forest/40 mt-0.5">{hint}</p>
          </div>
        ))}
      </div>

      {/* Warning banner */}
      {warnEquip.length > 0 && (
        <AlertBanner
          variant="warn"
          message={
            warnEquip.map((e) => `${e.name} — ${e.statusDetail.toLowerCase()}.`).join(' ') +
            ' Monitor closely and schedule service as needed.'
          }
        />
      )}

      {/* Equipment list */}
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-card-title font-semibold text-forest">Equipment registry</h3>
        <Button variant="ghost" size="sm" onClick={openAddEquipmentModal}>+ Add equipment</Button>
      </div>

      {equipment.length === 0 && (
        <p className="text-body text-forest/40 text-center py-10">No equipment added yet.</p>
      )}

      <div className="flex flex-col gap-2.5">
        {equipment.map((equip) => {
          const fields = getEquipmentFields(equip);
          return (
            <div
              key={equip.id}
              className={`bg-white border border-border border-l-[3px] rounded-card px-5 py-4 ${statusBorderColor(equip.status)}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-card-title font-semibold text-forest">{equip.name}</h4>
                <div className="flex items-center gap-2">
                  <StatusBadge status={equip.status} label={statusLabel(equip)} />
                  {equip.specs && (
                    <span className="text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-cream-dark text-forest/50">
                      {equip.specs}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {fields.map((f) => (
                  <FieldBlock key={f.label} {...f} />
                ))}
              </div>

              <div className="flex gap-2 mt-3.5 pt-3 border-t border-cream-dark">
                <Button variant="ghost" size="sm" onClick={() => openLogServiceModal(equip.id)}>
                  Log service
                </Button>
                {equip.status === 'ok' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red/70 hover:text-red hover:bg-red-bg"
                    onClick={() => openFlagIssueModal(equip.id)}
                  >
                    Flag issue
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-amber hover:bg-amber-bg"
                    onClick={() => openFlagIssueModal(equip.id)}
                  >
                    Edit issue
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => openEquipmentHistoryModal(equip.id)}>
                  View history
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-red/60 hover:text-red hover:bg-red-bg"
                  onClick={() => handleDelete(equip)}
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {isFlagIssueModalOpen && <FlagIssueModal />}
      {isEquipmentHistoryModalOpen && <EquipmentHistoryModal />}
    </div>
  );
}
