import { Wrench } from 'lucide-react';
import { useAssetStore, SERVICE_TYPE_LABELS, SUBTYPE_LABELS } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';

export function MaintenanceDueTab() {
  const { maintenanceOverdue, maintenanceDueSoon, setActiveAsset } = useAssetStore();
  const { openLogAssetServiceModal } = useUIStore();

  const overdue = maintenanceOverdue();
  const soon = maintenanceDueSoon(14);

  if (overdue.length === 0 && soon.length === 0) {
    return (
      <div className="text-center py-16">
        <Wrench className="w-10 h-10 text-forest/20 mx-auto mb-3" />
        <p className="text-body text-forest/40">No service due in the next 14 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {overdue.length > 0 && (
        <Section title="Overdue" count={overdue.length} urgent>
          {overdue.map(({ asset, record }) => (
            <ServiceRow
              key={`${asset.id}-${record.id}`}
              assetName={asset.name}
              subtype={asset.subtype}
              serviceType={record.serviceType}
              date={record.nextServiceDate!}
              isOverdue
              onViewAsset={() => setActiveAsset(asset.id)}
              onLogService={() => openLogAssetServiceModal(asset.id)}
            />
          ))}
        </Section>
      )}

      {soon.length > 0 && (
        <Section title="Due within 14 days" count={soon.length}>
          {soon.map(({ asset, record }) => (
            <ServiceRow
              key={`${asset.id}-${record.id}`}
              assetName={asset.name}
              subtype={asset.subtype}
              serviceType={record.serviceType}
              date={record.nextServiceDate!}
              isOverdue={false}
              onViewAsset={() => setActiveAsset(asset.id)}
              onLogService={() => openLogAssetServiceModal(asset.id)}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, urgent = false, children }: { title: string; count: number; urgent?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className={`text-body font-semibold ${urgent ? 'text-red' : 'text-forest'}`}>{title}</h3>
        <span className={`text-label px-2 py-0.5 rounded-full font-medium ${urgent ? 'bg-red/10 text-red' : 'bg-amber-bg text-amber-text'}`}>{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ServiceRow({
  assetName, subtype, serviceType, date, isOverdue, onViewAsset, onLogService,
}: {
  assetName: string;
  subtype: string;
  serviceType: string;
  date: string;
  isOverdue: boolean;
  onViewAsset: () => void;
  onLogService: () => void;
}) {
  return (
    <div className={`bg-white border rounded-card px-4 py-3 border-l-[3px] flex items-center justify-between gap-3 ${isOverdue ? 'border-red/20 border-l-red' : 'border-border border-l-amber'}`}>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onViewAsset}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-body font-semibold text-forest">{assetName}</span>
          <span className="text-label px-2 py-0.5 rounded-tag bg-cream-dark text-forest/50 uppercase tracking-wide">
            {SUBTYPE_LABELS[subtype] ?? subtype}
          </span>
        </div>
        <p className="text-meta text-forest/50 mt-0.5">
          {SERVICE_TYPE_LABELS[serviceType] ?? serviceType}
          {' · '}
          <span className={isOverdue ? 'text-red font-medium' : 'text-amber-text'}>
            {isOverdue ? 'Was due ' : 'Due '}
            {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </p>
      </div>
      <button
        onClick={onLogService}
        className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium rounded-btn border border-border hover:border-sage hover:bg-sage/5 text-forest/60 hover:text-forest transition-colors flex-shrink-0"
      >
        <Wrench className="w-3.5 h-3.5" /> Log service
      </button>
    </div>
  );
}
