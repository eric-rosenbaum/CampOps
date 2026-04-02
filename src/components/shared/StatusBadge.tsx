import type { IssueStatus, ChecklistStatus } from '@/lib/types';

interface Props {
  status: IssueStatus | ChecklistStatus;
}

const config: Record<string, { label: string; className: string }> = {
  unassigned: { label: 'Unassigned', className: 'bg-red-bg text-red border-red/20' },
  assigned: { label: 'Assigned', className: 'bg-amber-bg text-amber-text border-amber/20' },
  in_progress: { label: 'In progress', className: 'bg-amber-bg text-amber-text border-amber/20' },
  resolved: { label: 'Resolved', className: 'bg-green-muted-bg text-green-muted-text border-sage/20' },
  pending: { label: 'Pending', className: 'bg-cream-dark text-forest/60 border-border' },
  complete: { label: 'Complete', className: 'bg-green-muted-bg text-green-muted-text border-sage/20' },
};

export function StatusBadge({ status }: Props) {
  const { label, className } = config[status] ?? { label: status, className: '' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium border ${className}`}>
      {label}
    </span>
  );
}
