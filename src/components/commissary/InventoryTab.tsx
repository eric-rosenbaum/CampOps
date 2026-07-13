import { useMemo } from 'react';
import { Package, ClipboardCheck, Printer, ThermometerSnowflake } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { FilterPill } from '@/components/shared/FilterPill';
import { SearchInput } from '@/components/shared/SearchInput';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAuth } from '@/lib/auth';
import {
  CATEGORY_LABELS, STORAGE_LABELS, formatInStockUnit, stockStatus,
  onHandInStockUnit, parInStockUnit, countSheetToPrintHtml, type PrintCountGroup,
} from '@/lib/commissaryUnits';
import { StockBar, OnHandValue, ParValue, CategoryIcon } from './commissaryUi';

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
    items, filteredItems, stockCounts, openModal, setActiveTab,
    inventoryFilter, setInventoryFilter, inventorySearch, setInventorySearch,
    activeWeek, weekShortfalls, unlinkedEntryCount, activeSession, weekDemand,
    storageMap,
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
  const demand = useMemo(
    () => (session ? weekDemand(activeWeek) : new Map()),
    [session, activeWeek, weekDemand],
  );

  // Sort worst-stocked first — the reason anyone opens this screen.
  const sorted = useMemo(() => {
    const rank = { critical: 0, low: 1, ok: 2 };
    return [...rows].sort((a, b) => {
      const d = rank[stockStatus(a)] - rank[stockStatus(b)];
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
  }, [rows]);

  if (items.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
            <Package className="w-7 h-7 text-stone-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No inventory yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed mb-4">
            Add what you keep on hand — proteins, dairy, produce, dry goods — with a
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
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <div className="grid grid-cols-4 gap-4 mb-5">
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

      <div className="bg-white rounded-card border border-border overflow-hidden">
        <div className="grid grid-cols-[2.2fr_1fr_1fr_1fr_1.2fr_auto] gap-3 px-4 py-2.5 bg-cream-dark/50 border-b border-border">
          {['Item', 'On hand', 'Reorder at', 'Week demand', 'Stock level', ''].map((h) => (
            <span key={h} className="text-[10px] font-semibold uppercase tracking-widest text-forest/40">{h}</span>
          ))}
        </div>

        {sorted.map((item) => {
          const need = demand.get(item.id);
          return (
            <div key={item.id} className="grid grid-cols-[2.2fr_1fr_1fr_1fr_1.2fr_auto] gap-3 px-4 py-3 border-b border-border last:border-0 items-center hover:bg-cream-dark/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <CategoryIcon category={item.category} className="w-4 h-4 text-forest/40 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-forest truncate">{item.name}</p>
                  <p className="text-[11px] text-forest/45 truncate">
                    {CATEGORY_LABELS[item.category]} · {STORAGE_LABELS[item.storageLocation]}
                  </p>
                </div>
              </div>
              <OnHandValue item={item} />
              <ParValue item={item} />
              <span className="font-mono text-[13px] text-forest/60">
                {need ? formatInStockUnit(item, need.neededBase) : <span className="text-forest/25">—</span>}
              </span>
              <StockBar item={item} />
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
          <p className="px-4 py-8 text-center text-[13px] text-forest/45">No items match this filter.</p>
        )}
      </div>
    </div>
  );
}
