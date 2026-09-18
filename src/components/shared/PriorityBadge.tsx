import type { Priority } from '@/lib/types';
import { useTranslation } from 'react-i18next';

interface Props {
  priority: Priority;
}

const tone: Record<Priority, string> = {
  urgent: 'text-red border-red',
  high: 'text-amber-text border-amber',
  normal: 'text-sage border-sage',
};

export function PriorityBadge({ priority }: Props) {
  const { t } = useTranslation();
  const className = tone[priority];
  const label = t(`priority.${priority}`);
  return (
    <span className={`inline-flex items-center rounded-tag border px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.1em] ${className}`}>
      {label}
    </span>
  );
}
