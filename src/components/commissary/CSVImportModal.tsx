import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { InventoryItem, ItemVendorPack, CommissaryVendor, StorageLocation } from '@/lib/types';
import {
  parseCsv, CSV_FIELDS, guessCsvField, matchCategory, suggestStockUnit,
  STOCK_UNIT_OPTIONS, BASE_UNIT, toBase, tidy, formatQty,
  type CsvField,
} from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

const NEW_VENDOR = '__new';

/** Resolve a raw "stocked by" string (or the item name) to a known stock-unit option. */
function resolveUnitOption(raw: string, name: string) {
  const s = raw.trim().toLowerCase();
  let opt = s
    ? STOCK_UNIT_OPTIONS.find((o) => o.value.toLowerCase() === s || o.label.toLowerCase() === s)
      ?? STOCK_UNIT_OPTIONS.find((o) => o.value.toLowerCase().startsWith(s) || o.label.toLowerCase().startsWith(s))
    : undefined;
  if (!opt) {
    const guess = suggestStockUnit(name);
    opt = STOCK_UNIT_OPTIONS.find((o) => o.value === guess) ?? STOCK_UNIT_OPTIONS[0];
  }
  return opt;
}

// A row's fate once mapped against the camp's existing inventory:
//  new, no item by this name yet → create it (+ pack if a vendor is chosen)
//  merge, item exists AND a vendor is chosen → add that vendor's pack to it
//  skip, item exists but no vendor to attach (nothing to do), or a repeat within the file
type Mode = 'new' | 'merge' | 'skip';

interface BuiltRow {
  name: string;
  mode: Mode;
  stockUnit: string;          // for the preview (existing item's unit for merges)
  category: string;
  packUnitRaw: string;
  packSizeRaw: number;
  priceRaw: string;
  item: InventoryItem | null; // the would-be item (new only), pre-vendor
  newPack: ItemVendorPack | null;
  mergePack: ItemVendorPack | null;
}

export function CSVImportModal() {
  const { items, vendors, addVendor, importItems, addVendorPacks, packsForItem, closeModal } = useCommissaryStore();

  const [text, setText] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<CsvField[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [newVendorName, setNewVendorName] = useState('');
  const [result, setResult] = useState<{ created: number; merged: number; skipped: number } | null>(null);

  const grid = useMemo(() => (text.trim() ? parseCsv(text) : []), [text]);
  const headerRow = grid[0] ?? [];
  const dataRows = hasHeader ? grid.slice(1) : grid;

  const colCount = headerRow.length;
  const effectiveMapping = mapping.length === colCount
    ? mapping
    : headerRow.map((h, i) => (hasHeader ? guessCsvField(h) : (i === 0 ? 'name' : 'skip')));

  function setColumn(idx: number, field: CsvField) {
    const next = [...effectiveMapping];
    next[idx] = field;
    setMapping(next);
  }

  const colFor = (field: CsvField) => effectiveMapping.findIndex((m) => m === field);
  const hasNameColumn = colFor('name') >= 0;

  async function handleFile(file: File) {
    const content = await file.text();
    setText(content);
    setMapping([]);
  }

  const wantsVendor = Boolean(vendorId && (vendorId !== NEW_VENDOR || newVendorName.trim()));

  // Classify every data row against the camp's current inventory.
  const built: BuiltRow[] = (() => {
    if (!hasNameColumn) return [];
    const nameCol = colFor('name');
    const existingByName = new Map(items.map((i) => [i.name.trim().toLowerCase(), i]));
    const seen = new Set<string>();
    const now = new Date().toISOString();
    const get = (row: string[], field: CsvField) => {
      const c = colFor(field);
      return c >= 0 ? (row[c] ?? '').trim() : '';
    };
    const rows: BuiltRow[] = [];
    for (const row of dataRows) {
      const name = (row[nameCol] ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();

      const opt = resolveUnitOption(get(row, 'stockUnit'), name);
      const packUnitRaw = get(row, 'packUnit') || opt.value;
      const packSizeRaw = Math.max(Number(get(row, 'packSize')) || 0, 1);
      const priceRaw = get(row, 'price');
      const category = matchCategory(get(row, 'category'));
      const existing = existingByName.get(key);

      // Repeat of a name already handled in this file → skip (no double-create/merge).
      if (seen.has(key)) {
        rows.push({ name, mode: 'skip', stockUnit: (existing ?? { stockUnit: opt.value }).stockUnit, category, packUnitRaw, packSizeRaw, priceRaw, item: null, newPack: null, mergePack: null });
        continue;
      }
      seen.add(key);

      if (existing) {
        // Item already stocked. If a vendor is chosen, add its pack; else nothing to do.
        const mergePack: ItemVendorPack | null = wantsVendor ? {
          id: generateId(), itemId: existing.id, vendorId: '', // vendor filled at import
          purchaseUnit: packUnitRaw, purchaseUnitInBase: packSizeRaw * existing.stockUnitInBase,
          unitPrice: priceRaw === '' ? null : Number(priceRaw),
          isDefault: false, createdAt: now, updatedAt: now,
        } : null;
        rows.push({
          name, mode: wantsVendor ? 'merge' : 'skip', stockUnit: existing.stockUnit, category,
          packUnitRaw, packSizeRaw, priceRaw, item: null, newPack: null, mergePack,
        });
        continue;
      }

      // Brand-new item (+ default pack when a vendor is chosen).
      const itemId = generateId();
      const newPack: ItemVendorPack | null = wantsVendor ? {
        id: generateId(), itemId, vendorId: '',
        purchaseUnit: packUnitRaw, purchaseUnitInBase: packSizeRaw * opt.inBase,
        unitPrice: priceRaw === '' ? null : Number(priceRaw),
        isDefault: true, createdAt: now, updatedAt: now,
      } : null;
      const item: InventoryItem = {
        id: itemId, name, category: category as InventoryItem['category'],
        storageLocation: 'other' as StorageLocation,
        dimension: opt.dimension, baseUnit: BASE_UNIT[opt.dimension],
        stockUnit: opt.value, stockUnitInBase: opt.inBase,
        purchaseUnit: newPack?.purchaseUnit ?? opt.value,
        purchaseUnitInBase: newPack?.purchaseUnitInBase ?? opt.inBase,
        unitPrice: newPack?.unitPrice ?? null,
        onHandBase: toBase(Number(get(row, 'onHand')) || 0, opt.inBase),
        parLevelBase: toBase(Number(get(row, 'reorderAt')) || 0, opt.inBase),
        // Imported items are never counted and (usually) have no reorder level → they'll be
        // flagged for setup. If the sheet carried an on-hand value, treat it as counted.
        lastCountedAt: get(row, 'onHand') !== '' ? now : null,
        shelfLifeDays: null,
        vendorId: null, allergens: [], dietary: [], notes: null,
        sortOrder: items.length + rows.length, createdAt: now, updatedAt: now,
      };
      rows.push({ name, mode: 'new', stockUnit: opt.value, category, packUnitRaw, packSizeRaw, priceRaw, item, newPack, mergePack: null });
    }
    return rows;
  })();

  const created = built.filter((r) => r.mode === 'new').length;
  const merged = built.filter((r) => r.mode === 'merge').length;
  const skipped = built.filter((r) => r.mode === 'skip').length;
  const actionable = created + merged;

  function handleImport() {
    if (!actionable) return;
    const now = new Date().toISOString();

    // Resolve the import vendor (existing or inline-new) once.
    let resolvedVendorId: string | null = vendorId && vendorId !== NEW_VENDOR ? vendorId : null;
    if (vendorId === NEW_VENDOR && newVendorName.trim()) {
      const existingV = vendors.find((v) => v.name.toLowerCase() === newVendorName.trim().toLowerCase());
      if (existingV) resolvedVendorId = existingV.id;
      else {
        const v: CommissaryVendor = {
          id: generateId(), name: newVendorName.trim(), specialty: null, accountNumber: null,
          repName: null, repEmail: null, repPhone: null, orderCutoff: null, deliveryDay: null,
          minOrder: null, deliveryFee: null, notes: null, sortOrder: vendors.length,
          createdAt: now, updatedAt: now,
        };
        addVendor(v);
        resolvedVendorId = v.id;
      }
    }

    const newRows = built.filter((r) => r.mode === 'new').map((r) => {
      const item = r.item!;
      if (r.newPack && resolvedVendorId) {
        return { item: { ...item, vendorId: resolvedVendorId }, pack: { ...r.newPack, vendorId: resolvedVendorId } };
      }
      return { item: { ...item, vendorId: null }, pack: null };
    });

    const mergePacks: ItemVendorPack[] = built
      .filter((r) => r.mode === 'merge' && r.mergePack && resolvedVendorId)
      .map((r) => ({
        ...r.mergePack!, vendorId: resolvedVendorId!,
        // First pack on a vendorless item becomes its default + mirror; otherwise an alt.
        isDefault: packsForItem(r.mergePack!.itemId).length === 0,
      }));

    if (newRows.length) importItems(newRows);
    if (mergePacks.length) addVendorPacks(mergePacks);
    setResult({ created: newRows.length, merged: mergePacks.length, skipped });
  }

  if (result != null) {
    return (
      <Modal title="Import complete" onClose={closeModal} width="460px">
        <div className="space-y-4">
          <ul className="text-body text-forest space-y-1">
            <li><strong>{result.created}</strong> new item{result.created === 1 ? '' : 's'} added.</li>
            {result.merged > 0 && <li><strong>{result.merged}</strong> existing item{result.merged === 1 ? '' : 's'} got this vendor's pack.</li>}
            {result.skipped > 0 && <li className="text-ink-soft">{result.skipped} skipped (already stocked, no vendor to add).</li>}
          </ul>
          <p className="text-[12px] text-ink-soft">
            Allergens weren't in the file, tag them on each item when you get a chance. Double-check the guessed
            "stocked by" unit and pack sizes on a few too.
          </p>
          <Button className="w-full justify-center" onClick={closeModal}>Done</Button>
        </div>
      </Modal>
    );
  }

  const modeBadge = (m: Mode) =>
    m === 'new' ? <span className="text-[10px] text-sage-text">new</span>
      : m === 'merge' ? <span className="text-[10px] text-amber-text">+ pack</span>
        : <span className="text-[10px] text-ink-faint">skip</span>;

  return (
    <Modal title="Import items from CSV" onClose={closeModal} width="720px">
      <div className="space-y-4">
        <p className="text-[12px] text-ink-soft leading-relaxed">
          Paste or upload your vendor's order guide (export it as CSV from US Foods MOXē, Sysco Shop, GFS, etc.).
          Map the columns, pick the vendor it's from, and review. Names you already stock get this vendor's pack
          added; new names become new items. Allergens and storage aren't imported. Set those afterward.
        </p>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-btn border border-border bg-white text-[12px] text-forest cursor-pointer hover:border-sage">
            <Upload className="w-3.5 h-3.5" /> Choose CSV file
            <input type="file" accept=".csv,text/csv" className="hidden"
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          <span className="text-[11px] text-ink-faint">or paste below</span>
        </div>

        <textarea
          value={text} onChange={(e) => { setText(e.target.value); setMapping([]); }}
          className={`${inputClass} font-mono text-[11px] resize-none`} rows={4}
          placeholder="Item,Category,Pack,Pack size,Price&#10;Chicken breast,Protein,case,40,86.00&#10;Whole milk,Dairy,case,4,14.50"
        />

        {grid.length > 0 && (
          <>
            <label className="flex items-center gap-2 text-[12px] text-forest">
              <input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); setMapping([]); }} className="accent-sage" />
              First row is a header
            </label>

            <div className="rounded-card border border-border overflow-x-auto">
              <div className="flex gap-2 p-3 min-w-max">
                {headerRow.map((h, i) => (
                  <div key={i} className="w-36 flex-shrink-0">
                    <select value={effectiveMapping[i]} onChange={(e) => setColumn(i, e.target.value as CsvField)}
                            className="w-full text-[11px] bg-white border border-border rounded-btn px-1.5 py-1 focus:outline-none focus:border-sage">
                      {CSV_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <p className="text-[10px] text-ink-faint mt-1 truncate" title={hasHeader ? h : `Column ${i + 1}`}>
                      {hasHeader ? (h || `Column ${i + 1}`) : `Column ${i + 1}`}
                    </p>
                    <p className="text-[10px] text-forest/30 truncate">{dataRows[0]?.[i] ?? ''}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Vendor for this import</label>
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputClass}>
                  <option value="">None (import items only)</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  <option value={NEW_VENDOR}>+ New vendor…</option>
                </select>
                {vendorId === NEW_VENDOR && (
                  <input autoFocus value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)}
                         className={`${inputClass} mt-2`} placeholder="Vendor name" />
                )}
              </div>
              <p className="text-[11px] text-ink-faint self-end pb-2">
                Pick a vendor to attach pack + price, and to add packs to items you already stock. Without one,
                only brand-new names import, at their stock unit.
              </p>
            </div>

            {!hasNameColumn ? (
              <p className="text-[12px] text-amber-text bg-amber-bg border border-amber/25 rounded-card px-3 py-2">
                Map one column to <strong>Item name</strong> to continue.
              </p>
            ) : (
              <div className="rounded-card border border-border overflow-x-auto">
                <div className="grid grid-cols-[2fr_0.7fr_1fr_1.3fr_1fr] min-w-[640px] sm:min-w-0 gap-2 px-3 py-2 bg-cream-dark/40 border-b border-border">
                  {['Item', '', 'Stocked by', 'Pack', 'Price'].map((h, i) => (
                    <span key={i} className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">{h}</span>
                  ))}
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {built.slice(0, 60).map((r, i) => (
                    <div key={i} className={`grid grid-cols-[2fr_0.7fr_1fr_1.3fr_1fr] min-w-[640px] sm:min-w-0 gap-2 px-3 py-1.5 border-b border-border last:border-0 items-center text-[12px] ${r.mode === 'skip' ? 'opacity-40' : ''}`}>
                      <span className="text-forest truncate">{r.name}</span>
                      <span>{modeBadge(r.mode)}</span>
                      <span className="text-ink-soft">{r.stockUnit}</span>
                      <span className="font-mono text-ink-soft truncate">{`${r.packUnitRaw} = ${formatQty(r.packSizeRaw, r.stockUnit)}`}</span>
                      <span className="font-mono text-ink-soft">{r.priceRaw ? `$${tidy(Number(r.priceRaw))}` : '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-3 pt-1">
          <span className="text-[12px] text-ink-soft">
            {hasNameColumn ? [
              created ? `${created} new` : '',
              merged ? `${merged} to update` : '',
              skipped ? `${skipped} skipped` : '',
            ].filter(Boolean).join(' · ') : ''}
          </span>
          <div className="flex-1" />
          <Button variant="ghost" onClick={closeModal}>Cancel</Button>
          <Button disabled={!actionable} onClick={handleImport}>Import {actionable || ''} items</Button>
        </div>
      </div>
    </Modal>
  );
}
