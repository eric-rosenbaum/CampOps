import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useIssuesStore } from '@/store/issuesStore';
import { usePoolStore } from '@/store/poolStore';
import { useCampStore } from '@/store/campStore';

export function ViewerHome() {
  const { currentCamp } = useCampStore();
  const issues = useIssuesStore((s) => s.issues);
  const pools = usePoolStore((s) => s.pools);
  const readings = usePoolStore((s) => s.chemicalReadings);

  const openIssues = useMemo(() => issues.filter((i) => i.status !== 'resolved'), [issues]);
  const urgentIssues = useMemo(() => openIssues.filter((i) => i.priority === 'urgent'), [openIssues]);

  const poolStatus = useMemo(() => {
    if (!pools.length) return null;
    const latest = [...readings].sort((a, b) => b.readingTime.localeCompare(a.readingTime))[0];
    return latest?.poolStatus ?? null;
  }, [pools, readings]);

  const modules = currentCamp?.modules ?? {};

  return (
    <div className="p-7 max-w-4xl">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-forest">{currentCamp?.name}</h1>
        <p className="text-[13px] text-forest/50 mt-0.5">Read-only view</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className={`rounded-xl border p-5 ${urgentIssues.length > 0 ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-white'}`}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-forest/40 mb-2">Open Issues</p>
          <p className={`text-2xl font-bold ${urgentIssues.length > 0 ? 'text-red-600' : 'text-forest'}`}>
            {openIssues.length}
          </p>
          {urgentIssues.length > 0 && (
            <p className="text-[11px] text-red-600/70 mt-1">{urgentIssues.length} urgent</p>
          )}
        </div>
        {modules.pool && poolStatus && (
          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-forest/40 mb-2">Pool Status</p>
            <p className="text-2xl font-bold text-forest capitalize">
              {poolStatus.replace(/_/g, ' ').replace('open ', '').replace('closed ', 'Closed')}
            </p>
          </div>
        )}
      </div>

      {openIssues.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-forest/50" />
              <h2 className="text-[14px] font-semibold text-forest">Open Issues</h2>
            </div>
            <Link to="/issues" className="text-[12px] text-forest/50 hover:text-forest flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-stone-100">
            {openIssues.slice(0, 8).map((issue) => (
              <div key={issue.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-forest">{issue.title}</p>
                  <p className="text-[11px] text-forest/40 mt-0.5">
                    {issue.locations.join(', ') || 'No location'} · {issue.status.replace('_', ' ')}
                  </p>
                </div>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  issue.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                  issue.priority === 'high'   ? 'bg-amber-100 text-amber-700' :
                  'bg-stone-100 text-stone-500'
                }`}>
                  {issue.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
