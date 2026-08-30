import type { ComplianceFormQuestion, FormAnswers } from '@/lib/types';
import type { FormValues } from './formFiller';

/**
 * Turns the camp's answers into the cells they fill on a form.
 *
 * The catalog holds questions, not fields. That distinction is the whole point: every date is
 * three cells on the page, every choice is a row of tick boxes, and the operator's printed name
 * appears on four different forms. Keyed on fields, a director would be asked for the month, the
 * day and the year of the same birthday as three separate prompts, three times over. One
 * question therefore carries a `renders` projection saying where its answer lands.
 *
 * Nothing here invents a value. A question with no answer produces no cells, and a choice
 * produces exactly the one tick its answer names.
 */

interface Render {
  form: string;
  field: string;
  /** Which piece of the answer this cell takes. */
  part: 'text' | 'month' | 'day' | 'year' | 'check';
  /** For check parts: the answer value that ticks this box. */
  when?: string;
}

/**
 * Blanks on these forms are ~18pt wide, so the maps ask for a two-digit year.
 *
 * Sliced to ten characters first: a value arriving as a full timestamp would otherwise put
 * "14T04:00:00.000Z" in the day box, which renders as "14..." and reads as a real date that has
 * been cut off rather than as the bug it is.
 */
function datePart(iso: string, part: 'month' | 'day' | 'year'): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  return part === 'month' ? m : part === 'day' ? d : y.slice(2);
}

export function answerValues(formCode: string, questions: ComplianceFormQuestion[], answers: FormAnswers): FormValues {
  const values: FormValues = {};

  for (const q of questions) {
    const raw = answers[q.questionKey];
    if (raw === undefined || raw === null || raw === '') continue;

    for (const r of (q.renders ?? []) as unknown as Render[]) {
      if (r.form !== formCode) continue;

      switch (r.part) {
        case 'text':
          values[r.field] = raw;
          break;
        case 'month':
        case 'day':
        case 'year': {
          const piece = datePart(raw, r.part);
          if (piece) values[r.field] = piece;
          break;
        }
        case 'check':
          // A tick is drawn only for the value it belongs to. Booleans arrive as the strings
          // "true" and "false", so a false answer ticks nothing, which is correct: these forms
          // mostly have no "no" box and a blank means the same thing.
          if (r.when !== undefined && String(raw) === r.when) values[r.field] = true;
          break;
      }
    }
  }

  return values;
}

/**
 * Which questions this camp is actually being asked, given its setup answers and what it has
 * already said. A question gated on a pool is not a gap for a camp without one.
 */
export function applicableQuestions(
  questions: ComplianceFormQuestion[],
  setupAnswers: Record<string, string>,
  formAnswers: FormAnswers,
): ComplianceFormQuestion[] {
  const matches = (when: Record<string, string>) =>
    Object.entries(when).every(([k, v]) =>
      (setupAnswers[k] ?? '').toLowerCase().replace(/^"|"$/g, '') === String(v).toLowerCase());

  return questions.filter((q) => {
    if (Object.keys(q.appliesWhen ?? {}).length > 0 && !matches(q.appliesWhen)) return false;
    // A follow-up only exists once its parent has been answered. "If other, what qualification?"
    // is not an outstanding question for a camp whose health director is a nurse.
    if (q.dependsOn) {
      const parent = formAnswers[q.dependsOn];
      if (!parent) return false;
      if (q.dependsOnValue && parent !== q.dependsOnValue) return false;
    }
    return true;
  });
}
