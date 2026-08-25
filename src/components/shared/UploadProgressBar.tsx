import { Check, Loader2 } from 'lucide-react';
import { STAGE_CEILING, type UploadStatus } from '@/lib/uploadProgress';

/**
 * Where an upload has got to, and what it is still waiting on.
 *
 * The stage ticks matter as much as the bar. Reaching the end of the transfer and then sitting
 * still for two seconds while the record is written and read back looks like a stall unless
 * the page says what it is doing, and the whole reason those seconds exist is that finishing
 * the transfer is not the same as having a document you can open.
 */
export function UploadProgressBar({ status, fileName }: { status: UploadStatus; fileName?: string }) {
  const done = status.stage === 'done';
  const failed = status.stage === 'failed';

  const ticks: { key: keyof typeof STAGE_CEILING; label: string }[] = [
    { key: 'uploading', label: 'Upload' },
    { key: 'saving', label: 'Save' },
    { key: 'verifying', label: 'Open it' },
  ];

  return (
    <div className="rounded-card border border-border bg-cream px-4 py-3.5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[12.5px] font-semibold text-forest inline-flex items-center gap-1.5 min-w-0">
          {done ? <Check className="w-3.5 h-3.5 text-sage flex-shrink-0" />
            : !failed && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-soft flex-shrink-0" />}
          <span className="truncate">{done ? 'Ready to open' : status.label}</span>
        </p>
        <span className="font-mono text-[12px] text-ink-soft flex-shrink-0 tabular-nums">
          {status.percent}%
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${failed ? 'bg-red' : 'bg-sage'}`}
          style={{ width: `${status.percent}%` }}
        />
      </div>

      <div className="flex items-center gap-3 mt-2">
        {ticks.map((t) => {
          const passed = status.percent >= STAGE_CEILING[t.key];
          const current = !passed && !failed && status.stage === t.key;
          return (
            <span
              key={t.key}
              className={`text-[10.5px] font-semibold uppercase tracking-wide ${
                passed ? 'text-sage' : current ? 'text-forest' : 'text-ink-faint'
              }`}
            >
              {passed ? '✓ ' : ''}{t.label}
            </span>
          );
        })}
        {fileName && <span className="ml-auto text-[10.5px] text-ink-faint truncate max-w-[45%]">{fileName}</span>}
      </div>
    </div>
  );
}
