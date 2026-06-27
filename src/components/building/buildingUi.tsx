import {
  Zap, Droplet, Plug, Lightbulb, ToggleLeft, Sun, Power, Gauge,
  Flame, Waves, ShowerHead, CircleDot, Wrench, type LucideIcon,
} from 'lucide-react';
import type { ComponentStatus } from '@/lib/types';
import { STATUS_LABELS } from '@/store/buildingStore';

const STATUS_STYLES: Record<ComponentStatus, { dot: string; badge: string }> = {
  operational:    { dot: 'bg-sage',  badge: 'bg-green-muted-bg text-green-muted-text border-sage/20' },
  needs_attention:{ dot: 'bg-amber', badge: 'bg-amber-bg text-amber-text border-amber/20' },
  out_of_service: { dot: 'bg-red',   badge: 'bg-red-bg text-red border-red/20' },
};

export function StatusDot({ status }: { status: ComponentStatus }) {
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_STYLES[status].dot}`} />;
}

export function ComponentStatusBadge({ status }: { status: ComponentStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[11px] font-medium border ${STATUS_STYLES[status].badge}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

const COMPONENT_ICONS: Record<string, LucideIcon> = {
  breaker_panel: Power,
  sub_panel: Power,
  outlet: Plug,
  light_fixture: Lightbulb,
  switch: ToggleLeft,
  exterior_light: Sun,
  generator: Power,
  transfer_switch: ToggleLeft,
  other_electrical: Zap,
  shutoff_valve: Gauge,
  water_heater: Flame,
  well_pump: Waves,
  backflow_preventer: Gauge,
  toilet: Droplet,
  sink: Droplet,
  shower: ShowerHead,
  urinal: Droplet,
  water_fountain: Droplet,
  hose_bib: Droplet,
  sump_pump: Waves,
  septic: CircleDot,
  other_plumbing: Wrench,
};

// Rendered as a component (not via a function call that returns a component) so
// the icon is selected by member access — the pattern the static-components lint
// rule allows.
export function ComponentIcon({ type, className }: { type: string; className?: string }) {
  const Icon = COMPONENT_ICONS[type] ?? Wrench;
  return <Icon className={className} />;
}
