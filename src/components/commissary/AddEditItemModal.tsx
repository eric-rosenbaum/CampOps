import { useState } from 'react';
import { Plus, X, Search } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { InventoryCategory, StorageLocation, CommissaryVendor, ItemVendorPack, CatalogProduct } from '@/lib/types';
import {
  ALLERGENS, ALLERGEN_LABELS, CATEGORY_LABELS, STORAGE_LABELS,
  STOCK_UNIT_OPTIONS, STOCK_UNIT_GROUPS, resolveStockUnit, BASE_UNIT, toBase, tidy,
  suggestStockUnit,
} from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

const NEW_VENDOR = '__new';

// One editable vendor-pack row. `packSize` is stock units per pack ("1 case = 24 cans").
interface PackRow {
  key: string;
  vendorId: string;        // '' | vendor id | NEW_VENDOR
  newVendorName: string;
  purchaseUnit: string;
  packSize: string;
  unitPrice: string;
  isDefault: boolean;
}

export function AddEditItemModal({ editId }: { editId?: string }) {
  const { items, vendors, addVendor, addItem, updateItem, deleteItem, saveItemVendors, packsForItem, searchCatalog, closeModal } = useCommissaryStore();
  const existing = editId ? items.find((i) => i.id === editId) ?? null : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<InventoryCategory>(existing?.category ?? 'other');
  const [storage, setStorage] = useState<StorageLocation>(existing?.storageLocation ?? 'other');

  // Unit model, the friendly view. The user picks how they COUNT the item; the
  // engine's dimension/base-unit/factor are derived, never shown. For a NEW item the
  // "Stocked by" unit is smart-guessed from the name until the user touches it.
  const initialUnit = existing
    ? resolveStockUnit(existing.stockUnit, existing.dimension, existing.stockUnitInBase)
    : STOCK_UNIT_OPTIONS[0];
  const [stockUnitValue, setStockUnitValue] = useState(initialUnit.value);
  const [unitTouched, setUnitTouched] = useState(Boolean(existing));

  function handleNameChange(v: string) {
    setName(v);
    if (!existing && !unitTouched) {
      const guess = suggestStockUnit(v);
      if (guess) setStockUnitValue(guess);
    }
  }

  // Include a synthetic option for legacy items whose unit isn't in the standard list.
  const unitOptions = STOCK_UNIT_OPTIONS.some((o) => o.value === initialUnit.value && o.inBase === initialUnit.inBase)
    ? STOCK_UNIT_OPTIONS
    : [initialUnit, ...STOCK_UNIT_OPTIONS];

  const resolved = resolveStockUnit(
    stockUnitValue,
    unitOptions.find((o) => o.value === stockUnitValue)?.dimension ?? 'count',
    unitOptions.find((o) => o.value === stockUnitValue)?.inBase ?? 1,
  );
  const stockUnit = resolved.value;
  const stockUnitInBase = resolved.inBase;
  const dimension = resolved.dimension;
  const baseUnit = BASE_UNIT[dimension];

  const [onHand, setOnHand] = useState(
    existing ? String(tidy(existing.onHandBase / existing.stockUnitInBase, 4)) : '',
  );
  const [reorderAt, setReorderAt] = useState(
    existing ? String(tidy(existing.parLevelBase / existing.stockUnitInBase, 4)) : '',
  );

  // ── Vendor packs (multi-vendor). Seed from stored packs; fall back to a legacy item's
  // own single vendor/pack fields if it predates the packs table. ──
  const [packRows, setPackRows] = useState<PackRow[]>(() => {
    const stored = existing ? packsForItem(existing.id) : [];
    if (stored.length) {
      return stored.map((p) => ({
        key: p.id,
        vendorId: p.vendorId,
        newVendorName: '',
        purchaseUnit: p.purchaseUnit,
        packSize: String(tidy(p.purchaseUnitInBase / (existing!.stockUnitInBase || 1), 4)),
        unitPrice: p.unitPrice != null ? String(p.unitPrice) : '',
        isDefault: p.isDefault,
      }));
    }
    if (existing?.vendorId) {
      return [{
        key: generateId(), vendorId: existing.vendorId, newVendorName: '',
        purchaseUnit: existing.purchaseUnit,
        packSize: String(tidy(existing.purchaseUnitInBase / (existing.stockUnitInBase || 1), 4)),
        unitPrice: existing.unitPrice != null ? String(existing.unitPrice) : '',
        isDefault: true,
      }];
    }
    return [];
  });

  const [allergens, setAllergens] = useState<string[]>(existing?.allergens ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // "Add from catalog" — autofill name/category/unit/pack/allergens from the shared catalog.
  const [catalogQuery, setCatalogQuery] = useState('');
  const catalogMatches = catalogQuery ? searchCatalog(catalogQuery) : [];
  function applyCatalog(c: CatalogProduct) {
    setName(c.name);
    setCategory(c.category);
    setUnitTouched(true);
    setStockUnitValue(c.stockUnit);
    setAllergens(c.allergens);
    setPackRows(c.packSize != null ? [{
      key: generateId(), vendorId: '', newVendorName: '',
      purchaseUnit: c.packUnit ?? 'case', packSize: String(c.packSize), unitPrice: '', isDefault: true,
    }] : []);
    setCatalogQuery('');
  }

  function patchRow(key: string, p: Partial<PackRow>) {
    setPackRows((rows) => rows.map((r) => r.key === key ? { ...r, ...p } : r));
  }
  function addRow() {
    setPackRows((rows) => [...rows, {
      key: generateId(), vendorId: '', newVendorName: '',
      purchaseUnit: 'case', packSize: '', unitPrice: '',
      isDefault: rows.length === 0,
    }]);
  }
  function removeRow(key: string) {
    setPackRows((rows) => {
      const next = rows.filter((r) => r.key !== key);
      // Keep exactly one default alive.
      if (next.length && !next.some((r) => r.isDefault)) next[0] = { ...next[0], isDefault: true };
      return next;
    });
  }
  function setDefaultRow(key: string) {
    setPackRows((rows) => rows.map((r) => ({ ...r, isDefault: r.key === key })));
  }

  function toggleAllergen(a: string) {
    setAllergens((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  }

  // Rows with a chosen (or newly named) vendor and a valid pack size are the real packs.
  const validRows = packRows.filter((r) =>
    (r.vendorId && r.vendorId !== NEW_VENDOR) || (r.vendorId === NEW_VENDOR && r.newVendorName.trim()));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // Every real pack must hold at least one stock unit.
    if (validRows.some((r) => (Number(r.packSize) || 1) < 1)) return;
    const now = new Date().toISOString();
    const itemId = existing?.id ?? generateId();

    // Create any inline-new vendors once, deduping by name against existing + each other.
    const newVendorIds = new Map<string, string>(); // lowercased name -> id
    const resolveVendorId = (r: PackRow): string | null => {
      if (r.vendorId && r.vendorId !== NEW_VENDOR) return r.vendorId;
      const nm = r.newVendorName.trim();
      if (!nm) return null;
      const key = nm.toLowerCase();
      const already = vendors.find((v) => v.name.toLowerCase() === key);
      if (already) return already.id;
      if (newVendorIds.has(key)) return newVendorIds.get(key)!;
      const v: CommissaryVendor = {
        id: generateId(), name: nm, specialty: null, accountNumber: null,
        repName: null, repEmail: null, repPhone: null, orderCutoff: null, deliveryDay: null,
        minOrder: null, deliveryFee: null, notes: null, sortOrder: vendors.length + newVendorIds.size,
        createdAt: now, updatedAt: now,
      };
      addVendor(v);
      newVendorIds.set(key, v.id);
      return v.id;
    };

    const packs: ItemVendorPack[] = validRows.map((r) => {
      const vId = resolveVendorId(r)!;
      const size = Math.max(Number(r.packSize) || 1, 1);
      return {
        id: generateId(), itemId, vendorId: vId,
        purchaseUnit: r.purchaseUnit.trim() || stockUnit,
        purchaseUnitInBase: size * stockUnitInBase,
        unitPrice: r.unitPrice === '' ? null : Number(r.unitPrice),
        isDefault: false, // set below
        createdAt: now, updatedAt: now,
      };
    });
    // Exactly one default: honor the checked row, else the first pack.
    if (packs.length) {
      const chosenIdx = Math.max(0, validRows.findIndex((r) => r.isDefault));
      packs.forEach((p, i) => { p.isDefault = i === chosenIdx; });
    }

    // Mirror the default pack onto the item's own columns so existing ordering/cost math
    // reads it unchanged. No packs → you buy in your stock unit, no vendor.
    const def = packs.find((p) => p.isDefault) ?? null;
    const onHandBase = toBase(Number(onHand) || 0, stockUnitInBase);
    // On-hand counts as "established" when the field is filled (new item) or its value
    // changed (edit). Setting only the reorder level on an uncounted item keeps it flagged.
    const lastCountedAt = existing
      ? (onHandBase !== existing.onHandBase ? now : existing.lastCountedAt)
      : (onHand.trim() !== '' ? now : null);
    const shared = {
      name: name.trim(),
      category, storageLocation: storage,
      dimension, baseUnit,
      stockUnit,
      stockUnitInBase,
      purchaseUnit: def?.purchaseUnit ?? stockUnit,
      purchaseUnitInBase: def?.purchaseUnitInBase ?? stockUnitInBase,
      unitPrice: def?.unitPrice ?? null,
      onHandBase,
      parLevelBase: toBase(Number(reorderAt) || 0, stockUnitInBase),
      lastCountedAt,
      vendorId: def?.vendorId ?? null,
      allergens,
      notes: notes.trim() || null,
    };

    if (existing) {
      updateItem({ ...existing, ...shared, updatedAt: now });
    } else {
      addItem({ id: itemId, ...shared, sortOrder: items.length, createdAt: now, updatedAt: now });
    }
    saveItemVendors(itemId, packs);
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete "${existing.name}"? Recipes using it keep the ingredient name but stop counting its demand.`)) {
      deleteItem(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit item' : 'Add inventory item'} onClose={closeModal} width="580px">
      <form onSubmit={handleSubmit} className="space-y-4">
        {!existing && (
          <div className="rounded-card border border-sage/30 bg-sage/5 px-3 py-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-forest/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)}
                className="w-full text-body bg-white border border-border rounded-btn pl-8 pr-3 py-2 focus:outline-none focus:border-sage"
                placeholder="Add from catalog — search e.g. chicken, milk, buns…"
              />
              {catalogMatches.length > 0 && (
                <div className="absolute z-10 mt-1 left-0 right-0 max-h-56 overflow-y-auto bg-white border border-border rounded-card shadow-lg">
                  {catalogMatches.map((c) => (
                    <button key={c.id} type="button" onClick={() => applyCatalog(c)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-cream-dark/40 border-b border-border last:border-0">
                      <span className="text-[13px] text-forest truncate">{c.name}</span>
                      <span className="text-[11px] text-forest/45 whitespace-nowrap font-mono">
                        {c.stockUnit}{c.packSize != null ? ` · ${c.packUnit ?? 'case'}/${c.packSize}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-forest/45 mt-1.5">Fills name, category, unit, and pack — pick a vendor and price after. Or just type below.</p>
          </div>
        )}

        <div>
          <label className={labelClass}>Item name *</label>
          <input autoFocus value={name} onChange={(e) => handleNameChange(e.target.value)} className={inputClass}
                 placeholder="e.g. White bread, Canned tomato soup, Chicken breast" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)} className={inputClass}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Storage location</label>
            <select value={storage} onChange={(e) => setStorage(e.target.value as StorageLocation)} className={inputClass}>
              {Object.entries(STORAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {/* ── How it's counted ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Stocked by</label>
            <select value={stockUnitValue} onChange={(e) => { setUnitTouched(true); setStockUnitValue(e.target.value); }} className={inputClass}>
              {STOCK_UNIT_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {unitOptions.filter((o) => o.group === g).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>On hand</label>
            <div className="flex items-center gap-1.5">
              <input type="number" step="any" min="0" value={onHand} onChange={(e) => setOnHand(e.target.value)}
                     className={inputClass} placeholder="0" />
              <span className="text-[12px] text-forest/45 whitespace-nowrap">{stockUnit}</span>
            </div>
          </div>
          <div>
            <label className={labelClass}>Reorder at</label>
            <div className="flex items-center gap-1.5">
              <input type="number" step="any" min="0" value={reorderAt} onChange={(e) => setReorderAt(e.target.value)}
                     className={inputClass} placeholder="0" />
              <span className="text-[12px] text-forest/45 whitespace-nowrap">{stockUnit}</span>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-forest/45 -mt-2">
          "Reorder at" is the level that flags this item as low — your minimum before you restock.
        </p>

        {/* ── Vendors & pack sizes (multi-vendor) ────────────────────────────── */}
        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-forest">Vendors &amp; pack sizes</span>
            {packRows.length > 1 && <span className="text-[10px] uppercase tracking-widest text-forest/40">★ = order default</span>}
          </div>
          {packRows.length === 0 && (
            <p className="text-[11px] text-forest/45">
              None yet — you'll order in {stockUnit}s. Add a vendor if you buy by the case, or buy from a specific supplier.
            </p>
          )}
          {packRows.map((r) => (
            <div key={r.key} className="rounded-btn border border-border bg-white px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setDefaultRow(r.key)} title="Make default vendor"
                  className={`text-[15px] leading-none ${r.isDefault ? 'text-amber-text' : 'text-forest/25 hover:text-forest/50'}`}>
                  {r.isDefault ? '★' : '☆'}
                </button>
                <select value={r.vendorId} onChange={(e) => patchRow(r.key, { vendorId: e.target.value })}
                        className="flex-1 text-body bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage">
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  <option value={NEW_VENDOR}>+ New vendor…</option>
                </select>
                <button type="button" onClick={() => removeRow(r.key)} className="text-forest/30 hover:text-red p-1" title="Remove">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {r.vendorId === NEW_VENDOR && (
                <input autoFocus value={r.newVendorName} onChange={(e) => patchRow(r.key, { newVendorName: e.target.value })}
                       className="w-full text-body bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage" placeholder="Vendor name" />
              )}
              <div className="flex items-center gap-2 text-[12px] text-forest/70 flex-wrap">
                <span>1</span>
                <input value={r.purchaseUnit} onChange={(e) => patchRow(r.key, { purchaseUnit: e.target.value })}
                       className="w-20 text-body bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage" placeholder="case" />
                <span>=</span>
                <input type="number" step="any" min="1" value={r.packSize} onChange={(e) => patchRow(r.key, { packSize: e.target.value })}
                       className="w-16 text-body bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage" placeholder="24" />
                <span>{stockUnit}s</span>
                <span className="text-forest/30">·</span>
                <span>$</span>
                <input type="number" step="0.01" min="0" value={r.unitPrice} onChange={(e) => patchRow(r.key, { unitPrice: e.target.value })}
                       className="w-20 text-body bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage" placeholder="per pack" />
              </div>
            </div>
          ))}
          <button type="button" onClick={addRow}
            className="flex items-center gap-1 text-[12px] text-sage-text font-medium hover:text-forest">
            <Plus className="w-3.5 h-3.5" /> Add vendor pack
          </button>
          <p className="text-[11px] text-forest/45">
            Orders round up to whole packs. Set the ★ default — it's used when generating orders; any line can be switched to another vendor later.
          </p>
        </div>

        <div>
          <label className={labelClass}>Allergens</label>
          <p className="text-[11px] text-forest/45 mb-2">Tagged once here; every recipe using this item inherits them.</p>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => (
              <button key={a} type="button" onClick={() => toggleAllergen(a)}
                className={`px-2.5 py-1 rounded-pill text-[11px] font-medium border transition-colors ${
                  allergens.includes(a)
                    ? 'bg-amber-bg text-amber-text border-amber/30'
                    : 'bg-white text-forest/50 border-border hover:border-forest/30'
                }`}>
                {ALLERGEN_LABELS[a]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="optional" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center">{existing ? 'Save changes' : 'Add item'}</Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>

        {!existing && (
          <p className="text-[11px] text-forest/40 flex items-center gap-1 pt-0.5">
            <Plus className="w-3 h-3" /> Most items are simple: pick "each" or "loaf" or "can" and you're done.
          </p>
        )}
      </form>
    </Modal>
  );
}
