import { useComplianceStore } from '@/store/complianceStore';
import { SourceLink } from './SourceLink';

/**
 * What changed since last season, and whether it touches this camp.
 *
 * Regulators do not announce themselves. Westchester reissues its packet each season, the county
 * board amended the sanitary code in August, the state sends an operator letter every spring —
 * and a camp finds out at the workshop, or when an inspector mentions it. So every source behind
 * a requirement is fingerprinted when we read it, and a changed fingerprint becomes an entry
 * here.
 *
 * The filter is the valuable half. A camp with no rifle range does not need to hear that the
 * riflery form was revised, and a change that does not touch them is still shown — quietly — so
 * the absence of noise is visible rather than suspicious.
 */
export function WhatsNewPanel() {
  const changes = useComplianceStore((s) => s.changesForCamp)();
  const mine = changes.filter((c) => c.affectsYou);
  const others = changes.filter((c) => !c.affectsYou);

  if (changes.length === 0) {
    return (
      <p className="text-[13px] text-ink-faint italic py-8 text-center">
        Nothing has changed in the documents behind your obligations since we last read them.
      </p>
    );
  }

  return (
    <div>
      <p className="text-[12.5px] text-ink-soft mb-4">
        {mine.length} of {changes.length} {changes.length === 1 ? 'change affects' : 'changes affect'} your camp.
      </p>

      <div className="bg-white border border-border rounded-card overflow-hidden">
        {[...mine, ...others].map(({ version, source, affectsYou }) => (
          <div key={version.id} className="px-4 py-3.5 border-b border-cream-dark last:border-b-0">
            <div className="grid grid-cols-[86px_1fr] gap-4">
              <div>
                <div className="font-mono text-[11px] text-ink-soft">
                  {(version.effectiveDate ?? version.retrievedAt).slice(0, 10)}
                </div>
                <div className={`text-[10.5px] font-semibold mt-0.5 ${
                  affectsYou ? 'text-red-text' : 'text-ink-faint'}`}>
                  {affectsYou ? 'affects you' : 'no effect'}
                </div>
              </div>
              <div className="min-w-0">
                <h4 className="text-[13px] font-bold text-forest">
                  {source.title}
                  {version.revisionLabel && (
                    <span className="font-normal text-ink-soft"> · {version.revisionLabel}</span>
                  )}
                </h4>
                {version.changeSummary && (
                  <p className="text-[12.5px] text-ink-soft mt-1 leading-relaxed max-w-[74ch]">
                    {version.changeSummary}
                  </p>
                )}
                {(version.affects.req_codes ?? []).length > 0 && affectsYou && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {(version.affects.req_codes ?? []).map((code) => (
                      <span key={code}
                        className="font-mono text-[10.5px] px-1.5 py-0.5 rounded-tag bg-red-bg text-red-text">
                        {code}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <SourceLink source={source} checkedOn={version.retrievedAt.slice(0, 10)} />
                  {version.sha256 && (
                    <span className="font-mono text-[10px] text-ink-faint">
                      {version.sha256.slice(0, 12)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
