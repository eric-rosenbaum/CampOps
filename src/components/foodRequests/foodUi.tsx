/* eslint-disable react-refresh/only-export-components --
 * The link helpers and the chip that labels a status are small enough to live together, and the
 * public pages and the kitchen screens must agree on both. */
import { useState } from 'react';
import type { FoodRequestStatus } from '@/lib/foodRequestTypes';
import { FOOD_STATUS_SHORT, shortNoticeLabel } from '@/lib/foodRequests';
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

/** "Short notice · 44h" — the one way short notice is said to the kitchen. */
export function LateChip({ hours }: { hours: number }) {
  return (
    <span data-testid="short-notice-chip" className="inline-flex items-center whitespace-nowrap rounded-pill border border-amber/40 bg-amber-bg px-2 py-0.5 text-[11px] font-bold text-amber-text">
      {shortNoticeLabel(hours)}
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

/** A new program's colour: the first one no program uses yet, so two dots on a card never match. */
export function nextProgramColor(used: (string | null)[]): string {
  const taken = new Set(used.filter(Boolean).map((c) => c!.toLowerCase()));
  return PROGRAM_COLORS.find((c) => !taken.has(c.toLowerCase())) ?? PROGRAM_COLORS[used.length % PROGRAM_COLORS.length];
}

export interface FoodToastState {
  message: string;
  /** Present only where taking it back is safe. */
  undo?: () => void | Promise<void>;
}

/**
 * What just happened, with Undo where it is safe. Bottom-centre, above a phone's home indicator,
 * and announced to screen readers. Approving used to close the dialog with no word at all.
 */
export function FoodToast({ toast, onClose }: { toast: FoodToastState | null; onClose: () => void }) {
  const [undoing, setUndoing] = useState(false);
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" data-testid="food-toast"
      className="fixed inset-x-3 z-[70] mx-auto flex max-w-[560px] items-center gap-3 rounded-card bg-forest px-4 py-3 text-[13.5px] text-paper shadow-xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
      <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
      {toast.undo && (
        <button type="button" disabled={undoing} data-testid="toast-undo"
          onClick={async () => { setUndoing(true); try { await toast.undo!(); } finally { setUndoing(false); } }}
          className="flex-shrink-0 rounded-btn border border-paper/40 px-3 py-1.5 text-[13px] font-bold hover:bg-paper/10 disabled:opacity-60">
          {undoing ? 'Undoing…' : 'Undo'}
        </button>
      )}
      <button type="button" onClick={onClose} aria-label="Dismiss" className="flex-shrink-0 px-1 text-paper/70 hover:text-paper">×</button>
    </div>
  );
}
