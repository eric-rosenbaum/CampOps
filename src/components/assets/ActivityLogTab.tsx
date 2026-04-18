import { LogIn, RotateCcw, Wrench, Pencil, Trash2 } from 'lucide-react';
import { useAssetStore, SERVICE_TYPE_LABELS, CHECKOUT_CONDITION_LABELS } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';

type FeedItem =
  | { type: 'checkout'; date: string; assetName: string; assetId: string; checkoutId: string; by: string; purpose: string }
  | { type: 'return'; date: string; assetName: string; assetId: string; checkoutId: string; by: string; condition: string; notes: string | null }
  | { type: 'service'; date: string; assetName: string; assetId: string; recordId: string; serviceType: string; performedBy: string; cost: number | null };

export function ActivityLogTab() {
  const { assets, checkouts, serviceRecords, setActiveAsset, deleteCheckout, deleteServiceRecord } = useAssetStore();
  const { openEditCheckoutModal, openEditServiceRecordModal } = useUIStore();

  const feed: FeedItem[] = [];

  for (const c of checkouts) {
    const asset = assets.find((a) => a.id === c.assetId);
    if (!asset) continue;
    feed.push({ type: 'checkout', date: c.checkedOutAt, assetName: asset.name, assetId: asset.id, checkoutId: c.id, by: c.checkedOutBy, purpose: c.purpose });
    if (c.returnedAt) {
      feed.push({ type: 'return', date: c.returnedAt, assetName: asset.name, assetId: asset.id, checkoutId: c.id, by: c.checkedOutBy, condition: c.returnCondition ?? 'no_issues', notes: c.returnNotes });
    }
  }

  for (const r of serviceRecords) {
    const asset = assets.find((a) => a.id === r.assetId);
    if (!asset) continue;
    feed.push({ type: 'service', date: r.createdAt, assetName: asset.name, assetId: asset.id, recordId: r.id, serviceType: r.serviceType, performedBy: r.performedBy, cost: r.cost });
  }

  feed.sort((a, b) => b.date.localeCompare(a.date));

  if (feed.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-body text-forest/40">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {feed.map((item, i) => {
        if (item.type === 'checkout') {
          return (
            <ActivityRow
              key={i}
              icon={<LogIn className="w-3.5 h-3.5 text-blue-600" />}
              iconBg="bg-blue-50"
              date={item.date}
              onClickAsset={() => setActiveAsset(item.assetId)}
              assetName={item.assetName}
              body={<>checked out by <span className="font-medium">{item.by}</span></>}
              sub={item.purpose}
              onEdit={() => openEditCheckoutModal(item.checkoutId, item.assetId)}
              onDelete={() => deleteCheckout(item.checkoutId, item.assetId)}
            />
          );
        }

        if (item.type === 'return') {
          const conditionLabel = CHECKOUT_CONDITION_LABELS[item.condition as keyof typeof CHECKOUT_CONDITION_LABELS] ?? item.condition;
          const hasIssue = item.condition !== 'no_issues';
          return (
            <ActivityRow
              key={i}
              icon={<RotateCcw className="w-3.5 h-3.5 text-sage" />}
              iconBg="bg-green-muted-bg"
              date={item.date}
              onClickAsset={() => setActiveAsset(item.assetId)}
              assetName={item.assetName}
              body={<>returned by <span className="font-medium">{item.by}</span> — <span className={hasIssue ? 'text-amber-text font-medium' : 'text-forest/50'}>{conditionLabel}</span></>}
              sub={item.notes ?? undefined}
              onEdit={() => openEditCheckoutModal(item.checkoutId, item.assetId)}
              onDelete={() => deleteCheckout(item.checkoutId, item.assetId)}
            />
          );
        }

        // service
        return (
          <ActivityRow
            key={i}
            icon={<Wrench className="w-3.5 h-3.5 text-forest/50" />}
            iconBg="bg-cream-dark"
            date={item.date}
            onClickAsset={() => setActiveAsset(item.assetId)}
            assetName={item.assetName}
            body={<>{SERVICE_TYPE_LABELS[item.serviceType] ?? item.serviceType} by <span className="font-medium">{item.performedBy}</span>{item.cost !== null && <span className="text-forest/50"> · ${item.cost.toFixed(2)}</span>}</>}
            onEdit={() => openEditServiceRecordModal(item.recordId, item.assetId)}
            onDelete={() => deleteServiceRecord(item.recordId)}
          />
        );
      })}
    </div>
  );
}

function ActivityRow({ icon, iconBg, date, onClickAsset, assetName, body, sub, onEdit, onDelete }: {
  icon: React.ReactNode;
  iconBg: string;
  date: string;
  onClickAsset: () => void;
  assetName: string;
  body: React.ReactNode;
  sub?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const dateStr = new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className="flex items-start gap-3 bg-white border border-border rounded-card px-4 py-3">
      <div className={`w-7 h-7 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body text-forest">
          <button className="font-semibold hover:underline" onClick={onClickAsset}>{assetName}</button>
          {' '}{body}
        </p>
        {sub && <p className="text-meta text-forest/50 mt-0.5 italic">{sub}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-meta text-forest/40">{dateStr}</span>
        <button onClick={onEdit} className="p-1 text-forest/30 hover:text-forest transition-colors rounded ml-1" title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1 text-forest/30 hover:text-red transition-colors rounded" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
