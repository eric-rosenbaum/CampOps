import { useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { StatCard } from '@/components/shared/StatCard';
import { FilterPill } from '@/components/shared/FilterPill';
import { SearchInput } from '@/components/shared/SearchInput';
import { IssueCard } from '@/components/shared/IssueCard';
import { IssueDetail } from '@/components/shared/IssueDetail';
import { LogIssueModal } from '@/components/shared/LogIssueModal';
import { Button } from '@/components/shared/Button';
import { useIssuesStore } from '@/store/issuesStore';
import { useUIStore } from '@/store/uiStore';
import { useChecklistStore } from '@/store/checklistStore';
import { formatCost } from '@/lib/utils';
import { format } from 'date-fns';
import { Download, Plus } from 'lucide-react';

type FilterType = 'all' | 'urgent' | 'unassigned' | 'in_progress' | 'resolved';

const filterLabels: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
];

export function IssuesRepairs() {
  const {
    filter, setFilter, searchQuery, setSearch,
    selectedIssueId, selectIssue, filteredIssues,
    urgentCount, openCount, resolvedCount, totalCosts,
    issues,
  } = useIssuesStore();
  const { openLogIssueModal, isLogIssueModalOpen } = useUIStore();
  const { season } = useChecklistStore();

  const filtered = filteredIssues();
  const selectedIssue = issues.find((i) => i.id === selectedIssueId);

  // Auto-select first on filter change
  useEffect(() => {
    if (!selectedIssueId || !filtered.find((i) => i.id === selectedIssueId)) {
      if (filtered.length > 0) selectIssue(filtered[0].id);
    }
  }, [filter, searchQuery]);

  const subtitle = season
    ? `${season.name} · ${format(new Date(season.openingDate), 'MMM d')} – ${format(new Date(season.closingDate), 'MMM d')} · ${openCount()} open issue${openCount() !== 1 ? 's' : ''}`
    : `${openCount()} open issues`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title="Issues & repairs"
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Download className="w-3.5 h-3.5" />
              Export report
            </Button>
            <Button size="sm" onClick={openLogIssueModal}>
              <Plus className="w-3.5 h-3.5" />
              Log issue
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0">
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-7 py-6">
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard label="Urgent" value={urgentCount()} hint="Needs action today" variant="red" />
              <StatCard label="Open" value={openCount()} hint="Assigned or pending" />
              <StatCard label="Resolved" value={resolvedCount()} hint="This session" />
              <StatCard label="Repair costs" value={formatCost(totalCosts())} hint="This session so far" variant="amber" />
            </div>

            {/* Filter bar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {filterLabels.map(({ key, label }) => (
                  <FilterPill
                    key={key}
                    label={label}
                    active={filter === key}
                    onClick={() => setFilter(key)}
                  />
                ))}
              </div>
              <SearchInput
                value={searchQuery}
                onChange={setSearch}
                placeholder="Search issues…"
              />
            </div>

            {/* Issue list */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-[32px] mb-3">🌲</p>
                <p className="text-[15px] font-semibold text-forest/60">
                  {filter === 'urgent' ? 'No urgent issues right now' :
                   filter === 'unassigned' ? 'No unassigned issues' :
                   filter === 'in_progress' ? 'Nothing in progress' :
                   filter === 'resolved' ? 'No resolved issues yet' :
                   'No issues found'}
                </p>
                <p className="text-[13px] text-forest/40 mt-1">
                  {searchQuery ? 'Try a different search term' : 'All clear for now'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    selected={issue.id === selectedIssueId}
                    onClick={() => selectIssue(issue.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="w-detail min-w-detail border-l border-border bg-white flex flex-col overflow-hidden">
          {selectedIssue ? (
            <IssueDetail issue={selectedIssue} />
          ) : (
            <div className="flex items-center justify-center h-full text-forest/30 text-[13px]">
              Select an issue to view details
            </div>
          )}
        </div>
      </div>

      {isLogIssueModalOpen && <LogIssueModal />}
    </div>
  );
}
