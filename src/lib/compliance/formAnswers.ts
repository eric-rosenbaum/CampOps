import type { ComplianceFormQuestion, FormAnswers } from '@/lib/types';
import type { FormValues } from './formFiller';
import { applicability } from './applicability';

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
  field?: string;
  /** Which piece of the answer this cell takes. */
  part: 'text' | 'month' | 'day' | 'year' | 'check' | 'flow';
  /** For check parts: the answer value that ticks this box. */
  when?: string;
  /** For flow parts: the printed rules to fill, in order. */
  fields?: string[];
  /** For flow parts: how many characters fit on one of those rules. */
  chars?: number;
}

/**
 * Lay prose across a fixed run of short printed rules.
 *
 * DOH-367 gives six rules of about 22 characters beside the activity grid, shared between every
 * starred activity a camp ticked. The camp writes what they run; deciding which words land on
 * rule four is the renderer's job. Breaks on spaces, and only splits a word that could not fit
 * on a rule of its own.
 */
export function flowIntoRules(text: string, chars: number, rules: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line === '') {
      line = word;
    } else if (line.length + 1 + word.length <= chars) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
    while (line.length > chars) {
      lines.push(line.slice(0, chars));
      line = line.slice(chars);
    }
  }
  if (line !== '') lines.push(line);
  return lines.slice(0, rules);
}

/** How the camp's starred-activity answers are joined before they are laid out. */
export const FLOW_JOIN = '; ';

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

  // Flow answers are pooled before they are placed: several questions share one run of printed
  // rules, so no one of them knows where its own text starts. Collected in question order so the
  // layout does not change with the order rows came back from the database.
  const flows = new Map<string, { fields: string[]; chars: number; parts: string[] }>();

  for (const q of [...questions].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const raw = answers[q.questionKey];
    if (raw === undefined || raw === null || raw === '') continue;

    for (const r of (q.renders ?? []) as unknown as Render[]) {
      if (r.form !== formCode) continue;

      if (r.part === 'flow') {
        if (!r.fields?.length) continue;
        const key = r.fields.join('|');
        const pool = flows.get(key) ?? { fields: r.fields, chars: r.chars ?? 24, parts: [] };
        pool.parts.push(raw.trim());
        flows.set(key, pool);
        continue;
      }
      if (!r.field) continue;

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
          //
          // A multi answer is a list, and each render is one box in the grid, so the test is
          // membership rather than equality. This is what lets the twenty-three-box activity
          // grid be one question instead of twenty-three.
          if (r.when === undefined) break;
          if (q.answerKind === 'multi') {
            if (raw.split(',').includes(r.when)) values[r.field] = true;
          } else if (String(raw) === r.when) {
            values[r.field] = true;
          }
          break;
      }
    }
  }

  for (const { fields, chars, parts } of flows.values()) {
    const lines = flowIntoRules(parts.join(FLOW_JOIN), chars, fields.length);
    lines.forEach((line, i) => { values[fields[i]] = line; });
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
  /** The documents in scope. A question that prints only on a parked form is not asked. */
  activeForms?: Set<string>,
): ComplianceFormQuestion[] {

  return questions.filter((q) => {
    // Only ask what lands on a document we are showing. "If the plan was revised, who added the
    // revisions?" is a DOH-2040 question, and asking it while that form is switched off is
    // asking for an answer with nowhere to print.
    if (activeForms) {
      const targets = new Set(
        (q.renders ?? []).map((r) => (r as { form?: string }).form).filter(Boolean) as string[],
      );
      if (targets.size > 0 && ![...targets].some((f) => activeForms.has(f))) return false;
    }
    // Shared with the engine: `applicability()` mirrors compliance_applicability() in Postgres,
    // including the `any_of` branch this used to read as a literal setup key.
    if (applicability(setupAnswers, q.appliesWhen) !== 'yes') return false;
    // A follow-up only exists once its parent has been answered. "If other, what qualification?"
    // is not an outstanding question for a camp whose health director is a nurse.
    if (q.dependsOn) {
      const parent = formAnswers[q.dependsOn];
      if (!parent) return false;
      if (q.dependsOnValue) {
        // A multi parent holds a list, so "ask this when they ticked high adventure" is a
        // membership test. Without it, "Which high adventure activities do you run?" would only
        // appear for a camp that ticked high adventure and nothing else.
        const parentQ = questions.find((x) => x.questionKey === q.dependsOn);
        const hit = parentQ?.answerKind === 'multi'
          ? parent.split(',').includes(q.dependsOnValue)
          : parent === q.dependsOnValue;
        if (!hit) return false;
      }
    }
    return true;
  });
}
