import type { Priority } from '@/lib/types';

interface Props {
  priority: Priority;
}

const config: Record<Priority, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'text-red border-red' },
  high: { label: 'High', className: 'text-amber-text border-amber' },
  normal: { label: 'Normal', className: 'text-sage border-sage' },
};

export function PriorityBadge({ priority }: Props) {
  const { label, className } = config[priority];
  return (
    <span className={`inline-flex items-center rounded-tag border px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.1em] ${className}`}>
      {label}
    </span>
  );
}
