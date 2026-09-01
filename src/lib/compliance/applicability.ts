import type { ComplianceAnswers } from '@/lib/types';

/**
 * Does this rule apply to this camp, three-valued, mirroring `compliance_applicability()` in
 * Postgres exactly.
 *
 * Two implementations of the same test is a bug waiting to happen, and this one had already
 * started: the SQL grew an `any_of` branch so that a waterfront-only camp gets the aquatics
 * rules, and the browser kept ANDing every key — which would have read `any_of` as a literal
 * setup answer, found nothing, and hidden the rule. Nothing exercised it only because no
 * *question* used `any_of` yet. This file is now the one client-side reading, and it is written
 * to match the SQL line for line.
 *
 * The third value is the point. "You told us you have no rifle range" and "we never asked" must
 * never both render as *does not apply*: the second stays in the denominator and asks the
 * question.
 */
export type Applicability = 'yes' | 'no' | 'unknown';

const norm = (v: unknown) => String(v ?? '').trim().replace(/^"|"$/g, '').toLowerCase();

export function applicability(
  answers: ComplianceAnswers | Record<string, string>,
  appliesWhen: Record<string, unknown> | null | undefined,
): Applicability {
  const when = appliesWhen ?? {};
  if (Object.keys(when).length === 0) return 'yes';

  let unknownAnd = false;

  // Top-level keys are ANDed. One definite mismatch settles it; an unanswered one leaves the
  // answer open rather than resolving it against the camp.
  for (const [k, want] of Object.entries(when)) {
    if (k === 'any_of') continue;
    const got = norm((answers as Record<string, string>)[k]);
    if (got === '') unknownAnd = true;
    else if (norm(want) !== got) return 'no';
  }

  // `any_of` is ORed: a camp with either a pool or a waterfront gets the aquatics rules. One
  // definite hit settles the group even if a sibling is unanswered — knowing they have a pool is
  // enough, whether or not we know about the lake.
  const anyOf = when.any_of as Record<string, unknown> | undefined;
  if (anyOf && Object.keys(anyOf).length > 0) {
    let hit = false;
    let unknownOr = false;
    for (const [k, want] of Object.entries(anyOf)) {
      const got = norm((answers as Record<string, string>)[k]);
      if (got === '') unknownOr = true;
      else if (norm(want) === got) hit = true;
    }
    if (!hit) return unknownOr ? 'unknown' : 'no';
  }

  return unknownAnd ? 'unknown' : 'yes';
}

/** The keys we would need answered before we could decide. Drives "needs an answer". */
export function unansweredKeys(
  answers: ComplianceAnswers | Record<string, string>,
  appliesWhen: Record<string, unknown> | null | undefined,
): string[] {
  const when = appliesWhen ?? {};
  const keys = [
    ...Object.keys(when).filter((k) => k !== 'any_of'),
    ...Object.keys((when.any_of as Record<string, unknown>) ?? {}),
  ];
  return keys
    .filter((k) => norm((answers as Record<string, string>)[k]) === '')
    .sort();
}
