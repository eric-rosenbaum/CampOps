import { useState } from 'react';
import { X, Pencil, Trash2, LogIn, RotateCcw, Wrench, Plus, CheckSquare, Square } from 'lucide-react';
import { isPast } from 'date-fns';
import {
  useAssetStore,
  ASSET_CATEGORY_LABELS, ASSET_STATUS_LABELS, SUBTYPE_LABELS,
  SERVICE_TYPE_LABELS, CHECKOUT_CONDITION_LABELS, FUEL_LEVEL_LABELS,
} from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import type {
  CampAsset, AssetCheckout, AssetServiceRecord, AssetMaintenanceTask,
  AssetMaintenancePhase, CheckoutCondition, FuelLevel,
} from '@/lib/types';

type DetailTab = 'overview' | 'checkouts' | 'service' | 'maintenance';

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'checkouts', label: 'Checkouts' },
  { id: 'service', label: 'Service' },
  { id: 'maintenance', label: 'Maintenance' },
];

const PHASES: { value: AssetMaintenancePhase; label: string }[] = [
  { value: 'pre_season', label: 'Pre-Season' },
  { value: 'in_season', label: 'In-Season' },
  { value: 'post_season', label: 'Post-Season' },
];

export function AssetDetailPanel() {
  const {
    activeAsset, setActiveAsset, activeDetailTab, setDetailTab,
    currentCheckoutForAsset, checkoutHistoryForAsset,
    serviceHistoryForAsset, maintenanceTasksForAsset,
    maintenanceProgressForAsset, deleteAsset,
    toggleMaintenanceTask, deleteServiceRecord, deleteMaintenanceTask,
    deleteCheckout, updateCheckout,
  } = useAssetStore();
  const { openEditAssetModal, openCheckoutModal, openReturnModal, openLogAssetServiceModal, openEditServiceRecordModal, openAddMaintenanceTaskModal, openEditCheckoutModal } = useUIStore();
  const { currentUser, role } = useAuth();
  const isAdmin = role === 'admin';

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeMaintPhase, setActiveMaintPhase] = useState<AssetMaintenancePhase>('pre_season');

  const asset = activeAsset();
  if (!asset) return null;

  const checkout = currentCheckoutForAsset(asset.id);
  const isOverdue = checkout && isPast(new Date(checkout.expectedReturnAt));

  function handleDelete() {
    if (confirmDelete) {
      deleteAsset(asset!.id);
      setActiveAsset(null);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  }

  return (
    <div className="bg-white border border-border rounded-card overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-panel-title font-semibold text-forest">{asset.name}</h2>
            <span className="text-label px-2 py-0.5 rounded-tag bg-cream-dark text-forest/50 uppercase tracking-wide">
              {SUBTYPE_LABELS[asset.subtype] ?? asset.subtype}
            </span>
          </div>
          <p className="text-meta text-forest/50 mt-0.5">
            {ASSET_CATEGORY_LABELS[asset.category]} · {asset.storageLocation}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <>
              <button onClick={() => openEditAssetModal(asset.id)} className="p-1.5 text-forest/40 hover:text-forest transition-colors rounded">
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={handleDelete}
                className={`p-1.5 transition-colors rounded ${confirmDelete ? 'text-red hover:text-red/80' : 'text-forest/40 hover:text-forest'}`}
                title={confirmDelete ? 'Click again to confirm delete' : 'Delete asset'}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={() => { setActiveAsset(null); setConfirmDelete(false); }} className="p-1.5 text-forest/40 hover:text-forest transition-colors rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Detail tab strip */}
      <div className="flex border-b border-border px-5 gap-5">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDetailTab(tab.id)}
            className={`py-2.5 text-body font-medium border-b-2 transition-colors -mb-px ${activeDetailTab === tab.id ? 'border-forest text-forest' : 'border-transparent text-forest/50 hover:text-forest/70'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="px-5 py-4">
        {activeDetailTab === 'overview' && (
          <OverviewTab
            asset={asset}
            checkout={checkout}
            isOverdue={!!isOverdue}
            onCheckout={() => openCheckoutModal(asset.id)}
            onReturn={() => checkout && openReturnModal(checkout.id, asset.id)}
            onService={() => openLogAssetServiceModal(asset.id)}
          />
        )}
        {activeDetailTab === 'checkouts' && (
          <CheckoutsTab
            assetId={asset.id}
            history={checkoutHistoryForAsset(asset.id)}
            currentCheckout={checkout}
            onReturn={() => checkout && openReturnModal(checkout.id, asset.id)}
            onEdit={(checkoutId) => openEditCheckoutModal(checkoutId, asset.id)}
            onDelete={(checkoutId) => deleteCheckout(checkoutId, asset.id)}
            updateCheckout={updateCheckout}
          />
        )}
        {activeDetailTab === 'service' && (
          <ServiceTab
            records={serviceHistoryForAsset(asset.id)}
            onLogService={() => openLogAssetServiceModal(asset.id)}
            onEdit={(recordId) => openEditServiceRecordModal(recordId, asset.id)}
            onDelete={deleteServiceRecord}
          />
        )}
        {activeDetailTab === 'maintenance' && (
          <MaintenanceTab
            assetId={asset.id}
            activeMaintPhase={activeMaintPhase}
            setActiveMaintPhase={setActiveMaintPhase}
            tasks={maintenanceTasksForAsset(asset.id, activeMaintPhase)}
            progressForPhase={(phase) => maintenanceProgressForAsset(asset.id, phase)}
            onToggle={(id, done) => toggleMaintenanceTask(id, asset.id, done, currentUser.name)}
            onAdd={() => openAddMaintenanceTaskModal(asset.id)}
            onDelete={deleteMaintenanceTask}
          />
        )}
      </div>
    </div>
  );
}

// ─── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({ asset, checkout, isOverdue, onCheckout, onReturn, onService }: {
  asset: CampAsset;
  checkout: AssetCheckout | null;
  isOverdue: boolean;
  onCheckout: () => void;
  onReturn: () => void;
  onService: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusBadge status={checkout ? 'checked_out' : asset.status} />
        {!checkout && (
          <button onClick={onCheckout} className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-border hover:border-sage hover:bg-sage/5 text-forest/60 hover:text-forest transition-colors">
            <LogIn className="w-3.5 h-3.5" /> Check out
          </button>
        )}
        {checkout && (
          <button onClick={onReturn} className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-border hover:border-sage hover:bg-sage/5 text-forest/60 hover:text-forest transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Return
          </button>
        )}
        <button onClick={onService} className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-border hover:border-sage hover:bg-sage/5 text-forest/60 hover:text-forest transition-colors">
          <Wrench className="w-3.5 h-3.5" /> Log service
        </button>
      </div>

      {/* Active checkout */}
      {checkout && (
        <div className={`rounded-card border px-4 py-3 ${isOverdue ? 'bg-red/5 border-red/20' : 'bg-blue-50 border-blue-200'}`}>
          <p className={`text-body font-semibold ${isOverdue ? 'text-red' : 'text-blue-700'}`}>
            {isOverdue ? '⚠ Overdue checkout' : 'Currently checked out'}
          </p>
          <p className="text-meta text-forest/60 mt-1">
            {checkout.checkedOutBy} · {checkout.purpose}
          </p>
          <p className={`text-meta mt-0.5 ${isOverdue ? 'text-red font-medium' : 'text-forest/50'}`}>
            {isOverdue ? 'Was due ' : 'Return by '}
            {new Date(checkout.expectedReturnAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
      )}

      {/* Asset details grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-body">
        {asset.make && <Field label="Make / Model" value={`${asset.make}${asset.model ? ` ${asset.model}` : ''}${asset.year ? ` (${asset.year})` : ''}`} />}
        {asset.serialNumber && <Field label="Serial #" value={asset.serialNumber} />}
        {asset.licensePlate && <Field label="Plate" value={asset.licensePlate} />}
        {asset.registrationExpiry && <Field label="Registration expires" value={new Date(asset.registrationExpiry + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />}
        {asset.tracksOdometer && asset.currentOdometer !== null && <Field label="Odometer" value={`${asset.currentOdometer.toLocaleString()} mi`} />}
        {asset.tracksHours && asset.currentHours !== null && <Field label="Engine hours" value={`${asset.currentHours.toFixed(0)} hrs`} />}
        {asset.hullId && <Field label="Hull ID" value={asset.hullId} />}
        {asset.uscgRegistration && <Field label="USCG Reg" value={asset.uscgRegistration} />}
        {asset.capacity !== null && <Field label="Capacity" value={`${asset.capacity} persons`} />}
        {asset.lifejacketCount !== null && <Field label="Life jackets" value={String(asset.lifejacketCount)} />}
      </div>

      {asset.notes && (
        <div>
          <p className="text-meta font-medium text-forest/50 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-body text-forest/70">{asset.notes}</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    available: 'bg-green-muted-bg text-green-muted-text',
    checked_out: 'bg-blue-50 text-blue-700',
    in_service: 'bg-amber-bg text-amber-text',
    retired: 'bg-cream-dark text-forest/40',
  };
  return (
    <span className={`text-label font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide ${styles[status] ?? 'bg-cream-dark text-forest/40'}`}>
      {ASSET_STATUS_LABELS[status as keyof typeof ASSET_STATUS_LABELS] ?? status}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-meta text-forest/50">{label}</p>
      <p className="text-body font-medium text-forest">{value}</p>
    </div>
  );
}

// ─── Checkouts tab ───────────────────────────────────────────────────────────

function CheckoutsTab({ assetId, history, currentCheckout, onReturn, onEdit, onDelete, updateCheckout: _updateCheckout }: {
  assetId: string;
  history: AssetCheckout[];
  currentCheckout: AssetCheckout | null;
  onReturn: () => void;
  onEdit: (checkoutId: string) => void;
  onDelete: (checkoutId: string) => void;
  updateCheckout: (c: AssetCheckout) => void;
}) {
  void assetId;
  void _updateCheckout;

  return (
    <div className="space-y-3">
      {currentCheckout && (
        <div className="bg-blue-50 border border-blue-200 rounded-card px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-body font-semibold text-blue-700">Active checkout</p>
              <p className="text-meta text-blue-600 mt-0.5">{currentCheckout.checkedOutBy} · {currentCheckout.purpose}</p>
              <p className="text-meta text-blue-500 mt-0.5">
                Out {new Date(currentCheckout.checkedOutAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {' · Due '}
                {new Date(currentCheckout.expectedReturnAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={onReturn} className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-blue-300 hover:bg-blue-100 text-blue-600 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Return
              </button>
              <button onClick={() => onEdit(currentCheckout.id)} className="p-1.5 text-blue-400 hover:text-blue-700 transition-colors rounded" title="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(currentCheckout.id)} className="p-1.5 text-blue-300 hover:text-red transition-colors rounded" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {history.length === 0 && !currentCheckout && (
        <p className="text-body text-forest/40 text-center py-8">No checkout history.</p>
      )}

      {history.map((c) => (
        <div key={c.id} className="border border-border rounded-card px-4 py-3 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-body font-medium text-forest">{c.checkedOutBy} · {c.purpose}</p>
              <p className="text-meta text-forest/50 mt-0.5">
                {new Date(c.checkedOutAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {c.returnedAt && ` → ${new Date(c.returnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </p>
              {c.returnCondition && c.returnCondition !== 'no_issues' && (
                <p className="text-meta text-amber-text mt-0.5">
                  {CHECKOUT_CONDITION_LABELS[c.returnCondition as CheckoutCondition]}
                  {c.returnNotes ? `: ${c.returnNotes}` : ''}
                </p>
              )}
              {c.fuelLevelOut && (
                <p className="text-meta text-forest/40 mt-0.5">
                  {FUEL_LEVEL_LABELS[c.fuelLevelOut as FuelLevel]}
                  {c.fuelLevelIn ? ` → ${FUEL_LEVEL_LABELS[c.fuelLevelIn as FuelLevel]}` : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onEdit(c.id)} className="p-1 text-forest/30 hover:text-forest transition-colors rounded" title="Edit">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(c.id)} className="p-1 text-forest/30 hover:text-red transition-colors rounded" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Service tab ─────────────────────────────────────────────────────────────

function ServiceTab({ records, onLogService, onEdit, onDelete }: {
  records: AssetServiceRecord[];
  onLogService: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={onLogService} className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-border hover:border-sage hover:bg-sage/5 text-forest/60 hover:text-forest transition-colors">
          <Wrench className="w-3.5 h-3.5" /> Log service
        </button>
      </div>

      {records.length === 0 && (
        <p className="text-body text-forest/40 text-center py-8">No service records.</p>
      )}

      {records.map((r) => (
        <div key={r.id} className="border border-border rounded-card px-4 py-3 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-body font-semibold text-forest">{SERVICE_TYPE_LABELS[r.serviceType] ?? r.serviceType}</span>
                {r.isInspection && <span className="text-label px-2 py-0.5 rounded-tag bg-sage/10 text-sage uppercase tracking-wide">Inspection</span>}
              </div>
              <p className="text-meta text-forest/50 mt-0.5">
                {new Date(r.datePerformed + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {' · '}{r.performedBy}
                {r.vendor && ` (${r.vendor})`}
                {r.cost !== null && ` · $${r.cost.toFixed(2)}`}
              </p>
              {r.odometerAtService !== null && <p className="text-meta text-forest/40">{r.odometerAtService.toLocaleString()} mi</p>}
              {r.hoursAtService !== null && <p className="text-meta text-forest/40">{r.hoursAtService.toFixed(0)} hrs</p>}
              {r.description && <p className="text-meta text-forest/60 mt-1 italic">{r.description}</p>}
              {r.nextServiceDate && (
                <p className="text-meta text-forest/50 mt-1">
                  Next service: {new Date(r.nextServiceDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {r.nextServiceOdometer !== null && ` or ${r.nextServiceOdometer.toLocaleString()} mi`}
                  {r.nextServiceHours !== null && ` or ${r.nextServiceHours.toFixed(0)} hrs`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onEdit(r.id)} className="p-1 text-forest/30 hover:text-forest transition-colors rounded" title="Edit">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(r.id)} className="p-1 text-forest/30 hover:text-red transition-colors rounded" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Maintenance tab ─────────────────────────────────────────────────────────

function MaintenanceTab({ assetId, activeMaintPhase, setActiveMaintPhase, tasks, progressForPhase, onToggle, onAdd, onDelete }: {
  assetId: string;
  activeMaintPhase: AssetMaintenancePhase;
  setActiveMaintPhase: (p: AssetMaintenancePhase) => void;
  tasks: AssetMaintenanceTask[];
  progressForPhase: (phase: AssetMaintenancePhase) => { total: number; done: number };
  onToggle: (id: string, done: boolean) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  void assetId; // used by parent to fetch tasks

  return (
    <div className="space-y-3">
      {/* Phase tabs */}
      <div className="flex gap-2">
        {PHASES.map(({ value, label }) => {
          const progress = progressForPhase(value);
          return (
            <button
              key={value}
              onClick={() => setActiveMaintPhase(value)}
              className={`flex-1 py-2 text-body font-medium rounded-btn border transition-colors ${activeMaintPhase === value ? 'bg-forest border-forest text-cream' : 'border-border text-forest/60 hover:border-forest/40'}`}
            >
              {label}
              {progress.total > 0 && (
                <span className={`block text-label mt-0.5 ${activeMaintPhase === value ? 'text-cream/70' : 'text-forest/40'}`}>
                  {progress.done}/{progress.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-border hover:border-sage hover:bg-sage/5 text-forest/60 hover:text-forest transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add task
        </button>
      </div>

      {tasks.length === 0 && (
        <p className="text-body text-forest/40 text-center py-6">No tasks for this phase.</p>
      )}

      <div className="space-y-2">
        {tasks.sort((a, b) => a.sortOrder - b.sortOrder).map((task) => (
          <div key={task.id} className="flex items-start gap-3 bg-white border border-border rounded-card px-4 py-3">
            <button onClick={() => onToggle(task.id, !task.isComplete)} className="mt-0.5 flex-shrink-0 text-forest/50 hover:text-forest transition-colors">
              {task.isComplete ? <CheckSquare className="w-5 h-5 text-sage" /> : <Square className="w-5 h-5" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-body ${task.isComplete ? 'line-through text-forest/40' : 'text-forest'}`}>{task.title}</p>
              {task.detail && <p className="text-meta text-forest/50 mt-0.5">{task.detail}</p>}
              {task.isComplete && task.completedBy && (
                <p className="text-meta text-forest/40 mt-0.5">Done by {task.completedBy}{task.completedDate ? ` · ${new Date(task.completedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onDelete(task.id)} className="p-1 text-forest/30 hover:text-red transition-colors rounded">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
