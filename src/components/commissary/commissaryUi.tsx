import { useState } from 'react';
import {
  Beef, Milk, Carrot, Wheat, Package, Snowflake, Cookie, CupSoda, Box, Check, Pencil,
  type LucideIcon,
} from 'lucide-react';
import type { InventoryItem } from '@/lib/types';
import {
  restrictionLabel, STOCK_STATUS_LABELS, stockPercent, stockStatus,
  onHandInStockUnit, parInStockUnit, type StockStatus,
} from '@/lib/commissaryUnits';

const STOCK_STYLES: Record<StockStatus, { bar: string; text: string; badge: string }> = {
  ok:       { bar: 'bg-sage',  text: 'text-green-muted-text', badge: 'bg-green-muted-bg text-green-muted-text border-sage/20' },
  low:      { bar: 'bg-amber', text: 'text-amber-text',       badge: 'bg-amber-bg text-amber-text border-amber/20' },
  critical: { bar: 'bg-red',   text: 'text-red',              badge: 'bg-red-bg text-red border-red/20' },
};

export function StockBar({ item }: { item: InventoryItem }) {
  // No reorder level → an empty dashed track, never a green "fully stocked" bar, which
  // would falsely imply the item is fine when it simply can't be evaluated.
  if (item.parLevelBase <= 0) {
    return <div className="w-full h-1.5 rounded-full border border-dashed border-amber/50 bg-amber-bg/40" title="No reorder level set" />;
  }
  const status = stockStatus(item);
  return (
    <div className="w-full h-1.5 bg-cream-dark rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${STOCK_STYLES[status].bar}`} style={{ width: `${stockPercent(item)}%` }} />
    </div>
  );
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium border ${STOCK_STYLES[status].badge}`}>
      {STOCK_STATUS_LABELS[status]}
    </span>
  );
}

/** On-hand, coloured by status, in the item's own stock unit. */
export function OnHandValue({ item }: { item: InventoryItem }) {
  const status = stockStatus(item);
  // Never counted: don't colour 0 as if it were a real reading, mark it plainly.
  if (item.lastCountedAt == null) {
    return (
      <span className="font-mono text-[13px] text-ink-faint" title="On-hand not counted yet">
        {onHandInStockUnit(item).toLocaleString()} {item.stockUnit}
        <span className="ml-1.5 text-[10px] font-sans text-amber-text">not counted</span>
      </span>
    );
  }
  return (
    <span className={`font-mono text-[13px] font-medium ${STOCK_STYLES[status].text}`}>
      {onHandInStockUnit(item).toLocaleString()} {item.stockUnit}
    </span>
  );
}

export function ParValue({ item }: { item: InventoryItem }) {
  if (item.parLevelBase <= 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium bg-amber-bg text-amber-text border border-amber/25"
            title="No reorder level. This item can never flag as low">
        Set reorder level
      </span>
    );
  }
  return (
    <span className="font-mono text-[13px] text-ink-soft">
      {parInStockUnit(item).toLocaleString()} {item.stockUnit}
    </span>
  );
}

export function AllergenChips({ allergens, size = 'sm' }: { allergens: readonly string[]; size?: 'sm' | 'xs' }) {
  if (!allergens.length) {
    return <span className="text-[11px] text-ink-faint">No major allergens</span>;
  }
  const pad = size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <div className="flex flex-wrap gap-1">
      {allergens.map((a) => (
        <span key={a} className={`inline-flex items-center rounded-tag font-medium border bg-amber-bg text-amber-text border-amber/20 ${pad}`}>
          {restrictionLabel(a)}
        </span>
      ))}
    </div>
  );
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  protein: Beef,
  dairy: Milk,
  produce: Carrot,
  dry_goods: Wheat,
  pantry: Package,
  frozen: Snowflake,
  snacks: Cookie,
  beverage: CupSoda,
  other: Box,
};

// Selected by member access rather than a function call returning a component -
// the pattern react-hooks/static-components allows. See buildingUi.tsx.
export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Box;
  return <Icon className={className} />;
}

/**
 * A number shown read-only until you click it, then edited and explicitly saved (Enter or
 * the ✓, Escape to cancel). Avoids accidental inline edits and the "can't blank the cell"
 * snap-to-zero. `onSave` fires only with a valid value ≥ min.
 */
export function InlineNumberEdit({
  value, onSave, min = 1, suffix, widthClass = 'w-20',
}: {
  value: number; onSave: (n: number) => void; min?: number; suffix?: string; widthClass?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function commit() {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n) && n >= min) onSave(n);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => { setDraft(String(value)); setEditing(true); }} title="Click to edit"
        className="group inline-flex items-center gap-1.5 font-mono text-[13px] text-forest bg-white border border-border rounded-btn px-2.5 py-1.5 hover:border-sage transition-colors">
        {value.toLocaleString()}{suffix ? <span className="text-ink-faint text-[11px] font-sans">{suffix}</span> : null}
        <Pencil className="w-3 h-3 text-forest/25 group-hover:text-sage" />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus type="number" min={min} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(false); }}
        className={`${widthClass} font-mono text-[13px] bg-white border border-sage rounded-btn px-2.5 py-1.5 focus:outline-none`} />
      <button type="button" onClick={commit} title="Save"
        className="p-1.5 rounded-btn bg-sage text-white hover:bg-forest transition-colors">
        <Check className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

export const inputClass =
  'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
export const labelClass = 'block text-secondary font-medium text-ink mb-1';
