import { Check, Circle, AlertTriangle } from 'lucide-react';
import { useComplianceStore } from '@/store/complianceStore';
import { NY_FORMS } from '@/lib/compliance/nyPacket';
import type { ComplianceRequirement } from '@/lib/types';

/**
 * The envelope, in the order the county reads it.
 *
 * The Hand-off tab used to be a second copy of the forms list, differing only in that it also
 * offered a zip. That left the actual question unanswered: a camp filing its permit application
 * wants to know what goes in the envelope, whether it is all there, and then to press one button.
 *
 * The permit package is a known, ordered set — Westchester's own application checklist, thirteen
 * items — so this walks it in that order and says, per item, who produces it:
 *
 *   we fill      the platform generates the form from the camp's data
 *   you obtain   it comes from an insurer, an attorney, a notary, the county. Not from us.
 *
 * That second category is the honest half. A camp that thinks the software produces its workers
 * compensation certificate finds out in April.
 */
export function EnvelopePanel({ onOpenForm }: { onOpenForm?: (code: string) => void }) {
  const requirements = useComplianceStore((s) => s.requirements);
  const enabledProfileIds = useComplianceStore((s) => s.enabledProfileIds);
  const statusFor = useComplianceStore((s) => s.statusFor);

  const enabled = new Set(enabledProfileIds);
  const items = requirements
    .filter((r) => r.inPermitPackage && enabled.has(r.profileId))
    .filter((r) => statusFor(r.id)?.status !== 'not_applicable')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (items.length === 0) return null;

  const generated = new Set(NY_FORMS.map((f) => f.code));
  /** The form this requirement is satisfied by, if we are the ones producing it. */
  const ourForm = (r: ComplianceRequirement) => r.formCodes.find((c) => generated.has(c)) ?? null;

  const onRecord = items.filter((r) => statusFor(r.id)?.status === 'satisfied').length;
  const missing = items.length - onRecord;

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-cream-dark flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-forest">What goes in the envelope</p>
          <p className="text-[12.5px] text-ink-soft mt-1 leading-relaxed max-w-[74ch]">
            Westchester&rsquo;s application checklist, in their order. Filed once a year, before you
            open — separate from anything an inspector asks to see on the property.
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`font-display text-[22px] font-semibold tabular-nums ${
            missing === 0 ? 'text-green-muted-text' : 'text-amber-text'}`}>
            {onRecord}<span className="text-ink-faint text-[15px]">/{items.length}</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.11em] text-ink-soft font-bold">
            ready
          </div>
        </div>
      </div>

      <ol>
        {items.map((r, i) => {
          const status = statusFor(r.id)?.status;
          const done = status === 'satisfied';
          const form = ourForm(r);
          return (
            <li key={r.id}
              className="px-5 py-3 border-b border-cream-dark last:border-b-0 flex items-start gap-3">
              <span className="font-mono text-[11px] text-ink-faint w-5 pt-0.5 flex-shrink-0 text-right">
                {i + 1}
              </span>
              <span className="pt-0.5 flex-shrink-0">
                {done
                  ? <Check className="w-3.5 h-3.5 text-green-muted-text" />
                  : <Circle className="w-3.5 h-3.5 text-ink-faint" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink leading-snug">{r.label}</div>
                {r.evidenceHint && (
                  <div className="text-[11.5px] text-ink-soft mt-0.5 leading-snug">
                    {r.evidenceHint}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {form ? (
                  <button
                    onClick={() => onOpenForm?.(form)}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-tag bg-sage/15 text-forest hover:bg-sage/25 transition-colors"
                  >
                    We fill {form}
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-tag bg-cream-dark text-ink-soft">
                    You obtain
                  </span>
                )}
                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-tag whitespace-nowrap ${
                  done ? 'bg-green-muted-bg text-green-muted-text' : 'bg-red-bg text-red-text'}`}>
                  {done ? 'On record' : 'Not yet'}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {missing > 0 && (
        <p className="px-5 py-3 border-t border-cream-dark text-[11.5px] text-amber-text inline-flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {missing} item{missing === 1 ? '' : 's'} not on record. The packet still builds — it
          carries what you have, and the index names what is absent, so nothing reads as covered
          when it is not.
        </p>
      )}
    </div>
  );
}
