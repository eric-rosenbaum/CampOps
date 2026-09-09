// One person's open work.
//
// This used to be two lists: work orders, and Pre/Post Camp checklist tasks. Pre/Post was
// removed as a module, so what is left is the work orders -- which is what people came here
// for anyway.
import { Topbar } from '@/components/layout/Topbar';
import { IssueCard } from '@/components/shared/IssueCard';
import { useIssuesStore } from '@/store/issuesStore';
import { useAuth } from '@/lib/auth';
import { Link } from 'react-router-dom';

export function MyTasks() {
  const { issues, selectIssue } = useIssuesStore();
  const { currentUser } = useAuth();

  const myIssues = issues.filter(
    (i) => i.assigneeId === currentUser.id && i.status !== 'resolved',
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title="My work"
        subtitle={`${currentUser.name} · ${myIssues.length} open`}
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        {myIssues.length === 0 ? (
          <div className="bg-white rounded-card border border-border p-4 sm:p-6 text-center">
            <p className="text-[13px] text-ink-soft">Nothing assigned to you right now.</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl">
            {myIssues.map((issue) => (
              <Link key={issue.id} to="/campground" onClick={() => selectIssue(issue.id)}>
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
    </div>
  );
}
