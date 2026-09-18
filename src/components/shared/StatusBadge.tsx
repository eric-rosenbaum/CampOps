import type { IssueStatus, ChecklistStatus } from '@/lib/types';
import { useTranslation } from 'react-i18next';

interface Props {
  status: IssueStatus | ChecklistStatus;
}

const tone: Record<string, string> = {
  unassigned: 'text-red border-red',
  assigned: 'text-amber-text border-amber',
  in_progress: 'text-amber-text border-amber',
  waiting_on_vendor: 'text-amber-text border-amber',
  waiting_on_part: 'text-amber-text border-amber',
  resolved: 'text-sage border-sage',
  pending: 'text-ink-soft border-border',
  complete: 'text-sage border-sage',
};

export function StatusBadge({ status }: Props) {
  const { t } = useTranslation(['common', 'shell']);
  const className = tone[status] ?? '';
  const label: string = status === 'pending' || status === 'complete'
    ? t(`shell:status.${status}`)
    : status in tone ? t(`common:status.${status as IssueStatus}`) : status;
  return (
    <span className={`inline-flex items-center rounded-tag border px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.1em] ${className}`}>
      {label}
    </span>
  );
}
