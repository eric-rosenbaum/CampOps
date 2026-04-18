import { AlertTriangle, RotateCcw, Pencil, Trash2 } from 'lucide-react';
import { isPast } from 'date-fns';
import { useAssetStore, SUBTYPE_LABELS } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';

export function CheckedOutTab() {
  const { currentlyCheckedOut, deleteCheckout, setActiveAsset } = useAssetStore();
  const { openReturnModal, openEditCheckoutModal } = useUIStore();

  const checkedOut = currentlyCheckedOut();

  if (checkedOut.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-body text-forest/40">No assets are currently checked out.</p>
      </div>
    );
  }

  const overdue = checkedOut.filter(({ checkout }) => isPast(new Date(checkout.expectedReturnAt)));
  const onTime = checkedOut.filter(({ checkout }) => !isPast(new Date(checkout.expectedReturnAt)));
  const sorted = [...overdue, ...onTime];

  return (
    <div className="space-y-3">
      {sorted.map(({ asset, checkout }) => {
        const isOverdue = isPast(new Date(checkout.expectedReturnAt));
        return (
          <div
            key={checkout.id}
            className={`bg-white border rounded-card px-4 py-4 border-l-[3px] ${isOverdue ? 'border-red/30 border-l-red' : 'border-border border-l-blue-400'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setActiveAsset(asset.id)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-card-title font-semibold text-forest">{asset.name}</span>
                  <span className="text-label font-medium px-2 py-0.5 rounded-tag bg-cream-dark text-forest/50 uppercase tracking-wide">
                    {SUBTYPE_LABELS[asset.subtype] ?? asset.subtype}
                  </span>
                  {isOverdue && (
                    <span className="flex items-center gap-1 text-label font-semibold text-red">
                      <AlertTriangle className="w-3.5 h-3.5" /> Overdue
                    </span>
                  )}
                </div>

                <div className="mt-1.5 space-y-0.5">
                  <p className="text-body text-forest">
                    <span className="font-medium">{checkout.checkedOutBy}</span>
                    <span className="text-forest/50"> · {checkout.purpose}</span>
                  </p>
                  <p className={`text-meta ${isOverdue ? 'text-red font-medium' : 'text-forest/50'}`}>
                    {isOverdue ? 'Was due ' : 'Due by '}
                    {new Date(checkout.expectedReturnAt).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </p>
                  {checkout.checkoutNotes && (
                    <p className="text-meta text-forest/40 italic">{checkout.checkoutNotes}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-1.5 text-meta text-forest/40 flex-wrap">
                  <span>{asset.storageLocation}</span>
                  {asset.tracksOdometer && checkout.startOdometer !== null && (
                    <span>Start: {checkout.startOdometer.toLocaleString()} mi</span>
                  )}
                  {asset.tracksHours && checkout.startHours !== null && (
                    <span>Start: {checkout.startHours.toFixed(0)} hrs</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => openReturnModal(checkout.id, asset.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-border hover:border-sage hover:bg-sage/5 text-forest/60 hover:text-forest transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Return
                </button>
                <button
                  onClick={() => openEditCheckoutModal(checkout.id, asset.id)}
                  className="p-1.5 text-forest/40 hover:text-forest transition-colors rounded"
                  title="Edit checkout"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteCheckout(checkout.id, asset.id)}
                  className="p-1.5 text-forest/40 hover:text-red transition-colors rounded"
                  title="Delete checkout"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
