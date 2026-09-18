import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Plus, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { GroupHeader } from '@/components/shared/GroupHeader';
import { StatCard } from '@/components/shared/StatCard';
import { SearchInput } from '@/components/shared/SearchInput';
import { Button } from '@/components/shared/Button';
import { LogIssueModal } from '@/components/shared/LogIssueModal';
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
import { useCampgroundStore, checklistProgress, unreadThreadsForMe } from '@/store/campgroundStore';
import { useAuth } from '@/lib/auth';
import { useTradeLabel } from '@/lib/useTrades';
import type { Issue, Trade } from '@/lib/types';
import {
  STATUS_LABELS, compareWorkOrders, isOpen, isStalled, tradeLabel,
} from '@/lib/workOrder';
import { todayStr } from '@/lib/utils';
import { useTradeKeys } from '@/lib/useTrades';
import { searchableText, useTranslationLookup } from '@/lib/contentTranslation';
import { TranslatedText } from '@/components/i18n/TranslatedText';

/**
 * The Campground board.
 *
 * The module is Campground in the product and `issues` in the database — the label was renamed,
 * the table was not, because renaming a table thirteen surfaces and an iOS app read from is pure
 * risk for zero user-visible gain.
 */

type Tab = 'board' | 'routines' | 'crews' | 'review';

// Four tabs, paired by what they answer rather than by what they are.
//
// A routine raises work and a checklist is what that work consists of, so they are one subject:
// "what happens on its own". Crews and vendors are both the answer to "who does it" -- the people
// here and the people you call -- so they are the other. Five tabs where two pairs said the same
// thing meant setting up a turnover took three of them.
// Labels are read in the reader's language at render time (`board.tabs.<id>`).
const TABS: readonly Tab[] = ['board', 'routines', 'crews', 'review'];

/**
 * `waiting` is one filter over two states, because a camp does not think "vendor or part" — it
 * thinks "this one is not moving and it is not my fault". The two states stay separate on the
 * record, where the difference is actionable.
 */
type BoardFilter = 'all' | 'mine' | 'urgent' | 'unassigned' | 'in_progress' | 'waiting' | 'resolved' | 'public';

// Labels (`board.filters.<key>`) and empty states (`board.empty.<key>`) are in the campground
// namespace, read at render time.
const BOARD_FILTERS: readonly BoardFilter[] = [
  'all', 'mine', 'urgent', 'unassigned', 'in_progress', 'waiting', 'resolved', 'public',
];

const selectClass =
  'rounded-btn border border-border bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-forest ' +
  'focus:border-sage focus:outline-none cursor-pointer';

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
  const { t } = useTranslation(['campground', 'common']);
  const lookup = useTranslationLookup();
  const tradeKeys = useTradeKeys();
  const labelOf = useTradeLabel();
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
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'board';
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
  const comments = useCampgroundStore((s) => s.comments);
  const readAt = useCampgroundStore((s) => s.readAt);
  const { can, role, currentUser, issuesSeeUnassigned, staffGroupIds } = useAuth();

  const [filter, setFilter] = useState<BoardFilter>('all');
  const [search, setSearch] = useState('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  /** Why "Take it" did not take. Null until a write is actually refused. */
  const [takeError, setTakeError] = useState<string | null>(null);

  const today = todayStr();
  const failedDevices = failedLastInspectionItems();

  /**
   * What this person is allowed to see.
   *
   * Load-bearing. A staff member always keeps sight of what they reported, even when their
   * group cannot see unassigned work — without that clause, logging something makes it vanish,
   * which is the bug that once convinced a whole crew the app was eating their reports.
   */
  const viewers = useCampgroundStore((s) => s.viewers);
  const grantedToMe = useMemo(
    () => new Set(viewers.filter((v) => v.userId === currentUser.id).map((v) => v.issueId)),
    [viewers, currentUser.id],
  );

  const visible = useMemo(() => {
    if (role !== 'staff') return issues;
    return issues.filter(
      (i) =>
        i.assigneeId === currentUser.id ||
        i.reportedById === currentUser.id ||
        // Work waiting for the whole camp, or waiting for this person's own crew. A crew whose
        // members cannot see what is waiting for them cannot pick anything up.
        (issuesSeeUnassigned && !i.assigneeId &&
          (!i.assigneeGroupId || staffGroupIds.includes(i.assigneeGroupId))) ||
        // Somebody tagged them into this one and chose to open it. A narrow, recorded exception:
        // it is this work order and no other, and it does not touch their crew setting.
        grantedToMe.has(i.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, role, currentUser.id, issuesSeeUnassigned, staffGroupIds.join(','), grantedToMe]);

  // Lane counts come from open work: a lane exists because there is something in it to do.
  const laneCounts = useMemo(() => {
    const counts = Object.fromEntries(tradeKeys.map((t) => [t, 0])) as Record<Trade, number>;
    for (const i of visible) if (isOpen(i)) counts[i.trade] += 1;
    return counts;
  }, [visible, tradeKeys]);

  const openTotal = useMemo(() => visible.filter(isOpen).length, [visible]);

  /**
   * Work orders that have said something to me since I last looked -- mine, or ones I have
   * already spoken on. The dot on a card only helps if you are looking at the card; a message
   * you are waiting on should find you.
   */
  const unreadThreads = useMemo(
    () => unreadThreadsForMe(visible, comments, readAt, currentUser.id),
    [visible, comments, readAt, currentUser.id],
  );
  const [messagesDismissed, setMessagesDismissed] = useState(false);

  const inLane = useMemo(
    () => (tradeFilter === 'all' ? visible : visible.filter((i) => i.trade === tradeFilter)),
    [visible, tradeFilter],
  );

  // Counts beside each tab, so a filter announces its size before you switch to it.
  const filterCounts = useMemo(() => ({
    all: inLane.length,
    mine: inLane.filter((i) => i.assigneeId === currentUser.id && isOpen(i)).length,
    urgent: inLane.filter((i) => i.priority === 'urgent' && isOpen(i)).length,
    unassigned: inLane.filter((i) => !i.assigneeId && isOpen(i)).length,
    in_progress: inLane.filter((i) => i.status === 'in_progress').length,
    waiting: inLane.filter(isStalled).length,
    resolved: inLane.filter((i) => i.status === 'resolved').length,
    public: inLane.filter((i) => i.isPublicReport).length,
  }) as Record<BoardFilter, number>, [inLane, currentUser.id]);

  const filtered = useMemo(() => {
    let rows = inLane;
    // Deliberately not "or my crew's": a crew list is a pile to pick from, not my list.
    if (filter === 'mine') rows = rows.filter((i) => i.assigneeId === currentUser.id && isOpen(i));
    else if (filter === 'urgent') rows = rows.filter((i) => i.priority === 'urgent' && isOpen(i));
    else if (filter === 'unassigned') rows = rows.filter((i) => !i.assigneeId && isOpen(i));
    else if (filter === 'in_progress') rows = rows.filter((i) => i.status === 'in_progress');
    else if (filter === 'waiting') rows = rows.filter(isStalled);
    else if (filter === 'resolved') rows = rows.filter((i) => i.status === 'resolved');
    else if (filter === 'public') rows = rows.filter((i) => i.isPublicReport);

    // Matched against the original AND the reader's translation, so a Spanish reader finds
    // "gotera" and the director who wrote "leak" still finds it too.
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (i) =>
          searchableText(i.title, lookup('issues', i.id, 'title', i.title)).toLowerCase().includes(q) ||
          searchableText(i.description, lookup('issues', i.id, 'description', i.description))
            .toLowerCase().includes(q) ||
          i.locations.some((l) => l.toLowerCase().includes(q)),
      );
    }

    // Overdue first, then priority, then how long it has been sitting.
    return [...rows].sort((a, b) => compareWorkOrders(a, b, today));
  }, [inLane, filter, search, today, currentUser.id, lookup]);

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
    // The export is read by a person, in the language they asked for. The cells a person typed
    // (title, description) stay as they were written: a spreadsheet is a record, not a view.
    const header = [
      t('csv.title'), t('csv.crew'), t('csv.status'), t('csv.priority'), t('csv.locations'),
      t('csv.asset'), t('csv.assignee'), t('csv.reportedBy'), t('csv.source'), t('csv.vendor'),
      t('csv.routine'), t('csv.checklist'), t('csv.dueDate'), t('csv.assignedAt'),
      t('csv.resolvedAt'), t('csv.minutesSpent'), t('csv.actualCost'), t('csv.created'),
      t('csv.lastUpdated'), t('csv.description'),
    ];
    const rows = filtered.map((i) => {
      const progress = checklistProgress(checklistItems, i.id);
      return [
        i.title,
        labelOf(i.trade),
        STATUS_LABELS[i.status],
        t(`common:priority.${i.priority}`),
        i.locations.join('; '),
        i.assetId ? (assets.find((a) => a.id === i.assetId)?.name ?? '') : '',
        memberName(i.assigneeId) ?? '',
        i.isPublicReport ? (i.reporterName ?? '') : (memberName(i.reportedById) ?? ''),
        i.isPublicReport ? t('csv.publicReport') : t('csv.staff'),
        i.vendorId ? (vendors.find((v) => v.id === i.vendorId)?.name ?? '') : '',
        i.scheduleId ? t('csv.yes') : '',
        progress ? t('csv.progress', { done: progress.done, total: progress.total }) : '',
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

  /**
   * Taking a job has to let the crew go of it.
   *
   * `issues_one_assignee` allows a person or a crew, never both. Writing only `assignee_id` on a
   * job a crew was holding violated the constraint, and the rejection reached nothing but the
   * console: the chip looked like it did nothing. Assigning from the detail panel always cleared
   * the other side; this path did not.
   */
  async function handleTakeIt(issueId: string) {
    const before = issues.find((i) => i.id === issueId);
    setTakeError(null);
    const error = await updateIssue(issueId, {
      assigneeId: currentUser.id,
      assigneeGroupId: null,
      status: 'assigned',
    });
    if (error) {
      // Put the card back as it was. A chip that vanished on a write that never landed is the
      // same lie in the other direction: work that looks taken and is not.
      if (before) {
        updateIssue(issueId, {
          assigneeId: before.assigneeId,
          assigneeGroupId: before.assigneeGroupId,
          status: before.status,
        });
      }
      setTakeError(t('board.takeError', { error }));
      return;
    }
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

  /**
   * Finished work leaves the list and waits at the bottom. A board is a list of what still
   * needs doing; a season's worth of resolved jobs pushed that below the fold. The "Done"
   * filter still shows them outright, so nothing is hidden — it is just not first.
   */
  const [showDone, setShowDone] = useState(false);
  const splitDone = filter !== 'resolved';
  const openRows = useMemo(
    () => (splitDone ? filtered.filter((i) => i.status !== 'resolved') : filtered),
    [filtered, splitDone],
  );
  const doneRows = useMemo(
    () => (splitDone ? filtered.filter((i) => i.status === 'resolved') : []),
    [filtered, splitDone],
  );

  const subtitle = season
    ? t('board.seasonOpenCount', { season: season.name, count: openTotal })
    : t('board.openCount', { count: openTotal });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar
        flush
        title={t('board.title')}
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
                  ? t('board.exportNothing')
                  : t('board.exportTitle', { count: filtered.length })}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('board.exportCsv')}</span>
              </Button>
            )}
            {can('createIssue') && (
              <Button size="sm" onClick={openLogIssueModal}>
                <Plus className="h-3.5 w-3.5" />
                {t('board.logWork')}
              </Button>
            )}
          </div>
        }
      />

      {/* Module tabs */}
      <div className="flex-shrink-0 overflow-x-auto overflow-y-hidden border-b border-border bg-paper-raised px-4 no-scrollbar sm:px-7">
        <div className="flex">
          {TABS.map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`-mb-px whitespace-nowrap border-b-[3px] px-3 pb-2.5 pt-3 text-[13px] font-semibold
                          transition-colors sm:px-4 ${
                tab === id ? 'border-red text-forest' : 'border-transparent text-ink-soft hover:text-forest'
              }`}
            >
              {t(`board.tabs.${id}`)}
            </button>
          ))}
        </div>
      </div>

      {tab !== 'board' ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
          {tab === 'routines' && (
            <div className="flex flex-col gap-6">
              <RoutinesPanel />
              <ChecklistTemplatesPanel />
            </div>
          )}
          {tab === 'crews' && (
            <div className="flex flex-col gap-6">
              <WorkRoutingCard />
              <VendorsPanel />
            </div>
          )}
          {tab === 'review' && <SeasonReview />}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex-shrink-0 bg-paper-raised px-4 sm:px-7">
              <div className="grid grid-cols-2 border-t border-border sm:flex sm:items-stretch">
                <StatCard label={t('board.stats.urgent')} value={urgentCount} hint={t('board.stats.urgentHint')} variant="red" />
                <StatCard label={t('board.stats.open')} value={openTotal} hint={t('board.stats.openHint')} />
                <StatCard label={t('board.stats.waiting')} value={waitingCount} hint={t('board.stats.waitingHint')} variant="amber" />
                <StatCard label={t('board.stats.done')} value={doneCount} hint={t('board.stats.doneHint')} variant="green" />
              </div>
            </div>

            {/* One row, two questions: whose work and what state. This was two full-width rows
                of chips -- a lane per trade above a tab per status -- which cost a third of the
                screen before you had read a single job. The counts stay: a filter that announces
                its size is worth switching to. */}
            <div className="flex-shrink-0 border-b border-border bg-paper-raised px-4 sm:px-7 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={t('board.crewFilter')}
                  value={tradeFilter}
                  onChange={(e) => setTradeFilter(e.target.value as typeof tradeFilter)}
                  className={selectClass}
                >
                  <option value="all">{t('board.allCrews', { count: openTotal })}</option>
                  {tradeKeys.map((k) => (
                    <option key={k} value={k}>{labelOf(k)} · {laneCounts[k] ?? 0}</option>
                  ))}
                </select>

                <select
                  aria-label={t('board.statusFilter')}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as BoardFilter)}
                  className={selectClass}
                >
                  {BOARD_FILTERS.map((key) => (
                    <option key={key} value={key}>{t(`board.filters.${key}`)} · {filterCounts[key]}</option>
                  ))}
                </select>

                {(tradeFilter !== 'all' || filter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => { setTradeFilter('all'); setFilter('all'); }}
                    className="text-[12px] font-semibold text-ink-soft hover:text-forest px-1"
                  >
                    {t('board.clear')}
                  </button>
                )}

                <div className="ms-auto">
                  <SearchInput value={search} onChange={setSearch} placeholder={t('board.searchPlaceholder')} />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-10 sm:px-7">
              {takeError && (
                <div className="mb-4 mt-4 flex items-start justify-between gap-3 rounded-card border border-red/20 bg-red-bg px-4 py-3.5">
                  <p className="min-w-0 text-[12.5px] font-semibold text-red">{takeError}</p>
                  <button
                    type="button"
                    onClick={() => setTakeError(null)}
                    aria-label={t('board.dismiss')}
                    className="flex-none text-red/60 hover:text-red"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {unreadThreads.length > 0 && !messagesDismissed && (
                <div className="mb-4 mt-4 rounded-card border border-blue/30 bg-blue-bg px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-blue-text">
                        {t('board.newMessages', { count: unreadThreads.length })}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {unreadThreads.slice(0, 4).map((i) => (
                          <button
                            key={i.id}
                            type="button"
                            onClick={() => { selectIssue(i.id); setMobileDetailOpen(true); }}
                            className="text-[12px] text-blue-text underline underline-offset-2 hover:no-underline"
                          >
                            <TranslatedText source="issues" id={i.id} field="title" text={i.title} />
                          </button>
                        ))}
                        {unreadThreads.length > 4 && (
                          <span className="text-[12px] text-blue-text/70">
                            {t('board.andMore', { count: unreadThreads.length - 4 })}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMessagesDismissed(true)}
                      aria-label={t('board.dismiss')}
                      className="flex-none text-blue-text/60 hover:text-blue-text"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {failedDevices.length > 0 && (
                <div className="mb-4 mt-4 rounded-card border border-red/20 bg-red-bg px-4 py-3.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-red">
                      {t('board.failedDevices', { count: failedDevices.length })}
                    </p>
                    <Link to="/safety" className="text-[11px] font-semibold text-red hover:underline">
                      {t('board.viewInSafety')}
                    </Link>
                  </div>
                  <div className="space-y-0.5">
                    {failedDevices.map((item) => (
                      <p key={item.id} className="text-[11px] text-red/80">• {item.name} · {item.location}</p>
                    ))}
                  </div>
                </div>
              )}

              {openRows.length === 0 && doneRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-[15px] font-semibold text-ink-soft">{t(`board.empty.${filter}`)}</p>
                  <p className="mt-1 text-[13px] text-ink-faint">
                    {search ? t('board.emptyHintSearch') : t('board.emptyHintClear')}
                  </p>
                </div>
              ) : showsSplitSections ? (
                // Being assigned work and having reported it are different responsibilities,
                // so they do not belong in one undifferentiated list.
                <div className="space-y-5">
                  {assignedToMe.length > 0 && (
                    <div>
                      <GroupHeader label={t('board.assignedToYou')} count={assignedToMe.length} />
                      {assignedToMe.map(card)}
                    </div>
                  )}
                  {reportedByMe.length > 0 && (
                    <div>
                      <GroupHeader label={t('board.youReported')} count={reportedByMe.length} />
                      <p className="-mt-1 mb-2 text-[12px] text-ink-soft">
                        {t('board.youReportedHint')}
                      </p>
                      {reportedByMe.map(card)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-4">
                  {openRows.map(card)}

                  {doneRows.length > 0 && (
                    <div className="mt-5 border-t border-border pt-4">
                      <button
                        type="button"
                        onClick={() => setShowDone((v) => !v)}
                        className="flex w-full items-center gap-2 text-[13px] font-semibold text-ink-soft hover:text-forest transition-colors"
                      >
                        <ChevronRight
                          className={`h-4 w-4 transition-transform rtl:-scale-x-100 ${showDone ? 'rotate-90 rtl:-rotate-90' : ''}`}
                          aria-hidden="true"
                        />
                        {t('board.done')}
                        <span className="font-mono text-[12px] text-ink-faint">{doneRows.length}</span>
                      </button>
                      {showDone && <div className="pt-3">{doneRows.map(card)}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* A fixed column beside the list on desktop; on a phone there isn't room for both,
              so it becomes a full-screen layer over the list once something is selected. */}
          <div
            className={`flex-col overflow-hidden border-s border-border bg-white
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
                  <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
                  {t('board.allWork')}
                </button>
                {/* Keyed on the record: switching work orders resets the panel's own state
                    (a pending undo, a half-typed cost) by remounting, which is cheaper and
                    harder to get wrong than a reset pass that must remember every field. */}
                <WorkOrderDetail key={selectedIssue.id} issue={selectedIssue} />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-forest/30">
                {t('board.pickSomething')}
              </div>
            )}
          </div>
        </div>
      )}

      {isLogIssueModalOpen && <LogIssueModal />}
    </div>
  );
}
