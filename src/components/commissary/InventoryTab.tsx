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
  type PrintCountGroup, type StockStatus,
  todayStr,
} from '@/lib/commissaryUnits';
import { OnHandValue, ParValue, CategoryIcon } from './commissaryUi';
import { setAsideByItem, formatDay, formatClock } from '@/lib/foodRequests';

// Width-only grid: the row and the header must share it exactly.
const ROW_GRID = 'grid grid-cols-[2fr_1fr_1.2fr_1.3fr_0.9fr_150px] min-w-[880px] lg:min-w-0 gap-3';

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
    items, filteredItems, setupCounts, openModal, setActiveTab,
    inventoryFilter, setInventoryFilter, inventorySearch, setInventorySearch,
    activeWeek, weekShortfalls, unlinkedEntryCount, activeSession,
    storageMap, shelfPictures,
    foodRequests, foodRequestLines, foodPrograms,
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

  // Food promised to programs from today on. Already inside "Left after promises" and the run-out
  // (it is demand); named on the row so the cook does not use the flour the cooking club is getting.
  const setAside = useMemo(
    () => setAsideByItem(foodRequests, foodRequestLines, todayStr(), foodPrograms),
    [foodRequests, foodRequestLines, foodPrograms],
  );

  // One projection feeds the tiles, the rows and the Low stock filter (see shelfPicture).
  const pictures = shelfPictures();
  const counts: Record<StockStatus, number> = { ok: 0, low: 0, critical: 0 };
  for (const p of pictures.values()) counts[p.status] += 1;
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

  // Soonest to run out first, then the worst left-after-promises. The reason anyone opens this screen.
  const severity: Record<StockStatus, number> = { critical: 0, low: 1, ok: 2 };
  const sorted = [...rows].sort((a, b) => {
    const pa = pictures.get(a.id), pb = pictures.get(b.id);
    const ra = pa?.runOut ?? null, rb = pb?.runOut ?? null;
    if (ra && rb) return ra.localeCompare(rb) || a.name.localeCompare(b.name);
    if (ra) return -1;
    if (rb) return 1;
    return severity[pa?.status ?? 'ok'] - severity[pb?.status ?? 'ok'] || a.name.localeCompare(b.name);
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
        <StatCard label="Critically low" value={counts.critical} hint="Runs out in 3 days, or under half the min left after promises" variant={counts.critical > 0 ? 'red' : 'default'} />
        <StatCard label="Low stock" value={counts.low} hint="Below the min after promises, or runs out this week" variant={counts.low > 0 ? 'amber' : 'default'} />
        <StatCard label="Fully stocked" value={counts.ok} hint="At or above the min after promises" />
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

      <div className="bg-white rounded-card border border-border overflow-x-auto" data-testid="inventory-table">
        <div className={`${ROW_GRID} px-4 py-2.5 bg-cream-dark/50 border-b border-border`}>
          {[
            ['Item', null],
            ['On shelf', 'What should be on the shelf right now: the last count, less what the menu has used since, plus deliveries'],
            ['Promised to programs', 'Approved program requests from today on, still to be picked up'],
            ['Left after promises', 'What is left once the promised pickups have gone, menu use included'],
            ['Min on hand', null],
            ['', null],
          ].map(([h, tip]) => (
            <span key={h ?? 'actions'} title={tip ?? undefined} className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">{h}</span>
          ))}
        </div>

        {sorted.map((item) => {
          const p = pictures.get(item.id);
          const qty = (base: number) => formatQty(fromBase(base, item.stockUnitInBase), item.stockUnit);
          const counted = item.lastCountedAt != null;
          const aside = setAside.get(item.id);
          const tone = !p ? 'text-ink' : p.status === 'critical' ? 'text-red' : p.status === 'low' ? 'text-amber-text' : 'text-green-muted-text';
          return (
            <div key={item.id} data-testid="inventory-row" data-item={item.name} data-status={p?.status}
              className={`${ROW_GRID} px-4 py-3 border-b border-border last:border-0 items-center hover:bg-cream-dark/30`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <CategoryIcon category={item.category} className="w-4 h-4 text-ink-faint flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-forest truncate">{item.name}</p>
                  <p className="text-[11px] text-ink-faint truncate">
                    {CATEGORY_LABELS[item.category]} · {STORAGE_LABELS[item.storageLocation]}
                  </p>
                </div>
              </div>
              <div className="min-w-0" data-testid="on-shelf">
                {!counted ? <OnHandValue item={item} /> : (
                  <>
                    <span className="font-mono text-[13px] text-ink">{qty(p?.onShelf ?? item.onHandBase)}</span>
                    {p && Math.abs(p.onShelf - item.onHandBase) > item.stockUnitInBase * 0.01 && (
                      <span className="block text-[10.5px] text-ink-faint">counted {qty(item.onHandBase)}</span>
                    )}
                  </>
                )}
              </div>
              <div className="min-w-0">
                {aside ? (
                  <button type="button" data-testid="set-aside"
                    onClick={() => setActiveTab('requests')}
                    title={aside.entries.map((e) => `${qty(e.base)} · ${e.who} · ${formatDay(e.pickupDate)} ${formatClock(e.pickupTime)}${e.status === 'ready' ? ' (ready)' : ''}`).join('\n')}
                    className="inline-flex max-w-full flex-col items-start rounded-tag border border-amber/40 bg-amber-bg px-1.5 py-0.5 text-left text-[11px] text-amber-text hover:border-amber">
                    <span className="font-mono text-[12px] font-semibold whitespace-nowrap">{qty(aside.totalBase)}</span>
                    <span className="max-w-full truncate">
                      {aside.entries[0].who} {formatDay(aside.entries[0].pickupDate).split(',')[0]}
                      {aside.entries.length > 1 ? ` +${aside.entries.length - 1}` : ''}
                    </span>
                  </button>
                ) : <span className="text-forest/25">-</span>}
              </div>
              <div className="min-w-0 text-[12px]" data-testid="left-after">
                {!counted && !aside ? (
                  <span className="text-forest/25">-</span>
                ) : p ? (
                  <>
                    <span className={`font-mono text-[13px] font-medium ${tone}`}>{qty(Math.max(0, p.leftAfter))}</span>
                    <span className={`block text-[11px] ${p.runOut ? tone : p.status === 'ok' ? 'text-ink-faint' : tone}`}>
                      {p.runOut
                        ? <>Runs out {new Date(`${p.runOut}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{p.cover != null && <span className="text-ink-faint"> · {p.cover}d</span>}</>
                        : p.status === 'ok' ? 'Covered' : 'Below min on hand'}
                    </span>
                  </>
                ) : null}
              </div>
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
