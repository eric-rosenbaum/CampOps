import {
  Beef, Milk, Carrot, Wheat, Package, Snowflake, Cookie, CupSoda, Box,
  type LucideIcon,
} from 'lucide-react';
import type { InventoryItem } from '@/lib/types';
import {
  ALLERGEN_LABELS, STOCK_STATUS_LABELS, stockPercent, stockStatus,
  onHandInStockUnit, parInStockUnit, type Allergen, type StockStatus,
} from '@/lib/commissaryUnits';

const STOCK_STYLES: Record<StockStatus, { bar: string; text: string; badge: string }> = {
  ok:       { bar: 'bg-sage',  text: 'text-green-muted-text', badge: 'bg-green-muted-bg text-green-muted-text border-sage/20' },
  low:      { bar: 'bg-amber', text: 'text-amber-text',       badge: 'bg-amber-bg text-amber-text border-amber/20' },
  critical: { bar: 'bg-red',   text: 'text-red',              badge: 'bg-red-bg text-red border-red/20' },
};

export function StockBar({ item }: { item: InventoryItem }) {
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
  return (
    <span className={`font-mono text-[13px] font-medium ${STOCK_STYLES[status].text}`}>
      {onHandInStockUnit(item).toLocaleString()} {item.stockUnit}
    </span>
  );
}

export function ParValue({ item }: { item: InventoryItem }) {
  return (
    <span className="font-mono text-[13px] text-forest/60">
      {parInStockUnit(item).toLocaleString()} {item.stockUnit}
    </span>
  );
}

export function AllergenChips({ allergens, size = 'sm' }: { allergens: readonly string[]; size?: 'sm' | 'xs' }) {
  if (!allergens.length) {
    return <span className="text-[11px] text-forest/40">No major allergens</span>;
  }
  const pad = size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <div className="flex flex-wrap gap-1">
      {allergens.map((a) => (
        <span key={a} className={`inline-flex items-center rounded-tag font-medium border bg-amber-bg text-amber-text border-amber/20 ${pad}`}>
          {ALLERGEN_LABELS[a as Allergen] ?? a}
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

// Selected by member access rather than a function call returning a component —
// the pattern react-hooks/static-components allows. See buildingUi.tsx.
export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Box;
  return <Icon className={className} />;
}

export const inputClass =
  'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
export const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';
