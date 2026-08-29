import { useMemo } from 'react';
import { useComplianceStore } from '@/store/complianceStore';

/**
 * What these packages cover, and what they do not.
 *
 * The module reads well because it turns a filing cabinet into a percentage, and a percentage
 * invites a camp to stop looking. This note is the counterweight: it states the boundary of
 * what was checked, in the same place the number is shown, so nobody reads 100% as "we are
 * cleared to open." It is deliberately plain and slightly deflating.
 */
export function ScopeNote() {
  const requirements = useComplianceStore((s) => s.requirements);
  const enabledProfileIds = useComplianceStore((s) => s.enabledProfileIds);

  const unverified = useMemo(() => {
    const enabled = new Set(enabledProfileIds);
    return requirements.filter(
      (r) => enabled.has(r.profileId) && r.verifyStatus !== 'verified',
    ).length;
  }, [requirements, enabledProfileIds]);

  return (
    <div className="bg-cream-dark/60 rounded-card border border-border px-5 py-4 mt-2">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">
        What this covers
      </p>
      <div className="text-[11.5px] text-ink-soft mt-2 space-y-2 leading-relaxed max-w-[70ch]">
        <p>
          These packages track the New York State children's camp regulation (10 NYCRR Subpart
          7-2) and the items your county asks for at permit time. They are a working record of
          what you have on file, not a legal opinion and not a clearance to operate. Your
          permit is issued by your local health department, and their reading of a rule is the
          one that counts.
        </p>
        <p>
          Some rules that apply to your camp sit outside these packages and are not tracked
          here. Swimming pools and bathing beaches are regulated separately from the camp code,
          as are food service, building and fire code, vehicle and driver licensing, and
          employment law. A camp can be at 100% here and still owe paperwork elsewhere.
        </p>
        <p>
          Status is computed from what your staff have recorded in CampCommand. A requirement
          reads as met because the record exists, which is not the same as the underlying work
          having been done correctly.
        </p>
        {unverified > 0 && (
          <p>
            {unverified} of the requirements in your enabled packages are drawn from our
            reading of the regulation and have not yet been confirmed against the published
            text. Those are shown without a citation link. Check them against the rule itself
            before relying on them.
          </p>
        )}
      </div>
    </div>
  );
}
