import { isPast } from 'date-fns';
import { Wrench, LogIn, RotateCcw } from 'lucide-react';
import { useAssetStore, ASSET_STATUS_LABELS, SUBTYPE_LABELS } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';
import type { CampAsset } from '@/lib/types';

function statusStyle(status: CampAsset['status']) {
  if (status === 'available') return { bg: 'bg-green-muted-bg', text: 'text-green-muted-text', border: 'border-l-sage' };
  if (status === 'checked_out') return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-l-blue-400' };
  if (status === 'in_service') return { bg: 'bg-amber-bg', text: 'text-amber-text', border: 'border-l-amber' };
  return { bg: 'bg-cream-dark', text: 'text-forest/40', border: 'border-l-border' };
}

function nextServiceStatus(date: string | null): 'ok' | 'warn' | 'alert' | null {
  if (!date) return null;
  const d = new Date(date);
  const today = new Date();
  if (d < today) return 'alert';
  const soon = new Date();
  soon.setDate(soon.getDate() + 14);
  if (d < soon) return 'warn';
  return 'ok';
}

function serviceStatusColor(s: 'ok' | 'warn' | 'alert') {
  if (s === 'alert') return 'text-red';
  if (s === 'warn') return 'text-amber-text';
  return 'text-forest/40';
}

export function AssetCard({ asset, onClick }: { asset: CampAsset; onClick: () => void }) {
  const { currentCheckoutForAsset, serviceHistoryForAsset } = useAssetStore();
  const { openCheckoutModal, openReturnModal, openLogAssetServiceModal } = useUIStore();

  const style = statusStyle(asset.status);
  const checkout = currentCheckoutForAsset(asset.id);
  const serviceHistory = serviceHistoryForAsset(asset.id);
  const nextServiceDate = serviceHistory.find((r) => r.nextServiceDate)?.nextServiceDate ?? null;
  const svcStatus = nextServiceStatus(nextServiceDate);
  const isOverdue = checkout && isPast(new Date(checkout.expectedReturnAt));

  return (
    <div className={`bg-white border border-border border-l-[3px] ${style.border} rounded-card px-4 py-4 cursor-pointer hover:bg-cream-dark/20 transition-colors`} onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-card-title font-semibold text-forest">{asset.name}</span>
            <span className="text-label font-medium px-2 py-0.5 rounded-tag bg-cream-dark text-forest/50 uppercase tracking-wide">
              {SUBTYPE_LABELS[asset.subtype] ?? asset.subtype}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className={`text-label font-semibold px-2 py-0.5 rounded-tag uppercase tracking-wide ${style.bg} ${style.text}`}>
              {ASSET_STATUS_LABELS[asset.status]}
            </span>

            {checkout && (
              <span className={`text-meta ${isOverdue ? 'text-red font-semibold' : 'text-forest/50'}`}>
                {isOverdue ? '⚠ ' : ''}
                {checkout.checkedOutBy} · {isOverdue ? 'overdue since' : 'return by'} {new Date(checkout.expectedReturnAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}

            {!checkout && svcStatus && svcStatus !== 'ok' && (
              <span className={`text-meta ${serviceStatusColor(svcStatus)}`}>
                Service {svcStatus === 'alert' ? 'overdue' : 'due'} {nextServiceDate ? new Date(nextServiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-meta text-forest/40 flex-wrap">
            <span>{asset.storageLocation}</span>
            {asset.tracksOdometer && asset.currentOdometer !== null && (
              <span>{asset.currentOdometer.toLocaleString()} mi</span>
            )}
            {asset.tracksHours && asset.currentHours !== null && (
              <span>{asset.currentHours.toFixed(0)} hrs</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {asset.status === 'available' && (
            <button
              onClick={() => openCheckoutModal(asset.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-border hover:border-sage hover:bg-sage/5 text-forest/60 hover:text-forest transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" /> Check out
            </button>
          )}
          {asset.status === 'checked_out' && checkout && (
            <button
              onClick={() => openReturnModal(checkout.id, asset.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-border hover:border-sage hover:bg-sage/5 text-forest/60 hover:text-forest transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Return
            </button>
          )}
          <button
            onClick={() => openLogAssetServiceModal(asset.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-border hover:border-sage hover:bg-sage/5 text-forest/60 hover:text-forest transition-colors"
          >
            <Wrench className="w-3.5 h-3.5" /> Service
          </button>
        </div>
      </div>
    </div>
  );
}
