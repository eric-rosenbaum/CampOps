/**
 * A structural check that the Records page shows every requirement exactly once.
 *
 * The claim the product makes is that "Your records" is the complete set of what this camp owes,
 * grouped by who asks for it. That claim is only worth anything if it is enforced, because the
 * failure is silent: a requirement that falls through every bucket simply is not on the page,
 * and nobody notices until an inspector does.
 *
 * Exported so a dev-mode assertion and a test can both use it.
 */
import type { ComplianceRequirement } from '@/lib/types';
import type { AuthorityWork } from './complianceStore';

export interface CoverageProblem {
  kind: 'missing' | 'duplicated' | 'unattributed';
  reqCode: string;
  detail: string;
}

/**
 * @param expected every requirement in an enabled package (the source of truth)
 * @param byAuthority what the page will actually render, keyed by authority id
 */
export function auditRecordsCoverage(
  expected: ComplianceRequirement[],
  byAuthority: Map<string, AuthorityWork>,
): CoverageProblem[] {
  const problems: CoverageProblem[] = [];
  const seen = new Map<string, number>();

  for (const work of byAuthority.values()) {
    // Every bucket, or the audit reports a requirement missing that is on screen. `forms` was
    // added after this list and left out of it, which is exactly the failure this check exists
    // to catch -- it caught it. Adding a bucket to AuthorityWork means adding it here.
    for (const bucket of [
      work.records, work.forms, work.documents, work.plan, work.unanswered, work.notApplicable,
    ]) {
      for (const r of bucket) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
    }
  }

  for (const r of expected) {
    const count = seen.get(r.id) ?? 0;
    if (count === 0) {
      problems.push({
        kind: r.authorityId ? 'missing' : 'unattributed',
        reqCode: r.reqCode,
        detail: r.authorityId
          ? 'in an enabled package but rendered in no bucket'
          : 'has no authority, so it appears under no reviewer',
      });
    } else if (count > 1) {
      problems.push({
        kind: 'duplicated', reqCode: r.reqCode,
        detail: `rendered ${count} times`,
      });
    }
  }

  return problems;
}
