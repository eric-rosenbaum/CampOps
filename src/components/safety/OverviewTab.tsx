import { useSafetyStore, safetyItemStatus, DRILL_TYPE_LABELS } from '@/store/safetyStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useUIStore } from '@/store/uiStore';
import { AlertBanner } from '@/components/shared/AlertBanner';

function ProgressBar({ label, ok, warn, alert, total }: { label: string; ok: number; warn: number; alert: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((ok / total) * 100);
  const isAmber = alert === 0 && warn > 0;
  return (
    <div className="bg-white border border-border rounded-card px-5 py-4 mb-3 flex items-center gap-6">
      <div className="flex-1">
        <p className="text-[13px] font-semibold text-forest mb-2">{label}</p>
        <div className="h-2 bg-cream-dark rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${isAmber ? 'bg-amber' : alert > 0 ? 'bg-red' : 'bg-sage'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[11px] text-forest/40 mt-1.5">
          {ok} of {total} items current
          {alert > 0 ? ` · ${alert} overdue` : ''}
          {warn > 0 ? ` · ${warn} due this week` : ''}
        </p>
      </div>
      <div className="flex gap-5 flex-shrink-0">
        {[
          { val: alert, label: 'Overdue', cls: alert > 0 ? 'text-red' : 'text-forest/30' },
          { val: warn, label: 'Due soon', cls: warn > 0 ? 'text-amber' : 'text-forest/30' },
          { val: ok, label: 'Current', cls: ok > 0 ? 'text-green-muted-text' : 'text-forest/30' },
        ].map(({ val, label, cls }) => (
          <div key={label} className="text-center">
            <p className={`text-[20px] font-semibold font-mono ${cls}`}>{val}</p>
            <p className="text-[10px] text-forest/40 uppercase tracking-wide mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewTab() {
  const { allStats, overdueItems, dueSoonItems, categoryStats, drills } = useSafetyStore();
  const { season } = useChecklistStore();
  const { openSafetyLogInspectionModal } = useUIStore();

  const { overdue, dueSoon, compliant } = allStats();
  const overdue_items = overdueItems();
  const due_soon_items = dueSoonItems();

  const fireSt = categoryStats('fire');
  const waterSt = categoryStats('water');
  const kitchenSt = categoryStats('kitchen');

  const completedDrills = drills.filter((d) => d.status === 'completed').length;
  const drillsWarn = drills.filter((d) => d.status === 'scheduled' && safetyItemStatus({ nextDue: d.scheduledDate } as never) !== 'alert').length;
  const drillStats = {
    ok: completedDrills,
    warn: drillsWarn,
    alert: 0,
    total: drills.filter((d) => d.status !== 'cancelled').length,
  };

  const acaDate = season?.acaInspectionDate;
  const acaDaysAway = acaDate
    ? Math.round((new Date(acaDate + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))
    : null;

  // Group due-soon items for the warning banner
  const dueSoonNames = due_soon_items.slice(0, 4).map((i) => i.name);

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <div className={`bg-white border border-border rounded-card px-4 py-4 ${overdue > 0 ? 'border-l-[3px] border-l-red' : ''}`}>
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Overdue items</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${overdue > 0 ? 'text-red' : 'text-green-muted-text'}`}>{overdue}</p>
          <p className="text-meta text-forest/40 mt-0.5">{overdue > 0 ? 'Require immediate action' : 'Nothing overdue'}</p>
        </div>
        <div className={`bg-white border border-border rounded-card px-4 py-4 ${dueSoon > 0 ? 'border-l-[3px] border-l-amber' : ''}`}>
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Due this week</p>
          <p className={`font-mono font-semibold text-stat mt-1 ${dueSoon > 0 ? 'text-amber' : 'text-forest'}`}>{dueSoon}</p>
          <p className="text-meta text-forest/40 mt-0.5">{dueSoon > 0 ? 'Coming up soon' : 'Nothing due soon'}</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">Compliant items</p>
          <p className="font-mono font-semibold text-stat mt-1 text-green-muted-text">{compliant}</p>
          <p className="text-meta text-forest/40 mt-0.5">Up to date</p>
        </div>
        <div className="bg-white border border-border rounded-card px-4 py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">ACA inspection</p>
          {acaDate && acaDaysAway !== null ? (
            <>
              <p className="font-semibold text-[18px] mt-2 text-forest">
                {new Date(acaDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
              <p className={`text-meta mt-0.5 ${acaDaysAway <= 14 ? 'text-amber' : 'text-forest/40'}`}>
                {acaDaysAway > 0 ? `${acaDaysAway} days away` : acaDaysAway === 0 ? 'Today' : 'Past'}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-[18px] mt-2 text-forest/30">—</p>
              <p className="text-meta text-forest/40 mt-0.5">Not set in season</p>
            </>
          )}
        </div>
      </div>

      {/* Overdue banners */}
      {overdue_items.map((item) => (
        <AlertBanner
          key={item.id}
          variant="alert"
          message={`${item.name} inspection is overdue${item.nextDue ? ` since ${new Date(item.nextDue + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}. This item requires immediate attention to maintain compliance.`}
          action={{ label: 'Log action', onClick: () => openSafetyLogInspectionModal(item.id) }}
        />
      ))}

      {/* Due-soon banner */}
      {due_soon_items.length > 0 && (
        <div className="bg-amber-bg border border-amber/30 rounded-card px-4 py-3.5 mb-5 flex items-center gap-3">
          <div className="w-5 h-5 rounded-full bg-amber flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">!</div>
          <p className="text-[13px] text-amber-text flex-1 leading-relaxed">
            {due_soon_items.length} item{due_soon_items.length === 1 ? '' : 's'} due this week:
            {' '}{dueSoonNames.join(', ')}{due_soon_items.length > 4 ? `, and ${due_soon_items.length - 4} more` : ''}.
          </p>
        </div>
      )}

      {/* Category progress */}
      <div className="flex items-center justify-between mb-3.5 mt-2">
        <h3 className="text-[14px] font-semibold text-forest">Compliance summary by category</h3>
      </div>

      <ProgressBar label="Fire safety" {...fireSt} />
      <ProgressBar label="Water safety" {...waterSt} />
      <ProgressBar label="Kitchen safety" {...kitchenSt} />
      <ProgressBar
        label="Drills & training"
        ok={drillStats.ok}
        warn={drillStats.warn}
        alert={drillStats.alert}
        total={drillStats.total}
      />

      {(fireSt.total + waterSt.total + kitchenSt.total) === 0 && (
        <p className="text-[13px] text-forest/40 text-center py-8">
          No safety items set up yet. Use the Fire Safety, Water Safety, and Kitchen tabs to add items to track.
        </p>
      )}

      {/* Next scheduled drills */}
      {drills.filter((d) => d.status === 'scheduled').length > 0 && (
        <div className="mt-6">
          <h3 className="text-[14px] font-semibold text-forest mb-3">Upcoming drills</h3>
          {drills
            .filter((d) => d.status === 'scheduled')
            .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
            .slice(0, 3)
            .map((d) => (
              <div key={d.id} className="bg-white border border-border border-l-[3px] border-l-amber rounded-card px-5 py-3.5 mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-forest">{DRILL_TYPE_LABELS[d.drillType]}</p>
                  <p className="text-[11px] text-forest/40 mt-0.5">
                    {new Date(d.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {d.lead ? ` · Lead: ${d.lead}` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-tag uppercase tracking-wide bg-amber-bg text-amber-text">
                  Scheduled
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
