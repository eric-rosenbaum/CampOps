import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { InventoryCategory, StorageLocation, CommissaryVendor } from '@/lib/types';
import {
  ALLERGENS, ALLERGEN_LABELS, CATEGORY_LABELS, STORAGE_LABELS,
  STOCK_UNIT_OPTIONS, STOCK_UNIT_GROUPS, resolveStockUnit, BASE_UNIT, toBase, tidy,
} from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

const NEW_VENDOR = '__new';

export function AddEditItemModal({ editId }: { editId?: string }) {
  const { items, vendors, addVendor, addItem, updateItem, deleteItem, closeModal } = useCommissaryStore();
  const existing = editId ? items.find((i) => i.id === editId) ?? null : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<InventoryCategory>(existing?.category ?? 'other');
  const [storage, setStorage] = useState<StorageLocation>(existing?.storageLocation ?? 'other');

  // Vendor — with an inline "new vendor" affordance so you're not forced to set
  // vendors up first. A separate modal would blow away this half-filled form.
  const [vendorId, setVendorId] = useState(existing?.vendorId ?? '');
  const [newVendorName, setNewVendorName] = useState('');

  // Unit model, the friendly view. The user picks how they COUNT the item; the
  // engine's dimension/base-unit/factor are derived, never shown.
  const initialUnit = existing
    ? resolveStockUnit(existing.stockUnit, existing.dimension, existing.stockUnitInBase)
    : STOCK_UNIT_OPTIONS[0];
  const [stockUnitValue, setStockUnitValue] = useState(initialUnit.value);
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

  // Optional purchase pack: "we stock cans but buy cases; 1 case = 24 cans".
  const initialHasPack = existing
    ? existing.purchaseUnit !== existing.stockUnit || existing.purchaseUnitInBase !== existing.stockUnitInBase
    : false;
  const [hasPack, setHasPack] = useState(initialHasPack);
  const [purchaseUnit, setPurchaseUnit] = useState(
    initialHasPack && existing ? existing.purchaseUnit : 'case',
  );
  const [packSize, setPackSize] = useState(
    initialHasPack && existing ? String(tidy(existing.purchaseUnitInBase / existing.stockUnitInBase, 4)) : '',
  );
  const [unitPrice, setUnitPrice] = useState(existing?.unitPrice != null ? String(existing.unitPrice) : '');

  const [allergens, setAllergens] = useState<string[]>(existing?.allergens ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // What the price and ordering are denominated in.
  const packN = hasPack ? (Number(packSize) || 0) : 1;
  const purchaseUnitLabel = hasPack ? (purchaseUnit.trim() || 'pack') : stockUnit;
  const purchaseUnitInBase = hasPack ? Math.max(packN, 1) * stockUnitInBase : stockUnitInBase;

  function toggleAllergen(a: string) {
    setAllergens((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  }

  function handleVendorChange(v: string) {
    setVendorId(v === NEW_VENDOR ? NEW_VENDOR : v);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (hasPack && packN < 1) return; // a pack must hold at least one stock unit
    const now = new Date().toISOString();

    // Create the inline vendor first, if one was typed, and point the item at it.
    let resolvedVendorId: string | null = vendorId && vendorId !== NEW_VENDOR ? vendorId : null;
    if (vendorId === NEW_VENDOR && newVendorName.trim()) {
      const v: CommissaryVendor = {
        id: generateId(), name: newVendorName.trim(), specialty: null, accountNumber: null,
        repName: null, repEmail: null, repPhone: null, orderCutoff: null, deliveryDay: null,
        minOrder: null, deliveryFee: null, notes: null, sortOrder: vendors.length,
        createdAt: now, updatedAt: now,
      };
      addVendor(v);
      resolvedVendorId = v.id;
    }

    const shared = {
      name: name.trim(),
      category, storageLocation: storage,
      dimension, baseUnit,
      stockUnit,
      stockUnitInBase,
      purchaseUnit: purchaseUnitLabel,
      purchaseUnitInBase,
      unitPrice: unitPrice === '' ? null : Number(unitPrice),
      onHandBase: toBase(Number(onHand) || 0, stockUnitInBase),
      parLevelBase: toBase(Number(reorderAt) || 0, stockUnitInBase),
      vendorId: resolvedVendorId,
      allergens,
      notes: notes.trim() || null,
    };

    if (existing) {
      updateItem({ ...existing, ...shared, updatedAt: now });
    } else {
      addItem({ id: generateId(), ...shared, sortOrder: items.length, createdAt: now, updatedAt: now });
    }
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete "${existing.name}"? Recipes using it keep the ingredient name but stop counting its demand.`)) {
      deleteItem(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit item' : 'Add inventory item'} onClose={closeModal} width="560px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Item name *</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass}
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
            <select value={stockUnitValue} onChange={(e) => setStockUnitValue(e.target.value)} className={inputClass}>
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

        {/* ── Optional purchase pack ─────────────────────────────────────────── */}
        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={hasPack} onChange={(e) => setHasPack(e.target.checked)} className="accent-sage" />
            <span className="text-[12px] font-medium text-forest">Buy in a bigger pack than you stock?</span>
          </label>
          {!hasPack ? (
            <p className="text-[11px] text-forest/45 mt-1.5">
              Off — you order in {stockUnit}s, the same unit you count. Turn on if, say, you count
              cans but order by the case.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-[12px] text-forest/70 flex-wrap">
                <span>1</span>
                <input value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)}
                       className="w-24 text-body bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage" placeholder="case" />
                <span>=</span>
                <input type="number" step="any" min="1" value={packSize} onChange={(e) => setPackSize(e.target.value)}
                       className="w-20 text-body bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage" placeholder="24" />
                <span>{stockUnit}s</span>
              </div>
              <p className="text-[11px] text-forest/45">
                Orders round up to whole {purchaseUnitLabel}s.
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Price per {purchaseUnitLabel}</label>
            <input type="number" step="0.01" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
                   className={inputClass} placeholder="0.00" />
          </div>
          <div>
            <label className={labelClass}>Vendor</label>
            <select value={vendorId} onChange={(e) => handleVendorChange(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              <option value={NEW_VENDOR}>+ New vendor…</option>
            </select>
            {vendorId === NEW_VENDOR && (
              <input autoFocus value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)}
                     className={`${inputClass} mt-2`} placeholder="Vendor name" />
            )}
          </div>
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
