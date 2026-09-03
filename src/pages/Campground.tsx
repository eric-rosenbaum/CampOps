import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronLeft, Download, Plus } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { GroupHeader } from '@/components/shared/GroupHeader';
import { StatCard } from '@/components/shared/StatCard';
import { FilterPill } from '@/components/shared/FilterPill';
import { SearchInput } from '@/components/shared/SearchInput';
import { Button } from '@/components/shared/Button';
import { LogIssueModal } from '@/components/shared/LogIssueModal';
import { TradeLaneBar } from '@/components/campground/TradeLaneBar';
import { WorkOrderCard } from '@/components/campground/WorkOrderCard';
import { WorkOrderDetail } from '@/components/campground/WorkOrderDetail';
// Owned by another agent; imported here because this page is where they live.
import { RoutinesPanel } from '@/components/campground/RoutinesPanel';
import { VendorsPanel } from '@/components/campground/VendorsPanel';
import { WorkRoutingCard } from '@/components/campground/WorkRoutingCard';
import { ChecklistTemplatesPanel } from '@/components/campground/ChecklistTemplatesPanel';
import { SeasonReview } from '@/components/campground/SeasonReview';
import { useIssuesStore } from '@/store/issuesStore';
import { useUIStore } from '@/store/uiStore';
import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAssetStore } from '@/store/assetStore';
import { useCampgroundStore, checklistProgress } from '@/store/campgroundStore';
import { useAuth } from '@/lib/auth';
import { TRADES, TRADE_LABELS } from '@/lib/types';
import type { Issue, Trade } from '@/lib/types';
import {
  STATUS_LABELS, compareWorkOrders, isOpen, isStalled, tradeLabel,
} from '@/lib/workOrder';
import { todayStr } from '@/lib/utils';

/**
 * The Campground board.
 *
 * The module is Campground in the product and `issues` in the database — the label was renamed,
 * the table was not, because renaming a table thirteen surfaces and an iOS app read from is pure
 * risk for zero user-visible gain.
 */

type Tab = 'board' | 'routines' | 'vendors' | 'setup' | 'review';

const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: 'Board' },
  { id: 'routines', label: 'Routines' },
  { id: 'vendors', label: 'Vendors' },
  // Where each trade's work lands, and the checklists a turnover carries. Both are things a camp
  // sets once and then benefits from every day, so they live behind their own tab rather than
  // cluttering the board.
  { id: 'setup', label: 'Crews & checklists' },
  { id: 'review', label: 'Season review' },
];

/**
 * `waiting` is one filter over two states, because a camp does not think "vendor or part" — it
 * thinks "this one is not moving and it is not my fault". The two states stay separate on the
 * record, where the difference is actionable.
 */
type BoardFilter = 'all' | 'urgent' | 'unassigned' | 'in_progress' | 'waiting' | 'resolved' | 'public';

const BOARD_FILTERS: { key: BoardFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'resolved', label: 'Done' },
  { key: 'public', label: 'Public reports' },
];

const EMPTY_MESSAGE: Record<BoardFilter, string> = {
  all: 'Nothing on the board',
  urgent: 'Nothing urgent right now',
  unassigned: 'Everything has an owner',
  in_progress: 'Nothing in progress',
  waiting: 'Nothing is stuck waiting',
  resolved: 'Nothing closed yet',
  public: 'No public reports yet',
};

function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

export function Campground() {
  /**
   * The tab lives in the URL.
   *
   * Deep-linkable, so anything else can send somebody straight to a tab — the log form's
   * "Make this a routine" does exactly that, and it has to work when the person is already
   * standing on this page. `replace` keeps the back button meaning "the page before this one"
   * rather than making it walk back through four tabs.
   */
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = TABS.some((t) => t.id === raw) ? (raw as Tab) : 'board';
  const setTab = (next: Tab) => {
    const nextParams = new URLSearchParams(params);
    if (next === 'board') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setParams(nextParams, { replace: true });
  };

  const issues = useIssuesStore((s) => s.issues);
  const selectedIssueId = useIssuesStore((s) => s.selectedIssueId);
  const selectIssue = useIssuesStore((s) => s.selectIssue);
  const updateIssue = useIssuesStore((s) => s.updateIssue);
  const addActivityEntry = useIssuesStore((s) => s.addActivityEntry);

  const { openLogIssueModal, isLogIssueModalOpen } = useUIStore();
  const members = useCampStore((s) => s.members);
  const season = useChecklistStore((s) => s.season);
  const { failedLastInspectionItems } = useSafetyStore();
  const assets = useAssetStore((s) => s.assets);
  const tradeFilter = useCampgroundStore((s) => s.tradeFilter);
  const setTradeFilter = useCampgroundStore((s) => s.setTradeFilter);
  const vendors = useCampgroundStore((s) => s.vendors);
  const checklistItems = useCampgroundStore((s) => s.checklistItems);
  const { can, role, currentUser, issuesSeeUnassigned } = useAuth();

  const [filter, setFilter] = useState<BoardFilter>('all');
  const [search, setSearch] = useState('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const today = todayStr();
  const failedDevices = failedLastInspectionItems();

  /**
   * What this person is allowed to see.
   *
   * Load-bearing. A staff member always keeps sight of what they reported, even when their
   * group cannot see unassigned work — without that clause, logging something makes it vanish,
   * which is the bug that once convinced a whole crew the app was eating their reports.
   */
  const visible = useMemo(() => {
    if (role !== 'staff') return issues;
    return issues.filter(
      (i) =>
        i.assigneeId === currentUser.id ||
        i.reportedById === currentUser.id ||
        (issuesSeeUnassigned && !i.assigneeId),
    );
  }, [issues, role, currentUser.id, issuesSeeUnassigned]);

  // Lane counts come from open work: a lane exists because there is something in it to do.
  const laneCounts = useMemo(() => {
    const counts = Object.fromEntries(TRADES.map((t) => [t, 0])) as Record<Trade, number>;
    for (const i of visible) if (isOpen(i)) counts[i.trade] += 1;
    return counts;
  }, [visible]);

  const openTotal = useMemo(() => visible.filter(isOpen).length, [visible]);

  const inLane = useMemo(
    () => (tradeFilter === 'all' ? visible : visible.filter((i) => i.trade === tradeFilter)),
    [visible, tradeFilter],
  );

  // Counts beside each tab, so a filter announces its size before you switch to it.
  const filterCounts = useMemo(() => ({
    all: inLane.length,
    urgent: inLane.filter((i) => i.priority === 'urgent' && isOpen(i)).length,
    unassigned: inLane.filter((i) => !i.assigneeId && isOpen(i)).length,
    in_progress: inLane.filter((i) => i.status === 'in_progress').length,
    waiting: inLane.filter(isStalled).length,
    resolved: inLane.filter((i) => i.status === 'resolved').length,
    public: inLane.filter((i) => i.isPublicReport).length,
  }) as Record<BoardFilter, number>, [inLane]);

  const filtered = useMemo(() => {
    let rows = inLane;
    if (filter === 'urgent') rows = rows.filter((i) => i.priority === 'urgent' && isOpen(i));
    else if (filter === 'unassigned') rows = rows.filter((i) => !i.assigneeId && isOpen(i));
    else if (filter === 'in_progress') rows = rows.filter((i) => i.status === 'in_progress');
    else if (filter === 'waiting') rows = rows.filter(isStalled);
    else if (filter === 'resolved') rows = rows.filter((i) => i.status === 'resolved');
    else if (filter === 'public') rows = rows.filter((i) => i.isPublicReport);

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.locations.some((l) => l.toLowerCase().includes(q)),
      );
    }

    // Overdue first, then priority, then how long it has been sitting.
    return [...rows].sort((a, b) => compareWorkOrders(a, b, today));
  }, [inLane, filter, search, today]);

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

  const selectedIssue = issues.find((i) => i.id === selectedIssueId);

  /**
   * Auto-select the first row when the filter changes.
   *
   * Desktop only, and deliberately never clears the selection. On a phone the detail is a
   * full-screen layer, so preselecting would drop somebody into a record they never chose. And
   * clearing on mount races `setIssues`, which selects the first row as soon as a refetch lands
   * — the two fight, and the panel flickers between a record and an empty state.
   */
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    if (!selectedIssueId || !filtered.find((i) => i.id === selectedIssueId)) {
      if (filtered.length > 0) selectIssue(filtered[0].id);
    }
    // Intentionally not keyed on `filtered`: re-running on every list change would yank the
    // selection away from whatever somebody is reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search, tradeFilter, tab]);

  const memberName = (userId: string | null) =>
    userId ? (members.find((m) => m.userId === userId)?.fullName ?? null) : null;

  /** Exports exactly what is on screen: current lane, filter and search, in list order. */
  function handleExport() {
    const header = [
      'Title', 'Trade', 'Status', 'Priority', 'Locations', 'Asset', 'Assignee', 'Reported by',
      'Source', 'Vendor', 'Routine', 'Checklist', 'Due date', 'Assigned at', 'Resolved at',
      'Minutes spent', 'Actual cost', 'Created', 'Last updated', 'Description',
    ];
    const rows = filtered.map((i) => {
      const progress = checklistProgress(checklistItems, i.id);
      return [
        i.title,
        TRADE_LABELS[i.trade],
        STATUS_LABELS[i.status],
        i.priority,
        i.locations.join('; '),
        i.assetId ? (assets.find((a) => a.id === i.assetId)?.name ?? '') : '',
        memberName(i.assigneeId) ?? '',
        i.isPublicReport ? (i.reporterName ?? '') : (memberName(i.reportedById) ?? ''),
        i.isPublicReport ? 'Public report' : 'Staff',
        i.vendorId ? (vendors.find((v) => v.id === i.vendorId)?.name ?? '') : '',
        i.scheduleId ? 'Yes' : '',
        progress ? `${progress.done} of ${progress.total}` : '',
        i.dueDate ?? '',
        i.assignedAt ? format(new Date(i.assignedAt), 'yyyy-MM-dd HH:mm') : '',
        i.resolvedAt ? format(new Date(i.resolvedAt), 'yyyy-MM-dd HH:mm') : '',
        i.minutesSpent ?? '',
        i.actualCost ?? '',
        format(new Date(i.createdAt), 'yyyy-MM-dd HH:mm'),
        format(new Date(i.updatedAt), 'yyyy-MM-dd HH:mm'),
        i.description,
      ];
    });
    const lane = tradeFilter === 'all' ? 'all' : tradeFilter;
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    downloadCsv(`campground-${lane}-${filter}-${today}.csv`, csv);
  }

  function handleTakeIt(issueId: string) {
    updateIssue(issueId, { assigneeId: currentUser.id, status: 'assigned' });
    addActivityEntry(issueId, {
      id: `a${Date.now()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      action: `${currentUser.name} took this on`,
      timestamp: new Date().toISOString(),
    });
  }

  function card(issue: Issue) {
    return (
      <WorkOrderCard
        key={issue.id}
        issue={issue}
        selected={issue.id === selectedIssueId}
        today={today}
        onClick={() => { selectIssue(issue.id); setMobileDetailOpen(true); }}
        onTakeIt={issuesSeeUnassigned && role === 'staff' && !issue.assigneeId
          ? () => handleTakeIt(issue.id)
          : undefined}
      />
    );
  }

  const waitingCount = useMemo(() => visible.filter(isStalled).length, [visible]);
  const urgentCount = useMemo(
    () => visible.filter((i) => i.priority === 'urgent' && isOpen(i)).length,
    [visible],
  );
  const doneCount = useMemo(() => visible.filter((i) => i.status === 'resolved').length, [visible]);

  const subtitle = season
    ? `${season.name} · ${openTotal} open`
    : `${openTotal} open`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar
        flush
        title="Campground"
        subtitle={tradeFilter === 'all' ? subtitle : `${tradeLabel(tradeFilter)} · ${subtitle}`}
        actions={
          <div className="flex items-center gap-2">
            {tab === 'board' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                disabled={filtered.length === 0}
                title={filtered.length === 0
                  ? 'Nothing to export'
                  : `Export ${filtered.length} work order${filtered.length !== 1 ? 's' : ''} as CSV`}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            )}
            {can('createIssue') && (
              <Button size="sm" onClick={openLogIssueModal}>
                <Plus className="h-3.5 w-3.5" />
                Log work
              </Button>
            )}
          </div>
        }
      />

      {/* Module tabs */}
      <div className="flex-shrink-0 overflow-x-auto overflow-y-hidden border-b border-border bg-paper-raised px-4 no-scrollbar sm:px-7">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px whitespace-nowrap border-b-[3px] px-3 pb-2.5 pt-3 text-[13px] font-semibold
                          transition-colors sm:px-4 ${
                tab === t.id ? 'border-red text-forest' : 'border-transparent text-ink-soft hover:text-forest'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab !== 'board' ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
          {tab === 'routines' && <RoutinesPanel />}
          {tab === 'vendors' && <VendorsPanel />}
          {tab === 'setup' && (
            <div className="flex flex-col gap-6">
              <WorkRoutingCard />
              <ChecklistTemplatesPanel />
            </div>
          )}
          {tab === 'review' && <SeasonReview />}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex-shrink-0 bg-paper-raised px-4 sm:px-7">
              <div className="grid grid-cols-2 border-t border-border sm:flex sm:items-stretch">
                <StatCard label="Urgent" value={urgentCount} hint="Needs action today" variant="red" />
                <StatCard label="Open" value={openTotal} hint="Everything not done" />
                <StatCard label="Waiting" value={waitingCount} hint="Vendor or part" variant="amber" />
                <StatCard label="Done" value={doneCount} hint="This season" variant="green" />
              </div>
            </div>

            {/* Lanes. A filter default, never a permission — nothing here hides work from
                anybody, it only decides what is in front of them first. */}
            <div className="flex-shrink-0 bg-paper-raised px-4 sm:px-7">
              <TradeLaneBar
                value={tradeFilter}
                onChange={setTradeFilter}
                counts={laneCounts}
                total={openTotal}
              />
            </div>

            {/* Toolbar: the tabs sit on the header's own bottom rule. */}
            <div className="flex-shrink-0 border-b border-border bg-paper-raised px-4 sm:px-7">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="-mx-1 flex items-center gap-1 overflow-x-auto overflow-y-hidden px-1 no-scrollbar">
                  {BOARD_FILTERS.map(({ key, label }) => (
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
                  <SearchInput value={search} onChange={setSearch} placeholder="Search work…" />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-10 sm:px-7">
              {failedDevices.length > 0 && (
                <div className="mb-4 mt-4 rounded-card border border-red/20 bg-red-bg px-4 py-3.5">
                  <div className="mb-1.5 flex items-center justify-between">
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

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-[15px] font-semibold text-ink-soft">{EMPTY_MESSAGE[filter]}</p>
                  <p className="mt-1 text-[13px] text-ink-faint">
                    {search ? 'Try a different search term' : 'All clear for now'}
                  </p>
                </div>
              ) : showsSplitSections ? (
                // Being assigned work and having reported it are different responsibilities,
                // so they do not belong in one undifferentiated list.
                <div className="space-y-5">
                  {assignedToMe.length > 0 && (
                    <div>
                      <GroupHeader label="Assigned to you" count={assignedToMe.length} />
                      {assignedToMe.map(card)}
                    </div>
                  )}
                  {reportedByMe.length > 0 && (
                    <div>
                      <GroupHeader label="You reported" count={reportedByMe.length} />
                      <p className="-mt-1 mb-2 text-[12px] text-ink-soft">
                        Someone else will pick these up. You'll see status changes here.
                      </p>
                      {reportedByMe.map(card)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-4">{filtered.map(card)}</div>
              )}
            </div>
          </div>

          {/* A fixed column beside the list on desktop; on a phone there isn't room for both,
              so it becomes a full-screen layer over the list once something is selected. */}
          <div
            className={`flex-col overflow-hidden border-l border-border bg-white
              lg:static lg:z-auto lg:flex lg:w-detail lg:min-w-detail
              ${selectedIssue && mobileDetailOpen ? 'fixed inset-0 z-40 flex w-full' : 'hidden'}`}
          >
            {selectedIssue ? (
              <>
                <button
                  onClick={() => setMobileDetailOpen(false)}
                  className="flex flex-shrink-0 items-center gap-1.5 border-b border-border px-4 py-3
                             text-[13px] font-medium text-ink hover:text-forest lg:hidden"
                >
                  <ChevronLeft className="h-4 w-4" />
                  All work
                </button>
                {/* Keyed on the record: switching work orders resets the panel's own state
                    (a pending undo, a half-typed cost) by remounting, which is cheaper and
                    harder to get wrong than a reset pass that must remember every field. */}
                <WorkOrderDetail key={selectedIssue.id} issue={selectedIssue} />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-forest/30">
                Pick something to see the detail
              </div>
            )}
          </div>
        </div>
      )}

      {isLogIssueModalOpen && <LogIssueModal />}
    </div>
  );
}
