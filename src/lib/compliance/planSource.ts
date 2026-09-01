import type { CompliancePlanSection, ComplianceDocument, PlanAnswers } from '@/lib/types';

/**
 * Where a camp's written safety plan comes from.
 *
 * There are only ever three answers, and everything that touches the plan — the packet, the
 * DOH-367 readiness block, the plan page — has to give the same one. Two places deciding this
 * independently is how a zip comes to contain a plan the screen says does not exist.
 *
 *   uploaded  the camp's own document, which we carry unchanged
 *   written   the sections written in the builder, which we render
 *   none      neither, and the packet carries no plan at all
 *
 * `uploaded` wins when both exist. The uploaded file is the document the county has seen and the
 * one the camp thinks of as "our plan"; shipping our rendering of half-written sections instead
 * would substitute our document for theirs on a filing they sign.
 */
export type PlanSource = 'uploaded' | 'written' | 'none';

/** Marks the document row that IS the plan. Ordinary evidence carries a null `docType`. */
export const PLAN_DOC_TYPE = 'written_plan';

/** DOH-367's three-way question about the plan: attached, previously sent, or update attached. */
export const PLAN_STATUS_QUESTION = 'ny.safety_plan.previously_submitted';

/**
 * The camp's uploaded plan, if they have one.
 *
 * A superseded row is a previous version kept for the record, never the current plan. The
 * newest wins among live rows, though the unique index means there is only ever one.
 */
export function planDocumentIn(documents: ComplianceDocument[]): ComplianceDocument | null {
  const live = documents
    .filter((d) => d.docType === PLAN_DOC_TYPE)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return live[0] ?? null;
}

/**
 * Is there a plan in the builder worth carrying?
 *
 * Deliberately not "has sections": setup lays down all ninety-six the moment a camp finishes the
 * interview, so counting rows would say every camp has written a plan. Deliberately not
 * "includes not_applicable" either — a camp that ruled three sections out and wrote nothing has
 * made no plan, and rendering ninety-three pages of "Not written yet" would hand a reviewer a
 * document that argues against the camp.
 *
 * A single answer to the state's template counts, because unlike the DOH-2040 sections those rows
 * exist only where a camp put something. `dbSavePlanAnswer` deletes an answer emptied back out,
 * so a camp cannot look like it started a plan by clicking into a checkbox and off again.
 */
export function planIsWritten(
  sections: CompliancePlanSection[], planAnswers: PlanAnswers = {},
): boolean {
  if (Object.keys(planAnswers).length > 0) return true;
  return sections.some((s) => s.status === 'complete' || Boolean(s.body && s.body.trim()));
}

/**
 * How many sections would actually appear as writing in the plan we render.
 *
 * Not `planProgress`, which counts "dealt with" (a section ruled out is progress) and is the
 * right number for the plan page. This one is used where the claim is about what the packet
 * carries, and there a section marked not applicable is not something the camp wrote.
 */
export function writtenSectionCount(sections: CompliancePlanSection[]): number {
  return sections.filter((s) => s.status === 'complete' || Boolean(s.body && s.body.trim())).length;
}

export function planSourceOf(
  documents: ComplianceDocument[], sections: CompliancePlanSection[],
  planAnswers: PlanAnswers = {},
): PlanSource {
  if (planDocumentIn(documents)) return 'uploaded';
  return planIsWritten(sections, planAnswers) ? 'written' : 'none';
}

/**
 * What the plan is called inside the packet.
 *
 * The camp's own file keeps its own extension so it opens in whatever wrote it, but not its own
 * name: a reviewer opening the zip should find the plan where the cover sheet says it is,
 * whether the camp called it `plan.pdf` or `SafetyPlan_FINAL_v6 (1).docx`.
 */
export function planFileName(doc: ComplianceDocument): string {
  const ext = doc.title.match(/\.([a-z0-9]{1,5})$/i)?.[1]
    ?? doc.bucketPath.match(/\.([a-z0-9]{1,5})$/i)?.[1]
    ?? 'pdf';
  return `written-plan.${ext.toLowerCase()}`;
}
