import { applicableQuestions } from './formAnswers';
import type { ComplianceFormQuestion } from '@/lib/types';

/**
 * How far through the questions the forms ask this camp actually is.
 *
 * Lives outside the panel so the Overview can show the same number without importing a
 * component, and so both read one definition of "asked": a question gated on a pool is not an
 * outstanding question for a camp without one.
 */
export function detailsProgress(
  questions: ComplianceFormQuestion[],
  setupAnswers: Record<string, string>,
  answers: Record<string, string>,
  activeForms?: Set<string>,
): { done: number; total: number; requiredLeft: number } {
  const asked = applicableQuestions(questions, setupAnswers, answers, activeForms);
  const blank = asked.filter((q) => (answers[q.questionKey] ?? '') === '');
  return {
    done: asked.length - blank.length,
    total: asked.length,
    /**
     * What is actually holding the packet up.
     *
     * Most of the blanks are not holding anything up: an unticked "Do you offer archery?" is
     * the answer no, and a blank typed signature prints an empty rule for a wet one. Counting
     * those told a camp seven questions stood between them and filing when the form was ready.
     */
    requiredLeft: blank.filter((q) => q.required).length,
  };
}
