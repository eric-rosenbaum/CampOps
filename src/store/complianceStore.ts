import { create } from 'zustand';
import {
  loadCompliance, dbSetupCompliance, dbRecompute, dbUploadComplianceDocument,
  dbSetPlanDocument, dbClearPlanDocument,
  dbLinkDocument, dbUnlinkDocument, dbSignComplianceDocument, dbUpdatePlanSection,
  dbSetRequirementNa, dbAssignRequirement, dbSaveFormAnswer,
  dbLoadSessionCapacity, dbSaveSessionCapacity, dbDeleteSessionCapacity,
  dbSaveIncident, dbMarkIncidentReported, dbSaveScreening, dbDeleteScreening,
  dbSaveTraining, dbSaveInsurance, dbSavePlanAnswer,
  type ComplianceData, type SessionCapacityInput,
} from '@/lib/complianceDb';
import type {
  ComplianceProfile, ComplianceRequirement, RequirementStatus, ComplianceDocument,
  CompliancePlanSection, ComplianceAnswers, ComplianceStatus, PlanSectionStatus,
  ComplianceAuthority, ComplianceAuthorityForm, CompliancePlanTemplate,
  ComplianceFormQuestion, FormAnswers, SessionCapacity,
  ComplianceIncident, ComplianceScreening, ComplianceTraining, ComplianceInsurance,
  ComplianceSource, ComplianceSourceVersion, IncidentCriterion,
  PlanAnswers, PlanAnswerValue,
} from '@/lib/types';
import type { UploadProgress } from '@/lib/uploadProgress';
import { generatedFormFor } from '@/lib/compliance/generatedForms';
import {
  PLAN_STATUS_QUESTION, planDocumentIn, planSourceOf, type PlanSource,
} from '@/lib/compliance/planSource';
import { applicability } from '@/lib/compliance/applicability';
import {
  PLAN_QUESTIONS, PLAN_ADDENDA, type PlanQuestion, type PlanAddendum,
} from '@/lib/compliance/planTemplate';
import { todayStr } from '@/lib/utils';

/**
 * Compliance module state.
 *
 * The store holds what the database computed; it does not compute compliance itself. Every
 * action that could change evidence ends by recomputing server-side and reloading, so the
 * number on screen and the number in the database can never disagree — which matters when the
 * number is what a camp files a permit on.
 */

export interface PackageSummary {
  profile: ComplianceProfile;
  total: number;
  satisfied: number;
  partial: number;
  expiring: number;
  missing: number;
  notApplicable: number;
  /** Questions we have not asked yet, so we cannot say whether the rule is theirs. */
  needsAnswer: number;
  /** Forms we prepare, which are outside the percentage because filing happens on paper. */
  forms: number;
  /**
   * Out of what actually applies. Only a requirement the camp has ruled out leaves the
   * denominator; one we simply have not asked about stays in it, unmet.
   */
  percent: number;
}

interface ComplianceState {
  campId: string | null;
  seasonId: string | null;

  profiles: ComplianceProfile[];
  authorities: ComplianceAuthority[];
  authorityForms: ComplianceAuthorityForm[];
  planTemplates: CompliancePlanTemplate[];
  formQuestions: ComplianceFormQuestion[];
  formAnswers: FormAnswers;
  requirements: ComplianceRequirement[];
  enabledProfileIds: string[];
  statuses: RequirementStatus[];
  documents: ComplianceDocument[];
  incidents: ComplianceIncident[];
  screenings: ComplianceScreening[];
  trainings: ComplianceTraining[];
  insurance: ComplianceInsurance[];
  incidentCriteria: IncidentCriterion[];
  sources: ComplianceSource[];
  sourceVersions: ComplianceSourceVersion[];
  planSections: CompliancePlanSection[];
  answers: ComplianceAnswers;
  /** DOH-367's camper capacity table, in printed-row order. */
  sessionCapacity: SessionCapacity[];

  loaded: boolean;
  busy: boolean;

  load: (campId: string, seasonId: string | null) => Promise<void>;
  apply: (d: ComplianceData) => void;

  runSetup: (answers: ComplianceAnswers, actor: string | null) => Promise<boolean>;
  recompute: () => Promise<void>;

  uploadDocument: (
    file: File, title: string, requirementIds: string[], expiresOn: string | null,
    uploader: { id: string | null; name: string | null }, onProgress?: UploadProgress,
  ) => Promise<void>;
  /**
   * Take the camp's own safety plan as a file.
   *
   * The alternative to writing ninety-six sections. The file becomes the plan this season's
   * packet carries, and -- only when the camp has not already answered it -- DOH-367's plan
   * question is set to "attached with this application", because that is now what is true of
   * the packet. An existing answer is never overwritten: a camp that said the county already
   * holds their plan has told us something we did not work out for ourselves.
   */
  uploadPlanDocument: (
    file: File, uploader: { id: string | null; name: string | null },
    actor: string | null, onProgress?: UploadProgress,
  ) => Promise<void>;
  /** Stop treating the uploaded file as the plan. The file stays, as ordinary evidence. */
  removePlanDocument: () => Promise<void>;
  linkDocument: (requirementId: string, documentId: string) => Promise<void>;
  unlinkDocument: (requirementId: string, documentId: string) => Promise<void>;
  openDocument: (path: string) => Promise<string | null>;

  savePlanSection: (
    id: string,
    patch: { body?: string | null; pageRef?: string | null; status?: PlanSectionStatus; naReason?: string | null },
    actor: string | null,
  ) => Promise<void>;

  /**
   * Write one row of the capacity table. Optimistic, for the same reason the form answers are:
   * this is numeric data entry and a round trip per cell would make it feel broken.
   */
  saveSessionCapacity: (row: SessionCapacityInput, actor: string | null) => Promise<void>;
  /**
   * Drop a session and close the gap it leaves.
   *
   * The index is which row of the form this is, not a sort key, so the rows below have to move
   * up. Leaving a hole would print session 3 on the form's fourth line.
   */
  removeSessionCapacity: (sessionIndex: number, actor: string | null) => Promise<void>;

  /**
   * File an incident. The 24-hour clock is computed in the data layer, not here and not in the
   * form, so a camp gets the same verdict whichever screen files it.
   */
  saveIncident: (
    patch: Partial<ComplianceIncident> & { kind: string; discoveredAt: string; severity: string[] },
    actor: string | null,
  ) => Promise<void>;
  markIncidentReported: (id: string, reportedTo: string, method: string, actor: string | null) => Promise<void>;
  saveScreening: (
    patch: Partial<ComplianceScreening> & { kind: string; performedOn: string }, actor: string | null,
  ) => Promise<void>;
  removeScreening: (id: string) => Promise<void>;
  saveTraining: (
    patch: Partial<ComplianceTraining> & { kind: string; deliveredOn: string }, actor: string | null,
  ) => Promise<void>;
  saveInsurance: (
    patch: Partial<ComplianceInsurance> & { kind: string }, actor: string | null,
  ) => Promise<void>;

  markNotApplicable: (requirementId: string, reason: string | null, actor: string | null) => Promise<void>;
  /** Answer one of the questions a form asks. Optimistic, because typing must not feel laggy. */
  saveFormAnswer: (questionKey: string, value: string, actor: string | null) => Promise<void>;
  assign: (requirementId: string, assignee: string | null) => Promise<void>;

  // ── selectors ──
  isSetUp: () => boolean;
  statusFor: (requirementId: string) => RequirementStatus | undefined;
  requirementsForProfile: (profileId: string) => ComplianceRequirement[];
  enabledProfiles: () => ComplianceProfile[];
  packageSummary: (profileId: string) => PackageSummary | null;
  overallPercent: () => number;
  actionItems: () => { requirement: ComplianceRequirement; status: RequirementStatus }[];
  documentsFor: (requirementId: string) => ComplianceDocument[];
  /** The camp's own safety plan, when they uploaded one instead of writing it here. */
  planDocument: () => ComplianceDocument | null;
  /**
   * Attached evidence, which is every document except the one that IS the plan.
   *
   * The plan has its own home on screen and its own slot in the packet. Left in this list it
   * would also appear in the evidence locker and a second time inside `evidence/` in the zip,
   * so a reviewer would find two copies and have to work out whether they differ.
   */
  evidenceDocuments: () => ComplianceDocument[];
  /** Where this camp's plan comes from: their upload, the builder, or nowhere yet. */
  planSource: () => PlanSource;
  /** Reportable incidents still unreported, soonest deadline first. */
  openIncidents: () => ComplianceIncident[];
  /** The screening and training picture for one person, for the clearance table. */
  clearanceFor: (staffId: string) => StaffClearance;
  /** The source a requirement came from, for the citation link. */
  sourceFor: (requirementId: string) => ComplianceSource | null;
  /**
   * Source changes that touch this camp.
   *
   * A change is only shown when its `affects.applies_when` matches the camp's own setup answers,
   * or when it names a requirement that is in scope. A camp with no rifle range does not need to
   * hear that the riflery form was revised.
   */
  changesForCamp: () => { version: ComplianceSourceVersion; source: ComplianceSource; affectsYou: boolean }[];
  planByCategory: () => { category: string; sections: CompliancePlanSection[] }[];
  planProgress: () => { complete: number; total: number };

  /** Answers to the state's 92-question template, keyed by PlanQuestion.key. */
  planAnswers: PlanAnswers;
  savePlanAnswer: (questionKey: string, value: PlanAnswerValue | null, actor: string | null) => Promise<void>;
  /**
   * The template questions this camp is actually asked, in the state's own order.
   *
   * Drops a question whose gate is answered anything but Yes -- the template's own skip logic
   * ("Does the camp have an on-site sewage treatment system? No: skip to question 16"). A gate
   * nobody has answered yet leaves its dependants hidden, which is what the paper form does too:
   * you do not reach question 14 until you have answered 13.
   */
  planQuestionsAsked: () => PlanQuestion[];
  /** Answered / asked, over the questions this camp is actually asked. */
  planAnswerProgress: () => { answered: number; total: number };
  /** The activity-specific state plans this camp owes, from its setup answers. */
  planAddenda: () => PlanAddendum[];

  /** The parties reviewing this camp, in the order a director should think about them. */
  activeAuthorities: () => AuthoritySummary[];
  /**
   * The forms this camp has to file that the product prepares.
   *
   * Held apart from the scored requirements: filing is a paper act we never see, so these are
   * never met or outstanding. They still have to be visible, or the one job the camp actually
   * has disappears from the page along with its score.
   */
  formsToFile: () => { requirement: ComplianceRequirement; formCode: string }[];
  /** How many requirements the percentage is actually computed over. */
  trackedCount: () => number;
  formsForAuthority: (authorityId: string) => ComplianceAuthorityForm[];
  /** One authority's requirements, split by what the camp actually has to do about them. */
  workForAuthority: (authorityId: string) => AuthorityWork;
  /**
   * Section code to the checklist row it fills, from the catalog.
   *
   * Built here so the download and the coverage percentage read the same map, and so nothing in
   * the form layer has to guess a row from a title.
   */
  planRowKeys: () => Record<string, string>;
  /**
   * Which form codes are in scope right now.
   *
   * Read from the catalog rather than the bundled NY_FORMS list, so parking a document is a
   * data change and not a code change. Everything the app shows or exports is filtered by it.
   */
  activeFormCodes: () => Set<string>;
  /**
   * Is this item traceable to a document we are currently showing?
   *
   * Nothing appears in this module ungrounded. An item tagged with no document at all is not
   * out of scope, it is verified at inspection, and that is reported separately rather than
   * hidden, because it is still a duty the camp owes.
   */
  inScope: (formCodes: string[]) => 'on_a_form' | 'at_inspection' | 'other_document';
  /**
   * The requirements this module is currently accounting for.
   *
   * Everything that counts anything reads this, so the header, the overview and the list can
   * never disagree. The module shows form obligations only: a rule that is on no document is a
   * real legal duty but a different kind of claim, and mixing the two left a camp with no way
   * to tell which was which.
   */
  scopedRequirements: () => ComplianceRequirement[];
  /**
   * When a document is owed, and what that date is measured from.
   *
   * The deadline lives on the requirement that asks for the document, so this walks the link
   * and reports both the date and the rule behind it. A camp seeing "28 April" needs to know it
   * is sixty days before their own opening day, not a fixed calendar date, or they will not
   * understand why it moves when the season does.
   */
  formTiming: (requirementCode: string | null) => {
    dueOn: string | null; basis: string; met: boolean;
  } | null;
}

/**
 * Whether one person is clear to work on day one.
 *
 * Six things attach to hiring somebody at a New York camp and they all reset every season, which
 * is why this is the largest single surface an inspector can ask about.
 */
export interface StaffClearance {
  staffId: string;
  dcjs: ComplianceScreening | null;
  nsopw: ComplianceScreening | null;
  references: number;
  workingPapers: ComplianceScreening | null;
  codeOfConduct: ComplianceTraining | null;
  /** null when nobody has recorded anything either way. */
  clear: boolean | null;
  blockers: string[];
}

/** An authority plus where this camp stands with it. */
export interface AuthoritySummary {
  authority: ComplianceAuthority;
  total: number;
  met: number;
  outstanding: number;
  notApplicable: number;
  /** Forms this party wants that we prepare; outside met/outstanding, see AuthorityWork.forms. */
  forms: number;
  percent: number;
  /** The soonest deadline among its outstanding requirements, if any carry one. */
  nextDue: string | null;
}

/**
 * A party's requirements grouped by the kind of work they represent.
 *
 * Grouping only by party gives one enormous county card. The second level is what makes the
 * page workable: a camp reads down "records to keep current" in one frame of mind and
 * "documents to attach" in another.
 */
export interface AuthorityWork {
  /** Evidence the platform tracks from live operational data: certs, inspections, drills, logs. */
  records: ComplianceRequirement[];
  /**
   * Forms the product fills in, which the camp prints, signs and posts.
   *
   * Kept apart from `documents` because nothing about them is on record here: filing happens
   * on paper. Counting them as met or outstanding claimed knowledge we do not have, and while
   * they sat among the documents any attached file could satisfy one.
   */
  forms: ComplianceRequirement[];
  /** Things satisfied by attaching a file. */
  documents: ComplianceRequirement[];
  /** Sections of the written safety plan. */
  plan: ComplianceRequirement[];
  /** Blocked on a setup question nobody has answered. */
  unanswered: ComplianceRequirement[];
  /** Ruled out, kept visible with the reason. */
  notApplicable: ComplianceRequirement[];
}

/**
 * Which bucket a requirement belongs in on the records page.
 *
 * Driven by evidence_type rather than by category, because the question the grouping answers
 * is "what would I do to satisfy this", and that is exactly what evidence_type encodes.
 */
const RECORD_EVIDENCE = new Set([
  'certification', 'inspection', 'drill', 'temp_log', 'pool_log', 'asset_expiry',
  'water_sample', 'screening', 'training', 'roster',
]);

// needs_answer sorts first because answering one setup question can change everything below
// it: until we know, we cannot tell the camp whether the rule is theirs to meet.
const RANK: Record<ComplianceStatus, number> = {
  needs_answer: 0, missing: 1, partial: 2, expiring: 3, satisfied: 4, not_applicable: 5,
};

export const useComplianceStore = create<ComplianceState>((set, get) => ({
  campId: null, seasonId: null,
  profiles: [], authorities: [], authorityForms: [], planTemplates: [],
  formQuestions: [], formAnswers: {},
  requirements: [], enabledProfileIds: [], statuses: [],
  documents: [], planSections: [], answers: {}, planAnswers: {}, sessionCapacity: [],
  incidents: [], screenings: [], trainings: [], insurance: [],
  incidentCriteria: [], sources: [], sourceVersions: [],
  loaded: false, busy: false,

  apply: (d) => set({
    profiles: d.profiles, authorities: d.authorities, authorityForms: d.authorityForms,
    planTemplates: d.planTemplates,
    formQuestions: d.formQuestions, formAnswers: d.formAnswers,
    requirements: d.requirements,
    enabledProfileIds: d.enabledProfileIds, statuses: d.statuses,
    documents: d.documents, planSections: d.planSections, answers: d.answers,
    planAnswers: d.planAnswers,
    incidents: d.incidents, screenings: d.screenings, trainings: d.trainings,
    insurance: d.insurance, incidentCriteria: d.incidentCriteria,
    sources: d.sources, sourceVersions: d.sourceVersions,
    sessionCapacity: d.sessionCapacity,
    loaded: true,
  }),

  load: async (campId, seasonId) => {
    set({ campId, seasonId });
    const d = await loadCompliance(campId, seasonId);
    if (d) get().apply(d);
    else set({ loaded: true });
  },

  runSetup: async (answers, actor) => {
    const { campId, seasonId } = get();
    if (!campId || !seasonId) return false;
    set({ busy: true });
    const res = await dbSetupCompliance(campId, seasonId, answers, actor);
    await get().load(campId, seasonId);
    set({ busy: false });
    return res != null;
  },

  recompute: async () => {
    const { campId, seasonId } = get();
    if (!campId || !seasonId) return;
    await dbRecompute(campId, seasonId);
    await get().load(campId, seasonId);
  },

  uploadDocument: async (file, title, requirementIds, expiresOn, uploader, onProgress) => {
    const { campId, seasonId } = get();
    if (!campId || !seasonId) throw new Error('No season selected');
    await dbUploadComplianceDocument(file, campId, seasonId, title, requirementIds, expiresOn, uploader, onProgress);
    await get().recompute();
  },

  uploadPlanDocument: async (file, uploader, actor, onProgress) => {
    const { campId, seasonId } = get();
    if (!campId || !seasonId) throw new Error('No season selected');
    // Uploaded as an ordinary document first, then promoted. Inserting it as the plan directly
    // would collide with the one-live-plan index while the previous plan is still live.
    const doc = await dbUploadComplianceDocument(
      file, campId, seasonId, file.name, [], null, uploader, onProgress,
    );
    await dbSetPlanDocument(campId, seasonId, doc.id);
    if (!get().formAnswers[PLAN_STATUS_QUESTION]) {
      await dbSaveFormAnswer(campId, seasonId, PLAN_STATUS_QUESTION, 'attached', actor);
    }
    await get().recompute();
  },

  removePlanDocument: async () => {
    const doc = get().planDocument();
    if (!doc) return;
    await dbClearPlanDocument(doc.id);
    await get().recompute();
  },

  linkDocument: async (requirementId, documentId) => {
    const { campId, seasonId } = get();
    if (!campId || !seasonId) return;
    await dbLinkDocument(campId, seasonId, requirementId, documentId);
    await get().recompute();
  },

  unlinkDocument: async (requirementId, documentId) => {
    const { seasonId } = get();
    if (!seasonId) return;
    await dbUnlinkDocument(seasonId, requirementId, documentId);
    await get().recompute();
  },

  openDocument: (path) => dbSignComplianceDocument(path),

  savePlanSection: async (id, patch, actor) => {
    // Optimistic: writing a plan section should feel instant. The recompute that follows is
    // what makes the requirement status catch up.
    set((s) => ({
      planSections: s.planSections.map((p) => (p.id === id ? { ...p, ...patch } as CompliancePlanSection : p)),
    }));
    await dbUpdatePlanSection(id, patch, actor);
    await get().recompute();
  },

  savePlanAnswer: async (questionKey, value, actor) => {
    const { campId, seasonId } = get();
    if (!campId || !seasonId) return;
    // Applied locally first, like form answers: a checkbox that waits on a round trip reads as
    // broken. `null` and an emptied answer both clear the row, so the local copy drops the key
    // rather than holding an empty object that would count as written.
    const next = { ...get().planAnswers };
    const empty = !value
      || ((value.checked ?? []).length === 0
          && !(value.text ?? '').trim()
          && (value.rows ?? []).every((r) => r.every((c) => !c.trim())));
    if (empty) delete next[questionKey]; else next[questionKey] = value;
    set({ planAnswers: next });
    await dbSavePlanAnswer(campId, seasonId, questionKey, value, actor);
    await get().recompute();
  },

  saveFormAnswer: async (questionKey, value, actor) => {
    const { campId, seasonId } = get();
    if (!campId || !seasonId) return;
    // Applied locally first: these are typed answers and waiting on a round trip per keystroke
    // group would make the form feel broken. A failed write logs and the next load corrects it.
    set({ formAnswers: { ...get().formAnswers, [questionKey]: value } });
    await dbSaveFormAnswer(campId, seasonId, questionKey, value, actor);
  },

  saveSessionCapacity: async (row, actor) => {
    const { campId, seasonId } = get();
    if (!campId || !seasonId) return;
    const saved = await dbSaveSessionCapacity(campId, seasonId, row, actor);
    if (!saved) return;
    set((st) => ({
      sessionCapacity: [
        ...st.sessionCapacity.filter((r) => r.sessionIndex !== saved.sessionIndex), saved,
      ].sort((a, b) => a.sessionIndex - b.sessionIndex),
    }));
  },

  removeSessionCapacity: async (sessionIndex, actor) => {
    const { campId, seasonId, sessionCapacity } = get();
    if (!campId || !seasonId) return;
    const kept = sessionCapacity
      .filter((r) => r.sessionIndex !== sessionIndex)
      .sort((a, b) => a.sessionIndex - b.sessionIndex);
    // Ascending, so each row is written into the slot the row above it has already left.
    for (let i = 0; i < kept.length; i++) {
      if (kept[i].sessionIndex === i + 1) continue;
      await dbSaveSessionCapacity(campId, seasonId, { ...kept[i], sessionIndex: i + 1 }, actor);
    }
    const highest = Math.max(0, ...sessionCapacity.map((r) => r.sessionIndex));
    for (let i = kept.length + 1; i <= highest; i++) {
      await dbDeleteSessionCapacity(campId, seasonId, i);
    }
    set({ sessionCapacity: await dbLoadSessionCapacity(campId, seasonId) });
  },

  saveIncident: async (patch, actor) => {
    const { campId, seasonId } = get();
    if (!campId) return;
    await dbSaveIncident(campId, seasonId, patch, actor);
    await get().recompute();
  },

  markIncidentReported: async (id, reportedTo, method, actor) => {
    await dbMarkIncidentReported(id, reportedTo, method, actor);
    await get().recompute();
  },

  saveScreening: async (patch, actor) => {
    const { campId, seasonId } = get();
    if (!campId) return;
    await dbSaveScreening(campId, seasonId, patch, actor);
    await get().recompute();
  },

  removeScreening: async (id) => {
    await dbDeleteScreening(id);
    await get().recompute();
  },

  saveTraining: async (patch, actor) => {
    const { campId, seasonId } = get();
    if (!campId) return;
    await dbSaveTraining(campId, seasonId, patch, actor);
    await get().recompute();
  },

  saveInsurance: async (patch, actor) => {
    const { campId, seasonId } = get();
    if (!campId) return;
    await dbSaveInsurance(campId, seasonId, patch, actor);
    await get().recompute();
  },

  markNotApplicable: async (requirementId, reason, actor) => {
    const { campId, seasonId } = get();
    if (!campId || !seasonId) return;
    await dbSetRequirementNa(campId, seasonId, requirementId, reason, actor);
    await get().recompute();
  },

  assign: async (requirementId, assignee) => {
    const { campId, seasonId } = get();
    if (!campId || !seasonId) return;
    await dbAssignRequirement(campId, seasonId, requirementId, assignee);
    set((s) => ({
      statuses: s.statuses.map((x) => (x.requirementId === requirementId ? { ...x, assignedTo: assignee } : x)),
    }));
  },

  // ── selectors ──
  isSetUp: () => get().enabledProfileIds.length > 0,

  statusFor: (id) => get().statuses.find((s) => s.requirementId === id),

  requirementsForProfile: (profileId) =>
    get().scopedRequirements().filter((r) => r.profileId === profileId)
      .sort((a, b) => a.sortOrder - b.sortOrder),

  enabledProfiles: () => {
    const { profiles, enabledProfileIds } = get();
    return profiles.filter((p) => enabledProfileIds.includes(p.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  packageSummary: (profileId) => {
    const st = get();
    const profile = st.profiles.find((p) => p.id === profileId);
    if (!profile) return null;
    const reqs = st.requirementsForProfile(profileId);
    const counts = {
      satisfied: 0, partial: 0, expiring: 0, missing: 0, notApplicable: 0, needsAnswer: 0,
      forms: 0,
    };
    let tracked = 0;
    for (const r of reqs) {
      // Forms we generate are filed on paper and never reported back to us, so they are neither
      // met nor missing. See the note in activeAuthorities.
      if (generatedFormFor(r.formCodes)) { counts.forms++; continue; }
      const s = st.statusFor(r.id);
      if (!s) { counts.missing++; tracked++; continue; }
      // Only a requirement the camp has ruled out leaves the denominator. A requirement we
      // have not yet asked about stays in it: dropping it would quietly raise the score for
      // a question nobody has answered.
      if (s.status === 'not_applicable') { counts.notApplicable++; continue; }
      tracked++;
      if (s.status === 'satisfied') counts.satisfied++;
      else if (s.status === 'partial') counts.partial++;
      else if (s.status === 'expiring') counts.expiring++;
      else if (s.status === 'needs_answer') counts.needsAnswer++;
      else counts.missing++;
    }
    // Expiring still counts as met today — it is a warning, not a gap.
    const met = counts.satisfied + counts.expiring;
    return {
      profile, total: reqs.length, ...counts,
      percent: tracked === 0 ? 0 : Math.round((met / tracked) * 100),
    };
  },

  overallPercent: () => {
    const st = get();
    const ids = st.enabledProfileIds;
    if (ids.length === 0) return 0;
    let met = 0, tracked = 0;
    for (const id of ids) {
      const s = st.packageSummary(id);
      if (!s) continue;
      met += s.satisfied + s.expiring;
      tracked += s.total - s.notApplicable;
    }
    return tracked === 0 ? 0 : Math.round((met / tracked) * 100);
  },

  /** Everything still needing attention, worst first, then by deadline. */
  formsToFile: () => {
    const st = get();
    return st.scopedRequirements()
      .map((r) => ({ requirement: r, formCode: generatedFormFor(r.formCodes) }))
      .filter((x): x is { requirement: ComplianceRequirement; formCode: string } => !!x.formCode)
      .filter((x) => st.statusFor(x.requirement.id)?.status !== 'not_applicable')
      .sort((a, b) => a.formCode.localeCompare(b.formCode));
  },

  trackedCount: () => {
    const st = get();
    let tracked = 0;
    for (const id of st.enabledProfileIds) {
      const s = st.packageSummary(id);
      if (s) tracked += s.total - s.notApplicable - s.forms;
    }
    return tracked;
  },

  actionItems: () => {
    const st = get();
    return st.scopedRequirements()
      .filter((r) => !generatedFormFor(r.formCodes))
      .map((r) => ({ requirement: r, status: st.statusFor(r.id) }))
      .filter((x): x is { requirement: ComplianceRequirement; status: RequirementStatus } =>
        !!x.status && x.status.status !== 'satisfied' && x.status.status !== 'not_applicable')
      .sort((a, b) => {
        const d = RANK[a.status.status] - RANK[b.status.status];
        if (d !== 0) return d;
        if (a.status.dueOn && b.status.dueOn) return a.status.dueOn.localeCompare(b.status.dueOn);
        return a.requirement.sortOrder - b.requirement.sortOrder;
      });
  },

  documentsFor: (requirementId) => get().evidenceDocuments().filter((d) => d.requirementIds.includes(requirementId)),

  planDocument: () => planDocumentIn(get().documents),

  evidenceDocuments: () => {
    const plan = get().planDocument();
    return plan ? get().documents.filter((d) => d.id !== plan.id) : get().documents;
  },

  planSource: () => planSourceOf(get().documents, get().planSections, get().planAnswers),

  activeAuthorities: () => {
    const st = get();
    const enabled = new Set(st.enabledProfileIds);
    return st.authorities
      .filter((a) => enabled.has(a.profileId))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((authority) => {
        const reqs = st.scopedRequirements().filter((r) => r.authorityId === authority.id);
        let met = 0, outstanding = 0, notApplicable = 0, forms = 0, nextDue: string | null = null;
        for (const r of reqs) {
          // A form we generate is filed in an envelope. Whether it went in is not something we
          // can see, so it is neither met nor outstanding -- scoring it would put a permanent
          // red mark against a camp that had done everything the product asked of them.
          if (generatedFormFor(r.formCodes)) { forms++; continue; }
          const s = st.statusFor(r.id);
          // No computed row means the engine has not evaluated this one yet, which happens
          // between seeding a requirement and the next recompute. Dropping it would quietly
          // shrink the list a camp is working from. Silence counts as outstanding, never as met.
          if (!s) { outstanding++; continue; }
          if (s.status === 'not_applicable') { notApplicable++; continue; }
          if (s.status === 'satisfied' || s.status === 'expiring') met++;
          else outstanding++;
          if (s.status !== 'satisfied' && s.dueOn && (!nextDue || s.dueOn < nextDue)) nextDue = s.dueOn;
        }
        const tracked = met + outstanding;
        return {
          authority, total: reqs.length, met, outstanding, notApplicable, forms,
          percent: tracked === 0 ? 0 : Math.round((met / tracked) * 100),
          nextDue,
        };
      });
  },

  formTiming: (requirementCode) => {
    if (!requirementCode) return null;
    const st = get();
    const req = st.requirements.find((r) => r.reqCode === requirementCode);
    if (!req) return null;
    const status = st.statusFor(req.id);
    const rule = req.deadlineRule;

    let basis = req.frequency ? `Filed ${req.frequency.replace(/_/g, ' ')}.` : 'No fixed date.';
    const days = Number(rule?.days);
    if (rule?.type === 'relative_to_opening' && Number.isFinite(days)) {
      basis = days === 0
        ? 'Due by your opening day, so it moves with your season.'
        : days < 0
          ? `Due ${Math.abs(days)} days before your opening day, so it moves with your season.`
          : `Due ${days} days after your opening day.`;
    } else if (rule?.type === 'fixed') {
      basis = 'A fixed calendar date each year.';
    } else if (typeof rule?.note === 'string') {
      basis = rule.note as string;
    }

    return {
      dueOn: status?.dueOn ?? null,
      basis,
      met: status?.status === 'satisfied',
    };
  },

  activeFormCodes: () => new Set(
    // Falls back to the title so a document with no printed designation, like the county's
    // application packet, still matches the tag written against it.
    get().authorityForms
      .filter((f) => f.isActive)
      .map((f) => f.designation ?? f.title),
  ),

  scopedRequirements: () => {
    const st = get();
    const enabled = new Set(st.enabledProfileIds);
    return st.requirements.filter(
      (r) => enabled.has(r.profileId) && st.inScope(r.formCodes) === 'on_a_form',
    );
  },

  inScope: (formCodes) => {
    if (formCodes.length === 0) return 'at_inspection';
    const active = get().activeFormCodes();
    return formCodes.some((c) => active.has(c)) ? 'on_a_form' : 'other_document';
  },

  planRowKeys: () => Object.fromEntries(
    get().planTemplates
      .filter((t) => t.formRowKey)
      .map((t) => [t.code, t.formRowKey as string]),
  ),

  formsForAuthority: (authorityId) => get().authorityForms
    .filter((f) => f.authorityId === authorityId)
    .sort((a, b) => a.sortOrder - b.sortOrder),

  workForAuthority: (authorityId) => {
    const st = get();
    const work: AuthorityWork = {
      records: [], forms: [], documents: [], plan: [], unanswered: [], notApplicable: [],
    };
    for (const r of st.scopedRequirements()) {
      if (r.authorityId !== authorityId) continue;
      const s = st.statusFor(r.id);
      // Not yet evaluated. It still belongs on the page: a requirement that vanishes because a
      // recompute has not run is exactly the kind of gap this module cannot have. Documents is
      // the safe home, because attaching a record satisfies anything.
      if (!s) { work.documents.push(r); continue; }
      if (s.status === 'needs_answer') { work.unanswered.push(r); continue; }
      if (s.status === 'not_applicable') { work.notApplicable.push(r); continue; }
      if (generatedFormFor(r.formCodes)) { work.forms.push(r); continue; }
      if (r.evidenceType === 'plan_section') { work.plan.push(r); continue; }
      // An unscoped record-type requirement cannot read the register, so in practice the camp
      // satisfies it by attaching the record. It belongs with the documents, where the upload is.
      const detail = s.detail as Record<string, unknown>;
      if (RECORD_EVIDENCE.has(r.evidenceType) && !detail.unmapped && !detail.awaiting_feature) {
        work.records.push(r);
      } else {
        work.documents.push(r);
      }
    }
    const byStatus = (a: ComplianceRequirement, b: ComplianceRequirement) => {
      const sa = st.statusFor(a.id), sb = st.statusFor(b.id);
      const d = RANK[sa?.status ?? 'missing'] - RANK[sb?.status ?? 'missing'];
      return d !== 0 ? d : a.reqCode.localeCompare(b.reqCode);
    };
    work.unanswered.sort(byStatus);
    work.notApplicable.sort(byStatus);
    work.records.sort(byStatus);
    work.documents.sort(byStatus);
    work.plan.sort(byStatus);
    return work;
  },

  openIncidents: () => get().incidents
    .filter((i) => i.reportable && !i.reportedAt)
    .sort((a, b) => (a.reportDueAt ?? '').localeCompare(b.reportDueAt ?? '')),

  clearanceFor: (staffId) => {
    const today = todayStr();
    const live = (k: string) => get().screenings.find(
      (x) => x.staffId === staffId && x.kind === k
        && (x.expiresOn === null || x.expiresOn >= today)
        && x.cleared !== false,
    ) ?? null;

    const dcjs = live('dcjs_sor');
    const nsopw = live('nsopw');
    const workingPapers = live('employment_certificate');
    const references = get().screenings.filter(
      (x) => x.staffId === staffId && x.kind === 'reference_check' && x.cleared !== false,
    ).length;
    const codeOfConduct = get().trainings.find(
      (t) => t.staffId === staffId && t.kind === 'code_of_conduct' && t.acknowledgedOn,
    ) ?? null;

    const blockers: string[] = [];
    if (!dcjs) blockers.push('Registry check not run');
    // Chapter 873 §873.1804 wants two, and wants them before employment begins.
    if (references < 2) blockers.push(`${2 - references} reference${references === 1 ? '' : 's'} short`);

    const anythingRecorded = Boolean(dcjs || nsopw || workingPapers || references || codeOfConduct);
    return {
      staffId, dcjs, nsopw, references, workingPapers, codeOfConduct,
      clear: !anythingRecorded ? null : blockers.length === 0,
      blockers,
    };
  },

  sourceFor: (requirementId) => {
    const req = get().requirements.find((r) => r.id === requirementId);
    if (!req?.sourceId) return null;
    return get().sources.find((x) => x.id === req.sourceId) ?? null;
  },

  changesForCamp: () => {
    const st = get();
    const enabled = new Set(st.enabledProfileIds);
    // Which requirement codes this camp actually carries. Deliberately NOT scopedRequirements(),
    // which narrows to rules printed on an active form — a duty checked at inspection is still a
    // duty, and a change to it still matters. What does drop out is anything setup ruled out.
    const mine = new Set(
      st.requirements
        .filter((r) => enabled.has(r.profileId) && st.statusFor(r.id)?.status !== 'not_applicable')
        .map((r) => r.reqCode),
    );

    return st.sourceVersions
      .filter((v) => v.changeSummary)
      .map((v) => {
        const source = st.sources.find((x) => x.id === v.sourceId);
        const codes = v.affects.req_codes ?? [];
        const when = (v.affects.applies_when ?? {}) as Record<string, unknown>;

        // Three ways a change can matter, and one way it cannot. A version naming no
        // requirements and no conditions is a reading that found nothing moved — saying it
        // affects the camp would make the count on this page meaningless.
        const byCode = codes.length > 0 && codes.some((c) => mine.has(c));
        const byCondition = Object.keys(when).length > 0
          && applicability(st.answers, when) === 'yes';

        return { version: v, source: source as ComplianceSource, affectsYou: byCode || byCondition };
      })
      .filter((x) => x.source)
      .sort((a, b) => b.version.retrievedAt.localeCompare(a.version.retrievedAt));
  },
  planByCategory: () => {
    const groups = new Map<string, CompliancePlanSection[]>();
    for (const s of get().planSections) {
      groups.set(s.category, [...(groups.get(s.category) ?? []), s]);
    }
    return [...groups.entries()]
      .map(([category, sections]) => ({ category, sections: sections.sort((a, b) => a.sortOrder - b.sortOrder) }))
      .sort((a, b) => (a.sections[0]?.sortOrder ?? 0) - (b.sections[0]?.sortOrder ?? 0));
  },

  planProgress: () => {
    const p = get().planSections;
    return { complete: p.filter((x) => x.status === 'complete' || x.status === 'not_applicable').length, total: p.length };
  },

  planQuestionsAsked: () => {
    const answers = get().planAnswers;
    // A gate is passed only by an explicit Yes. Unanswered hides its dependants, which is what
    // the paper form does: you do not reach 14 until you have answered 13.
    const passed = (key: string) => (answers[key]?.checked ?? []).some((c) => c.toLowerCase() === 'yes');
    return PLAN_QUESTIONS.filter((q) => !q.dependsOn || passed(q.dependsOn));
  },

  planAnswerProgress: () => {
    const asked = get().planQuestionsAsked();
    const answers = get().planAnswers;
    return { answered: asked.filter((q) => answers[q.key] !== undefined).length, total: asked.length };
  },

  planAddenda: () => {
    const answers = get().answers;
    // An addendum with no gate is one the state offers to any camp -- Sports, Spray Grounds and
    // the Generic Activity plan. Those are listed for every camp; the rest turn on setup.
    return PLAN_ADDENDA.filter((a) => Object.keys(a.appliesWhen).length === 0
      || applicability(answers, a.appliesWhen) === 'yes');
  },
}));
