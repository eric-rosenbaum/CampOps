import type { IssueStatus, ChecklistStatus } from '@/lib/types';

interface Props {
  status: IssueStatus | ChecklistStatus;
}

const config: Record<string, { label: string; className: string }> = {
  unassigned: { label: 'Unassigned', className: 'text-red border-red' },
  assigned: { label: 'Assigned', className: 'text-amber-text border-amber' },
  in_progress: { label: 'In progress', className: 'text-amber-text border-amber' },
  resolved: { label: 'Resolved', className: 'text-sage border-sage' },
  pending: { label: 'Pending', className: 'text-ink-soft border-border' },
  complete: { label: 'Complete', className: 'text-sage border-sage' },
};

export function StatusBadge({ status }: Props) {
  const { label, className } = config[status] ?? { label: status, className: '' };
  return (
    <span className={`inline-flex items-center rounded-tag border px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.1em] ${className}`}>
      {label}
    </span>
  );
}
