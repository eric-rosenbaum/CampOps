import type { ActivityEntry } from '@/lib/types';
import { relativeTime } from '@/lib/utils';

interface Props {
  entries: ActivityEntry[];
}

export function ActivityFeed({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="text-[12px] text-ink-soft italic">No activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="flex gap-2.5">
          <div className="mt-1.5 w-2 h-2 rounded-full bg-sage flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-forest leading-snug">{entry.action}</p>
            <p className="text-[11px] text-ink-soft mt-0.5">
              {entry.userName} · {relativeTime(entry.timestamp)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
