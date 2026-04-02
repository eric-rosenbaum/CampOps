import type { Priority } from '@/lib/types';

interface Props {
  priority: Priority;
}

const config: Record<Priority, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-red-bg text-red border-red/20' },
  high: { label: 'High', className: 'bg-amber-bg text-amber-text border-amber/20' },
  normal: { label: 'Normal', className: 'bg-green-muted-bg text-green-muted-text border-sage/20' },
};

export function PriorityBadge({ priority }: Props) {
  const { label, className } = config[priority];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium border ${className}`}>
      {label}
    </span>
  );
}
