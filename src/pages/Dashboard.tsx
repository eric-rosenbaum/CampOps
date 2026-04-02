import { Link } from 'react-router-dom';
import { Topbar } from '@/components/layout/Topbar';
import { StatCard } from '@/components/shared/StatCard';
import { IssueCard } from '@/components/shared/IssueCard';
import { TaskCard } from '@/components/shared/TaskCard';
import { useIssuesStore } from '@/store/issuesStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useUIStore } from '@/store/uiStore';
import { formatCost } from '@/lib/utils';
import { format } from 'date-fns';
import { ArrowRight } from 'lucide-react';

export function Dashboard() {
  const { issues, urgentCount, openCount, resolvedCount, totalCosts, selectIssue } = useIssuesStore();
  const { tasks, completionPercent, season } = useChecklistStore();
  const { currentUserId: _cu } = useUIStore();

  // Open issues sorted by priority, max 5
  const openIssues = issues
    .filter((i) => i.status !== 'resolved')
    .sort((a, b) => {
      const po = { urgent: 0, high: 1, normal: 2 };
      return po[a.priority] - po[b.priority];
    })
    .slice(0, 5);

  // Incomplete pre-camp tasks sorted by due date, max 4
  const preTasks = tasks
    .filter((t) => t.phase === 'pre' && t.status !== 'complete')
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return 0;
    })
    .slice(0, 4);

  const preCompletePct = completionPercent('pre');
  const preTotal = tasks.filter((t) => t.phase === 'pre').length;
  const preComplete = tasks.filter((t) => t.phase === 'pre' && t.status === 'complete').length;

  const postCompletePct = completionPercent('post');

  const subtitle = season
    ? `${season.name} · ${format(new Date(), 'EEEE, MMMM d, yyyy')}`
    : format(new Date(), 'EEEE, MMMM d, yyyy');

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar title="Dashboard" subtitle={subtitle} />

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <StatCard label="Urgent issues" value={urgentCount()} hint="Needs action today" variant="red" />
          <StatCard label="Open issues" value={openCount()} hint="Assigned or pending" />
          <StatCard label="Resolved issues" value={resolvedCount()} hint="This session" />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard label="Pre-camp progress" value={`${preCompletePct}%`} hint={`${preComplete} of ${preTotal} tasks`} />
          <StatCard label="Post-camp progress" value={`${postCompletePct}%`} hint="Tasks complete" />
          <StatCard label="Repair costs" value={formatCost(totalCosts())} hint="This session so far" variant="amber" />
        </div>

        {/* Two-column layout */}
        <div className="flex gap-6">
          {/* Left: Open issues (60%) */}
          <div className="flex-[3] min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-forest">Open issues</h2>
              <Link
                to="/issues"
                className="text-[12px] text-sage font-medium hover:text-sage-light flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {openIssues.length === 0 ? (
              <div className="bg-white rounded-card border border-border p-6 text-center">
                <p className="text-[32px] mb-2">🌲</p>
                <p className="text-[13px] text-forest/50">No open issues right now</p>
              </div>
            ) : (
              <div className="space-y-2">
                {openIssues.map((issue) => (
                  <Link key={issue.id} to="/issues" onClick={() => selectIssue(issue.id)}>
                    <IssueCard
                      issue={issue}
                      selected={false}
                      onClick={() => selectIssue(issue.id)}
                      compact
                    />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Right: Pre-camp tasks (40%) */}
          <div className="flex-[2] min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-forest">Pre-camp tasks</h2>
              <Link
                to="/pre-post"
                className="text-[12px] text-sage font-medium hover:text-sage-light flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Mini progress bar */}
            <div className="bg-white rounded-card border border-border p-4 mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[12px] font-semibold text-forest">Readiness</p>
                <span className="text-[12px] font-semibold text-forest">{preCompletePct}%</span>
              </div>
              <div className="w-full h-1.5 bg-cream-dark rounded-full overflow-hidden">
                <div className="h-full bg-sage rounded-full" style={{ width: `${preCompletePct}%` }} />
              </div>
              <p className="text-[10px] text-forest/45 mt-1">{preComplete} of {preTotal} complete</p>
            </div>

            {preTasks.length === 0 ? (
              <div className="bg-white rounded-card border border-border p-4 text-center">
                <p className="text-[13px] text-forest/50">All pre-camp tasks complete!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {preTasks.map((task) => (
                  <Link key={task.id} to="/pre-post">
                    <TaskCard task={task} selected={false} onClick={() => {}} compact />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
