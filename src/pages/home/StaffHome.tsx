import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Waves } from 'lucide-react';
import { useIssuesStore } from '@/store/issuesStore';
import { useChecklistStore } from '@/store/checklistStore';
import { usePoolStore } from '@/store/poolStore';
import { useAuth } from '@/lib/auth';
import { useCampStore } from '@/store/campStore';

export function StaffHome() {
  const { currentUser, department } = useAuth();
  const { currentCamp } = useCampStore();
  const issues = useIssuesStore((s) => s.issues);
  const tasks = useChecklistStore((s) => s.tasks);
  const pools = usePoolStore((s) => s.pools);
  const readings = usePoolStore((s) => s.chemicalReadings);

  const myIssues = useMemo(
    () => issues.filter((i) => i.assigneeId === currentUser.id && i.status !== 'resolved'),
    [issues, currentUser.id]
  );

  const myTasks = useMemo(
    () => tasks.filter((t) => t.assigneeId === currentUser.id && t.status !== 'complete'),
    [tasks, currentUser.id]
  );

  const poolStatus = useMemo(() => {
    if (!pools.length) return null;
    const latest = [...readings].sort((a, b) => b.readingTime.localeCompare(a.readingTime))[0];
    return latest?.poolStatus ?? null;
  }, [pools, readings]);

  const isWaterfront = department === 'waterfront';
  const modules = currentCamp?.modules ?? {};

  const deptLabel: Record<string, string> = {
    waterfront: 'Waterfront', maintenance: 'Maintenance', kitchen: 'Kitchen',
    administration: 'Administration', health: 'Health', program: 'Program', other: 'Staff',
  };

  const statusLabel: Record<string, { label: string; color: string }> = {
    open_all_clear:    { label: 'Open — All Clear',    color: 'text-green-700 bg-green-50 border-green-200' },
    open_monitoring:   { label: 'Open — Monitoring',   color: 'text-amber-700 bg-amber-50 border-amber-200' },
    closed_corrective: { label: 'Closed — Corrective', color: 'text-red-700 bg-red-50 border-red-200' },
    closed_retest:     { label: 'Closed — Retest Due', color: 'text-red-700 bg-red-50 border-red-200' },
  };

  return (
    <div className="p-7 max-w-3xl">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-forest">
          {department ? deptLabel[department] : 'Staff'}
        </h1>
        <p className="text-[13px] text-forest/50 mt-0.5">{currentCamp?.name}</p>
      </div>

      {/* Pool status for waterfront */}
      {isWaterfront && modules.pool && poolStatus && (
        <div className={`rounded-xl border px-5 py-4 mb-5 flex items-center justify-between ${statusLabel[poolStatus]?.color ?? ''}`}>
          <div className="flex items-center gap-2.5">
            <Waves className="w-4 h-4" />
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide opacity-70">Pool Status</p>
              <p className="text-[15px] font-bold">{statusLabel[poolStatus]?.label ?? poolStatus}</p>
            </div>
          </div>
          <Link to="/pool" className="text-[12px] font-medium opacity-70 hover:opacity-100 flex items-center gap-1">
            View <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Assigned issues */}
      <div className="bg-white rounded-xl border border-stone-200 mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-[14px] font-semibold text-forest">Assigned to me</h2>
          <Link to="/issues" className="text-[12px] text-forest/50 hover:text-forest flex items-center gap-1">
            All issues <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {myIssues.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-forest/40 text-center">No issues assigned.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {myIssues.slice(0, 6).map((issue) => (
              <div key={issue.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-forest">{issue.title}</p>
                  <p className="text-[11px] text-forest/40 mt-0.5">
                    {issue.locations.join(', ') || 'No location'}
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
        )}
      </div>

      {/* My tasks */}
      {myTasks.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
            <h2 className="text-[14px] font-semibold text-forest">My tasks</h2>
            <Link to="/pre-post" className="text-[12px] text-forest/50 hover:text-forest flex items-center gap-1">
              All tasks <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-stone-100">
            {myTasks.slice(0, 4).map((task) => (
              <div key={task.id} className="px-5 py-3">
                <p className="text-[13px] font-medium text-forest">{task.title}</p>
                <p className="text-[11px] text-forest/40 mt-0.5">
                  {task.phase === 'pre' ? 'Pre-camp' : 'Post-camp'} · {task.status.replace('_', ' ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
