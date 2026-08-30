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
): { done: number; total: number } {
  const asked = applicableQuestions(questions, setupAnswers, answers, activeForms);
  return {
    done: asked.filter((q) => (answers[q.questionKey] ?? '') !== '').length,
    total: asked.length,
  };
}
