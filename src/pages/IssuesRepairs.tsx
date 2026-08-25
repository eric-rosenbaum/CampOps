import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { GroupHeader } from '@/components/shared/GroupHeader';
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
import { useSafetyStore } from '@/store/safetyStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { formatCost } from '@/lib/utils';
import { format } from 'date-fns';
import { Download, Plus, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Issue } from '@/lib/types';

type FilterType = 'all' | 'urgent' | 'unassigned' | 'in_progress' | 'resolved' | 'public';

const filterLabels: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'public', label: 'Public reports' },
];

const statusLabels: Record<string, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function issuesToCsv(issues: Issue[], memberName: (id: string | null) => string | null): string {
  const header = [
    'Title', 'Status', 'Priority', 'Locations', 'Assignee', 'Reported by', 'Source',
    'Estimated cost', 'Actual cost', 'Due date', 'Created', 'Last updated', 'Description',
  ];
  const rows = issues.map((i) => [
    i.title,
    statusLabels[i.status] ?? i.status,
    i.priority,
    i.locations.join('; '),
    memberName(i.assigneeId) ?? '',
    i.isPublicReport ? (i.reporterName ?? '') : (memberName(i.reportedById) ?? ''),
    i.isPublicReport ? 'Public report' : 'Staff',
    i.estimatedCostDisplay ?? '',
    i.actualCost ?? '',
    i.dueDate ? format(new Date(i.dueDate), 'yyyy-MM-dd') : '',
    format(new Date(i.createdAt), 'yyyy-MM-dd HH:mm'),
    format(new Date(i.updatedAt), 'yyyy-MM-dd HH:mm'),
    i.description,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

function downloadCsv(filename: string, text: string) {
  // Prepend a BOM so Excel reads the file as UTF-8.
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function IssuesRepairs() {
  const {
    filter, setFilter, searchQuery, setSearch,
    selectedIssueId, selectIssue, filteredIssues,
    urgentCount, openCount, resolvedCount, totalCosts,
    issues, updateIssue, addActivityEntry,
  } = useIssuesStore();
  const { openLogIssueModal, isLogIssueModalOpen } = useUIStore();
  const { season } = useChecklistStore();
  const { failedLastInspectionItems } = useSafetyStore();
  const members = useCampStore((s) => s.members);
  const { can, role, currentUser, issuesSeeUnassigned } = useAuth();

  const failedDevices = failedLastInspectionItems();

  const storeFiltered = filteredIssues();

  // Staff see only their own issues + (if permitted) unassigned ones.
  const filtered = useMemo(() => {
    if (role !== 'staff') return storeFiltered;
    return storeFiltered.filter(
      (i) =>
        i.assigneeId === currentUser.id ||
        // You always keep sight of what you reported, even when the group can't see
        // unassigned work, otherwise logging an issue makes it disappear.
        i.reportedById === currentUser.id ||
        (issuesSeeUnassigned && !i.assigneeId)
    );
  }, [storeFiltered, role, currentUser.id, issuesSeeUnassigned]);

  // Split the list only when the group can't see everything; otherwise flat is right.
  const showsSplitSections = role === 'staff' && !issuesSeeUnassigned;
  const assignedToMe = useMemo(
    () => filtered.filter((i) => i.assigneeId === currentUser.id),
    [filtered, currentUser.id],
  );
  const reportedByMe = useMemo(
    () => filtered.filter((i) => i.reportedById === currentUser.id && i.assigneeId !== currentUser.id),
    [filtered, currentUser.id],
  );

  // Counts beside each tab, so a filter announces its size before you switch to it.
  const filterCounts = useMemo(() => {
    const base = role === 'staff'
      ? issues.filter((i) => i.assigneeId === currentUser.id || i.reportedById === currentUser.id
          || (issuesSeeUnassigned && !i.assigneeId))
      : issues;
    return {
      all: base.length,
      urgent: base.filter((i) => i.priority === 'urgent' && i.status !== 'resolved').length,
      unassigned: base.filter((i) => !i.assigneeId && i.status !== 'resolved').length,
      in_progress: base.filter((i) => i.status === 'in_progress').length,
      resolved: base.filter((i) => i.status === 'resolved').length,
      public: base.filter((i) => i.isPublicReport).length,
    } as Record<FilterType, number>;
  }, [issues, role, currentUser.id, issuesSeeUnassigned]);

  const selectedIssue = issues.find((i) => i.id === selectedIssueId);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Exports exactly what the user is looking at, current filter + search, in list order.
  function handleExport() {
    const memberName = (userId: string | null) =>
      userId ? (members.find((m) => m.userId === userId)?.fullName ?? null) : null;
    const stamp = format(new Date(), 'yyyy-MM-dd');
    downloadCsv(`issues-${filter}-${stamp}.csv`, issuesToCsv(filtered, memberName));
  }

  function handleTakeIssue(issueId: string) {
    const now = new Date().toISOString();
    updateIssue(issueId, { assigneeId: currentUser.id, status: 'assigned' });
    addActivityEntry(issueId, {
      id: `a${Date.now()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      action: `${currentUser.name} took this issue`,
      timestamp: now,
    });
  }

  // Auto-select first on filter change.
  //
  // Desktop only: there the detail sits beside the list, so preselecting fills an otherwise
  // empty panel. On a phone the detail is a full-screen layer, and preselecting would drop
  // the user straight into a record they never chose, hiding the list entirely.
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    if (!selectedIssueId || !filtered.find((i) => i.id === selectedIssueId)) {
      if (filtered.length > 0) selectIssue(filtered[0].id);
    }
  }, [filter, searchQuery]);

  function renderIssueCard(issue: Issue) {
    return (
      <IssueCard
        key={issue.id}
        issue={issue}
        selected={issue.id === selectedIssueId}
        onClick={() => { selectIssue(issue.id); setMobileDetailOpen(true); }}
        onTakeIt={issuesSeeUnassigned && role === 'staff' && !issue.assigneeId
          ? () => handleTakeIssue(issue.id)
          : undefined}
      />
    );
  }

  const subtitle = season
    ? `${season.name} · ${format(new Date(season.openingDate + 'T00:00:00'), 'MMM d')} – ${format(new Date(season.closingDate + 'T00:00:00'), 'MMM d')} · ${openCount()} open issue${openCount() !== 1 ? 's' : ''}`
    : `${openCount()} open issues`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        flush
        title="Issues & repairs"
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={filtered.length === 0}
              title={filtered.length === 0
                ? 'Nothing to export'
                : `Export ${filtered.length} issue${filtered.length !== 1 ? 's' : ''} as CSV`}
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
            {can('createIssue') && (
              <Button size="sm" onClick={openLogIssueModal}>
                <Plus className="w-3.5 h-3.5" />
                Log issue
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-1 min-h-0">
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-shrink-0 bg-paper-raised px-4 sm:px-7">
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:flex sm:items-stretch border-t border-border">
              <StatCard label="Urgent" value={urgentCount()} hint="Needs action today" variant="red" />
              <StatCard label="Open" value={openCount()} hint="Assigned or pending" />
              <StatCard label="Resolved" value={resolvedCount()} hint="This session" />
              <StatCard label="Repair costs" value={formatCost(totalCosts())} hint="This session so far" variant="amber" />
            </div>
          </div>

          {/* Toolbar: the tabs sit on the header's own bottom rule. */}
          <div className="flex-shrink-0 border-b border-border bg-paper-raised px-4 sm:px-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="-mx-1 flex items-center gap-1 overflow-x-auto overflow-y-hidden no-scrollbar px-1">
                {filterLabels.map(({ key, label }) => (
                  <FilterPill
                    key={key}
                    label={label}
                    active={filter === key}
                    count={filterCounts[key]}
                    onClick={() => setFilter(key)}
                  />
                ))}
              </div>
              <div className="pb-2 sm:pb-0">
                <SearchInput value={searchQuery} onChange={setSearch} placeholder="Search issues…" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-7 pb-10">
            {/* Failed safety devices callout */}
            {failedDevices.length > 0 && (
              <div className="bg-red-bg border border-red/20 rounded-card px-4 py-3.5 mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[12px] font-semibold text-red">
                    {failedDevices.length} safety device{failedDevices.length !== 1 ? 's' : ''} failed last inspection
                  </p>
                  <Link to="/safety" className="text-[11px] font-semibold text-red hover:underline">
                    View in Safety →
                  </Link>
                </div>
                <div className="space-y-0.5">
                  {failedDevices.map((item) => (
                    <p key={item.id} className="text-[11px] text-red/80">• {item.name} · {item.location}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Issue list */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-[15px] font-semibold text-ink-soft">
                  {filter === 'urgent' ? 'No urgent issues right now' :
                   filter === 'unassigned' ? 'No unassigned issues' :
                   filter === 'in_progress' ? 'Nothing in progress' :
                   filter === 'resolved' ? 'No resolved issues yet' :
                   filter === 'public' ? 'No public reports yet' :
                   'No issues found'}
                </p>
                <p className="text-[13px] text-ink-faint mt-1">
                  {searchQuery ? 'Try a different search term' : 'All clear for now'}
                </p>
              </div>
            ) : showsSplitSections ? (
              // Being assigned an issue and having reported one are different
              // responsibilities, so they don't belong in one undifferentiated list.
              <div className="space-y-5">
                {assignedToMe.length > 0 && (
                  <div>
                    <GroupHeader label="Assigned to you" count={assignedToMe.length} />
                    {assignedToMe.map((issue) => renderIssueCard(issue))}
                  </div>
                )}
                {reportedByMe.length > 0 && (
                  <div>
                    <GroupHeader label="You reported" count={reportedByMe.length} />
                    <p className="-mt-1 mb-2 text-[12px] text-ink-soft">
                      Someone else will pick these up. You'll see status changes here.
                    </p>
                    {reportedByMe.map((issue) => renderIssueCard(issue))}
                  </div>
                )}
              </div>
            ) : (
              <div className="pt-4">
                {filtered.map((issue) => renderIssueCard(issue))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel. A fixed column beside the list on desktop; on a phone there isn't
            room for both, so it becomes a full-screen layer over the list once something is
            selected, and is absent otherwise. */}
        <div
          className={`border-l border-border bg-white flex-col overflow-hidden
            lg:w-detail lg:min-w-detail lg:static lg:z-auto lg:flex
            ${selectedIssue && mobileDetailOpen ? 'fixed inset-0 z-40 flex w-full' : 'hidden'}`}
        >
          {selectedIssue ? (
            <>
              <button
                onClick={() => setMobileDetailOpen(false)}
                className="lg:hidden flex items-center gap-1.5 px-4 py-3 border-b border-border text-[13px] font-medium text-ink hover:text-forest flex-shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                All issues
              </button>
              <IssueDetail issue={selectedIssue} />
            </>
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
