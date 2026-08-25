import { useMemo } from 'react';
import { Package, ClipboardCheck, Printer, ThermometerSnowflake, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { FilterPill } from '@/components/shared/FilterPill';
import { SearchInput } from '@/components/shared/SearchInput';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAuth } from '@/lib/auth';
import {
  CATEGORY_LABELS, STORAGE_LABELS, formatQty, fromBase,
  onHandInStockUnit, parInStockUnit, countSheetToPrintHtml,
  makeProjectionInput, projectedOnHandBase, runOutDate, daysOfCover,
  type PrintCountGroup,
  todayStr,
} from '@/lib/commissaryUnits';
import { OnHandValue, ParValue, CategoryIcon } from './commissaryUi';

const STORAGE_ORDER = ['walk_in_refrigerator', 'walk_in_freezer', 'reach_in_refrigerator', 'dry_storage', 'other'];

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'protein', label: 'Protein' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'produce', label: 'Produce' },
  { id: 'dry_goods', label: 'Dry goods' },
  { id: 'low', label: 'Low stock' },
];

export function InventoryTab() {
  const {
    items, filteredItems, stockCounts, setupCounts, openModal, setActiveTab,
    inventoryFilter, setInventoryFilter, inventorySearch, setInventorySearch,
    activeWeek, weekShortfalls, unlinkedEntryCount, activeSession,
    storageMap, consumptionByItemDate, incomingByItemDate, projectionHorizon,
  } = useCommissaryStore();
  const { tempLogs } = useSafetyStore();
  const { can } = useAuth();
  const canManage = can('manageCommissary');

  // At-risk storage: a mapped walk-in whose latest Safety temp reading is out of range.
  const atRisk = storageMap
    .filter((m) => m.safetyItemId)
    .map((m) => {
      const logs = tempLogs.filter((t) => t.itemId === m.safetyItemId)
        .sort((a, b) => (b.logDate + b.session).localeCompare(a.logDate + a.session));
      return { location: m.storageLocation, latest: logs[0] ?? null };
    })
    .filter((x) => x.latest && !x.latest.inRange);

  function handlePrintCountSheet() {
    const groups: PrintCountGroup[] = STORAGE_ORDER
      .map((loc) => ({
        location: STORAGE_LABELS[loc],
        items: items.filter((i) => i.storageLocation === loc).sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({
          name: i.name, unit: i.stockUnit,
          reorderAt: parInStockUnit(i).toLocaleString(),
          onHand: onHandInStockUnit(i).toLocaleString(),
        })),
      }))
      .filter((g) => g.items.length > 0);
    const html = countSheetToPrintHtml(new Date().toLocaleDateString(), groups);
    const w = window.open('', '_blank');
    if (!w) { alert('Enable pop-ups to print the count sheet.'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  const counts = stockCounts();
  const setup = setupCounts();
  const rows = filteredItems();
  const session = activeSession();

  // The mock's alert banner is a hand-typed sentence that contradicts its own table
  // (it lists canola oil as low while showing it fully stocked). This is the real
  // computation: which items cannot cover the menu actually planned for this week.
  const shortfalls = useMemo(
    () => (session ? weekShortfalls(activeWeek) : []),
    [session, activeWeek, weekShortfalls],
  );
  const unlinked = session ? unlinkedEntryCount(activeWeek) : 0;

  // Reconciled projection: what each item will actually have, and when it runs out.
  const consMap = consumptionByItemDate();
  const incMap = incomingByItemDate();
  const today = todayStr();
  const horizon = projectionHorizon();
  const projById = new Map(items.map((it) => {
    const inp = makeProjectionInput(it, today, consMap, incMap);
    return [it.id, { now: projectedOnHandBase(inp, today), runOut: runOutDate(inp, horizon), cover: daysOfCover(inp, horizon) }];
  }));

  // Soonest to run out first. The reason anyone opens this screen. No run-out sorts last.
  const sorted = [...rows].sort((a, b) => {
    const ra = projById.get(a.id)?.runOut ?? null;
    const rb = projById.get(b.id)?.runOut ?? null;
    if (ra && rb) return ra.localeCompare(rb) || a.name.localeCompare(b.name);
    if (ra) return -1;
    if (rb) return 1;
    return a.name.localeCompare(b.name);
  });

  if (items.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <Package className="w-7 h-7 text-ink-faint" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No inventory yet</h3>
          <p className="text-[13px] text-ink-soft leading-relaxed mb-4">
            Add what you keep on hand (proteins, dairy, produce, dry goods) with a
            reorder level for each. Recipes draw from these items, and the menu tells you
            what you are short.
          </p>
          {canManage && (
            <Button size="sm" onClick={() => openModal({ kind: 'item' })}>+ Add your first item</Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      {/* Unmissable, non-dismissible until resolved: freshly imported items land with no
          reorder level (can't flag low) and uncounted on-hand. Never let that be silent. */}
      {setup.either > 0 && (
        <div className="flex items-start gap-3 rounded-card border-2 border-amber/50 bg-amber-bg px-4 py-3.5 mb-5">
          <AlertTriangle className="w-5 h-5 text-amber-text flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-body text-amber-text font-semibold">
              {setup.either} item{setup.either === 1 ? '' : 's'} still need setup, ordering and low-stock alerts won't work for {setup.either === 1 ? 'it' : 'them'} yet.
            </p>
            <p className="text-[12px] text-amber-text/80 mt-0.5">
              {[
                setup.needsReorder ? `${setup.needsReorder} with no reorder level (can never flag as low)` : '',
                setup.notCounted ? `${setup.notCounted} not counted` : '',
              ].filter(Boolean).join(' · ')}. Set a reorder level and count on-hand for each.
            </p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setInventoryFilter('needs_setup')}>Review these</Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total items" value={items.length} hint="Across all categories" />
        <StatCard label="Critically low" value={counts.critical} hint="Under half the reorder level" variant={counts.critical > 0 ? 'red' : 'default'} />
        <StatCard label="Low stock" value={counts.low} hint="At or below reorder level" variant={counts.low > 0 ? 'amber' : 'default'} />
        <StatCard label="Fully stocked" value={counts.ok} hint="Above reorder level" />
      </div>

      {atRisk.length > 0 && (
        <div className="flex items-start gap-3 rounded-card border border-red/25 bg-red-bg px-4 py-3.5 mb-5">
          <ThermometerSnowflake className="w-4 h-4 text-red flex-shrink-0 mt-0.5" />
          <p className="flex-1 text-body text-red/90 leading-relaxed">
            {atRisk.map((a) => `${STORAGE_LABELS[a.location]} (${a.latest!.temperature}°)`).join(', ')} last logged out of
            temperature range. Check the perishables held there before serving.
          </p>
        </div>
      )}

      {shortfalls.length > 0 && (
        <AlertBanner
          variant="alert"
          message={
            `${shortfalls.length} item${shortfalls.length === 1 ? '' : 's'} cannot cover week ${activeWeek}'s menu: ` +
            shortfalls.slice(0, 6).map((s) => s.item.name.toLowerCase()).join(', ') +
            (shortfalls.length > 6 ? `, and ${shortfalls.length - 6} more` : '') + '.'
          }
          action={{ label: 'View menu', onClick: () => setActiveTab('menu') }}
        />
      )}

      {unlinked > 0 && (
        <AlertBanner
          variant="warn"
          message={
            `${unlinked} menu item${unlinked === 1 ? '' : 's'} in week ${activeWeek} ${unlinked === 1 ? 'is' : 'are'} ` +
            'not linked to a recipe, so nothing they use is counted in the demand above. ' +
            'Link them to a recipe to include their ingredients.'
          }
          action={{ label: 'View menu', onClick: () => setActiveTab('menu') }}
        />
      )}

      <div className="flex items-center gap-2 mb-4">
        {FILTERS.map((f) => (
          <FilterPill
            key={f.id}
            label={f.label}
            active={inventoryFilter === f.id}
            onClick={() => setInventoryFilter(f.id)}
            count={f.id === 'low' ? counts.low + counts.critical : undefined}
          />
        ))}
        {setup.either > 0 && (
          <FilterPill
            label="Needs setup"
            active={inventoryFilter === 'needs_setup'}
            onClick={() => setInventoryFilter('needs_setup')}
            count={setup.either}
          />
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={handlePrintCountSheet}>
          <Printer className="w-3.5 h-3.5" /> Count sheet
        </Button>
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'count' })}>
            <ClipboardCheck className="w-3.5 h-3.5" /> Do a count
          </Button>
        )}
        <SearchInput value={inventorySearch} onChange={setInventorySearch} placeholder="Search inventory…" />
      </div>

      <div className="bg-white rounded-card border border-border overflow-x-auto">
        <div className="grid grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_150px] min-w-[760px] sm:min-w-0 gap-3 px-4 py-2.5 bg-cream-dark/50 border-b border-border">
          {['Item', 'On hand (counted)', 'Projected now', 'Runs out', 'Min on hand', ''].map((h) => (
            <span key={h} className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">{h}</span>
          ))}
        </div>

        {sorted.map((item) => {
          const p = projById.get(item.id) ?? { now: item.onHandBase, runOut: null, cover: null };
          const projNow = Math.max(0, p.now);
          const soon = p.cover != null && p.cover <= 3;
          const near = p.cover != null && p.cover <= 7;
          return (
            <div key={item.id} className="grid grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_150px] min-w-[760px] sm:min-w-0 gap-3 px-4 py-3 border-b border-border last:border-0 items-center hover:bg-cream-dark/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <CategoryIcon category={item.category} className="w-4 h-4 text-ink-faint flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-forest truncate">{item.name}</p>
                  <p className="text-[11px] text-ink-faint truncate">
                    {CATEGORY_LABELS[item.category]} · {STORAGE_LABELS[item.storageLocation]}
                  </p>
                </div>
              </div>
              <OnHandValue item={item} />
              <span className={`font-mono text-[13px] ${p.now <= 0 ? 'text-red font-medium' : 'text-ink'}`}>
                {formatQty(fromBase(projNow, item.stockUnitInBase), item.stockUnit)}
              </span>
              <span className="text-[12px]">
                {item.lastCountedAt == null ? (
                  <span className="text-forest/25">-</span>
                ) : p.runOut ? (
                  <span className={soon ? 'text-red font-medium' : near ? 'text-amber-text' : 'text-ink-soft'}>
                    {new Date(`${p.runOut}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {p.cover != null && <span className="text-ink-faint"> · {p.cover}d</span>}
                  </span>
                ) : (
                  <span className="text-green-muted-text">Covered</span>
                )}
              </span>
              <ParValue item={item} />
              <div className="flex gap-1.5 justify-end">
                {canManage && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'adjust', itemId: item.id })}>Adjust</Button>
                    <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'item', editId: item.id })}>Edit</Button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-ink-faint">No items match this filter.</p>
        )}
      </div>
    </div>
  );
}
