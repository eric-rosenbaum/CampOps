import { ExternalLink, Archive } from 'lucide-react';
import type { ComplianceSource } from '@/lib/types';

/**
 * Where a claim came from, as a link the camp can open.
 *
 * Nothing in this module tells a camp it owes something without showing them the document that
 * says so. That is partly good manners and mostly self-defence: a director who is going to sign
 * a government form on the strength of what we told them should be one click from the text.
 *
 * The archived case is the interesting one. Some sources publish at a URL that carries their own
 * revision date — the county sanitary code is "CHAPTER 873 FINAL VERSION APPROVED 8-5-25.pdf" —
 * so the link a camp follows next season will 404 on exactly the documents that changed. For
 * those we hold a copy and say so, because a dead link on a compliance claim is worse than no
 * link at all.
 */
export function SourceLink({ source, label, checkedOn, className = '' }: {
  source: ComplianceSource | null;
  /** Overrides the source title — usually the section number the requirement cites. */
  label?: string | null;
  checkedOn?: string | null;
  className?: string;
}) {
  if (!source?.url && !label) return null;
  const text = label ?? source?.title ?? 'Source';
  const archived = source ? !source.urlStable : false;

  const inner = (
    <>
      {archived ? <Archive className="w-3 h-3 flex-shrink-0" /> : <ExternalLink className="w-3 h-3 flex-shrink-0" />}
      <span className="truncate">{text}</span>
    </>
  );

  const base = `inline-flex items-center gap-1 font-mono text-[10.5px] text-ink-faint hover:text-sage max-w-full ${className}`;

  if (!source?.url) return <span className={base}>{inner}</span>;

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={base}
      title={archived
        ? `${source.title}. This URL changes when the document is reissued, so we keep a copy${checkedOn ? `, last checked ${checkedOn}` : ''}.`
        : `${source.title}${checkedOn ? ` · last checked ${checkedOn}` : ''}`}
    >
      {inner}
    </a>
  );
}
