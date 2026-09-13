import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';

/**
 * Required fields, and a save button that says why it will not save.
 *
 * A greyed-out button is the worst possible answer to "why can't I finish this?": it refuses
 * and explains nothing, and because a genuinely `disabled` button does not fire a click, the
 * one moment somebody asks the question is the one moment nothing can answer it. Camps were
 * clicking dead buttons and guessing.
 *
 * So the button here is never really disabled. It LOOKS unavailable, which is honest — pressing
 * it will not save — but it accepts the click and names what is still empty. The fields it names
 * carry a marker, so the answer is findable before the click too.
 */

/** The marker beside a label. `title` rather than a legend: a legend is read by nobody. */
export function Req() {
  return (
    <span className="text-red/80 font-normal" title="Required" aria-hidden="true">
      {' '}*
    </span>
  );
}

/** "a group name and an arrival date" — an English list, not a comma-separated dump. */
function readable(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function GuardedSave({
  missing, onSave, label = 'Save', variant = 'primary', size = 'md', busy = false, className = '',
  children,
}: {
  /**
   * What is still empty, named the way the person filling the form would say it: "a group
   * name", "an arrival date". Empty means the form is ready.
   */
  missing: string[];
  onSave: () => void;
  label?: string;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  busy?: boolean;
  className?: string;
  /** Replaces the label when the button needs an icon beside its text. */
  children?: React.ReactNode;
}) {
  const blocked = missing.length > 0;
  /**
   * What was missing at the moment they asked. Remembering the LIST rather than a boolean means
   * the complaint clears itself the instant they fill something in -- no effect, no stale
   * message sitting under a form that is now perfectly valid.
   */
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const key = missing.join('|');
  const show = blocked && askedFor === key;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Button
        type="button"
        variant={variant}
        size={size}
        // Not `disabled`: a disabled button swallows the click, and the click is the question.
        aria-disabled={blocked || busy}
        onClick={() => {
          if (busy) return;
          if (blocked) { setAskedFor(key); return; }
          onSave();
        }}
        className={blocked || busy ? 'opacity-40 cursor-not-allowed' : ''}
      >
        {children ?? label}
      </Button>

      {show && (
        <p role="alert" className="flex items-start gap-1.5 text-[11.5px] text-red leading-snug">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
          <span>Add {readable(missing)} first.</span>
        </p>
      )}
    </div>
  );
}
