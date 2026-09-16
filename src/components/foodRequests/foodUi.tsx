/* eslint-disable react-refresh/only-export-components --
 * The link helpers and the chip that labels a status are small enough to live together, and the
 * public pages and the kitchen screens must agree on both. */
import type { FoodRequestStatus } from '@/lib/foodRequestTypes';
import { FOOD_STATUS_SHORT } from '@/lib/foodRequests';
import { APP_ENV, APP_HOST } from '@/lib/env';

const STATUS_STYLES: Record<FoodRequestStatus, string> = {
  submitted: 'bg-blue-bg text-blue-text border-blue/20',
  approved: 'bg-green-muted-bg text-green-muted-text border-sage/25',
  ready: 'bg-forest text-paper border-forest',
  picked_up: 'bg-cream-dark text-ink-soft border-border',
  declined: 'bg-red-bg text-red-text border-red/20',
  missed: 'bg-amber-bg text-amber-text border-amber/25',
  cancelled: 'bg-cream-dark text-ink-soft border-border',
};

export function FoodStatusChip({ status, label }: { status: FoodRequestStatus; label?: string }) {
  return (
    <span data-testid="food-status" className={`inline-flex items-center whitespace-nowrap rounded-pill border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}>
      {label ?? FOOD_STATUS_SHORT[status]}
    </span>
  );
}

export function LateChip({ hours }: { hours: number }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-pill border border-amber/40 bg-amber-bg px-2 py-0.5 text-[11px] font-bold text-amber-text">
      Late · {Math.round(hours)}h notice
    </span>
  );
}

/**
 * Where a program's link points. Production prints the app host, the same address the emails
 * use; anywhere else prints the origin actually running, so a test link from staging opens
 * staging instead of quietly pointing at the live site.
 */
export function foodLinkOrigin(): string {
  if (APP_ENV === 'production' || typeof window === 'undefined') return `https://${APP_HOST}`;
  return window.location.origin;
}

export const foodRequestUrl = (token: string) => `${foodLinkOrigin()}/food/${token}`;
export const foodStatusUrl = (token: string) => `${foodLinkOrigin()}/food/status/${token}`;

/** A program's colour dot. Falls back to sage so an uncoloured program still has a mark. */
export function ProgramDot({ color }: { color: string | null }) {
  return <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color || '#5E7A61' }} aria-hidden="true" />;
}

export const PROGRAM_COLORS = ['#B4552F', '#D08C1B', '#5E7A61', '#185fa5', '#6b3fa0', '#1D3A2E', '#8A3D1E', '#3F5D45'];
