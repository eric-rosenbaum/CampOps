import { useTradeLabel } from '@/lib/useTrades';
import type { Trade } from '@/lib/types';
import { tradePill } from '@/lib/workOrder';
import type { TradeFilter } from '@/store/campgroundStore';
import { useTradeKeys } from '@/lib/useTrades';

interface Props {
  value: TradeFilter;
  onChange: (t: TradeFilter) => void;
  /** Open work per trade. Drives the count and decides which lanes are worth offering. */
  counts: Record<Trade, number>;
  /** Open work across every trade, for the All lane. */
  total: number;
}

/**
 * Maintenance and Housekeeping are always offered.
 *
 * Every camp has both, and a lane that appears only once work exists in it cannot be used to
 * file the first piece of work into. The other three are earned: a camp with no kitchen work
 * does not need a Kitchen tab taking up the width of a phone.
 */
const ALWAYS_OFFERED: Trade[] = ['maintenance', 'housekeeping'];

/**
 * Which crew's work you are looking at.
 *
 * A FILTER DEFAULT, never a permission. Nothing here removes anybody's access to anything —
 * gating work by trade is how a housekeeper's own report becomes invisible to her, which is
 * the exact trap the staff-visibility split below the board exists to avoid.
 */
export function TradeLaneBar({ value, onChange, counts, total }: Props) {
  const tradeKeys = useTradeKeys();
  const labelOf = useTradeLabel();
  // The selected lane stays visible even after its last work order closes, or the bar would
  // reshuffle under the finger that just emptied it.
  const lanes = tradeKeys.filter(
    (t) => ALWAYS_OFFERED.includes(t) || counts[t] > 0 || value === t,
  );

  return (
    <div
      role="tablist"
      aria-label="Crew"
      className="-mx-1 flex items-center gap-1.5 overflow-x-auto overflow-y-hidden no-scrollbar px-1 py-2"
    >
      <Lane
        label="All"
        count={total}
        active={value === 'all'}
        tone="bg-cream-dark text-ink"
        onClick={() => onChange('all')}
      />
      {lanes.map((t) => (
        <Lane
          key={t}
          label={labelOf(t)}
          count={counts[t]}
          active={value === t}
          tone={tradePill(t)}
          onClick={() => onChange(t)}
        />
      ))}
    </div>
  );
}

interface LaneProps {
  label: string;
  count: number;
  active: boolean;
  /** The trade's quiet colour. Selection is carried by the pine fill instead, so the two
   *  signals never compete: colour says which crew, fill says which lane you are in. */
  tone: string;
  onClick: () => void;
}

function Lane({ label, count, active, tone, onClick }: LaneProps) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-pill border
                  px-3 py-[5px] text-[12.5px] font-semibold transition-colors cursor-pointer ${
        active
          ? 'border-forest bg-forest text-paper'
          : `border-transparent ${tone} hover:border-sage`
      }`}
    >
      {label}
      <span className="tabular-nums text-[11px] font-medium opacity-70">{count}</span>
    </button>
  );
}
