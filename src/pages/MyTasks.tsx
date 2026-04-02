import { Topbar } from '@/components/layout/Topbar';
import { IssueCard } from '@/components/shared/IssueCard';
import { TaskCard } from '@/components/shared/TaskCard';
import { useIssuesStore } from '@/store/issuesStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useUIStore } from '@/store/uiStore';
import { SEED_USERS } from '@/lib/seedData';
import { Link } from 'react-router-dom';

export function MyTasks() {
  const { issues, selectIssue } = useIssuesStore();
  const { tasks } = useChecklistStore();
  const { currentUserId } = useUIStore();

  const currentUser = SEED_USERS.find((u) => u.id === currentUserId) ?? SEED_USERS[0];

  const myIssues = issues.filter(
    (i) => i.assigneeId === currentUserId && i.status !== 'resolved',
  );

  const myTasks = tasks.filter(
    (t) => t.assigneeId === currentUserId && t.status !== 'complete',
  );

  const totalCount = myIssues.length + myTasks.length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title="My tasks"
        subtitle={`${currentUser.name} · ${totalCount} task${totalCount !== 1 ? 's' : ''} assigned`}
      />

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {/* My open issues */}
        <div className="mb-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-forest/50 mb-3">
            My open issues
          </h2>
          {myIssues.length === 0 ? (
            <div className="bg-white rounded-card border border-border p-6 text-center">
              <p className="text-[13px] text-forest/50">No issues assigned to you</p>
            </div>
          ) : (
            <div className="space-y-2 max-w-2xl">
              {myIssues.map((issue) => (
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

        {/* My checklist tasks */}
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-forest/50 mb-3">
            My checklist tasks
          </h2>
          {myTasks.length === 0 ? (
            <div className="bg-white rounded-card border border-border p-6 text-center">
              <p className="text-[13px] text-forest/50">No checklist tasks assigned to you</p>
            </div>
          ) : (
            <div className="space-y-2 max-w-2xl">
              {myTasks.map((task) => (
                <Link key={task.id} to="/pre-post">
                  <TaskCard task={task} selected={false} onClick={() => {}} compact />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
