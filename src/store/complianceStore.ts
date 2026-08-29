import { create } from 'zustand';
import {
  loadCompliance, dbSetupCompliance, dbRecompute, dbUploadComplianceDocument,
  dbLinkDocument, dbUnlinkDocument, dbSignComplianceDocument, dbUpdatePlanSection,
  dbSetRequirementNa, dbAssignRequirement, type ComplianceData,
} from '@/lib/complianceDb';
import type {
  ComplianceProfile, ComplianceRequirement, RequirementStatus, ComplianceDocument,
  CompliancePlanSection, ComplianceAnswers, ComplianceStatus, PlanSectionStatus,
  ComplianceAuthority, ComplianceAuthorityForm,
} from '@/lib/types';
import type { UploadProgress } from '@/lib/uploadProgress';

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
  requirements: ComplianceRequirement[];
  enabledProfileIds: string[];
  statuses: RequirementStatus[];
  documents: ComplianceDocument[];
  planSections: CompliancePlanSection[];
  answers: ComplianceAnswers;

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
  linkDocument: (requirementId: string, documentId: string) => Promise<void>;
  unlinkDocument: (requirementId: string, documentId: string) => Promise<void>;
  openDocument: (path: string) => Promise<string | null>;

  savePlanSection: (
    id: string,
    patch: { body?: string | null; pageRef?: string | null; status?: PlanSectionStatus; naReason?: string | null },
    actor: string | null,
  ) => Promise<void>;

  markNotApplicable: (requirementId: string, reason: string | null, actor: string | null) => Promise<void>;
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
  planByCategory: () => { category: string; sections: CompliancePlanSection[] }[];
  planProgress: () => { complete: number; total: number };

  /** The parties reviewing this camp, in the order a director should think about them. */
  activeAuthorities: () => AuthoritySummary[];
  formsForAuthority: (authorityId: string) => ComplianceAuthorityForm[];
  /** One authority's requirements, split by what the camp actually has to do about them. */
  workForAuthority: (authorityId: string) => AuthorityWork;
}

/** An authority plus where this camp stands with it. */
export interface AuthoritySummary {
  authority: ComplianceAuthority;
  total: number;
  met: number;
  outstanding: number;
  notApplicable: number;
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
  /** Things satisfied by attaching a file. */
  documents: ComplianceRequirement[];
  /** Sections of the written safety plan. */
  plan: ComplianceRequirement[];
  /** Blocked on a setup question nobody has answered. */
  unanswered: ComplianceRequirement[];
  /** Ruled out, kept visible because an inspector will ask why. */
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
  profiles: [], authorities: [], authorityForms: [],
  requirements: [], enabledProfileIds: [], statuses: [],
  documents: [], planSections: [], answers: {},
  loaded: false, busy: false,

  apply: (d) => set({
    profiles: d.profiles, authorities: d.authorities, authorityForms: d.authorityForms,
    requirements: d.requirements,
    enabledProfileIds: d.enabledProfileIds, statuses: d.statuses,
    documents: d.documents, planSections: d.planSections, answers: d.answers,
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
    get().requirements.filter((r) => r.profileId === profileId).sort((a, b) => a.sortOrder - b.sortOrder),

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
    };
    let tracked = 0;
    for (const r of reqs) {
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
  actionItems: () => {
    const st = get();
    const enabled = new Set(st.enabledProfileIds);
    return st.requirements
      .filter((r) => enabled.has(r.profileId))
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

  documentsFor: (requirementId) => get().documents.filter((d) => d.requirementIds.includes(requirementId)),

  activeAuthorities: () => {
    const st = get();
    const enabled = new Set(st.enabledProfileIds);
    return st.authorities
      .filter((a) => enabled.has(a.profileId))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((authority) => {
        const reqs = st.requirements.filter(
          (r) => r.authorityId === authority.id && enabled.has(r.profileId),
        );
        let met = 0, outstanding = 0, notApplicable = 0, nextDue: string | null = null;
        for (const r of reqs) {
          const s = st.statusFor(r.id);
          if (!s) continue;
          if (s.status === 'not_applicable') { notApplicable++; continue; }
          if (s.status === 'satisfied' || s.status === 'expiring') met++;
          else outstanding++;
          if (s.status !== 'satisfied' && s.dueOn && (!nextDue || s.dueOn < nextDue)) nextDue = s.dueOn;
        }
        const tracked = met + outstanding;
        return {
          authority, total: reqs.length, met, outstanding, notApplicable,
          percent: tracked === 0 ? 0 : Math.round((met / tracked) * 100),
          nextDue,
        };
      });
  },

  formsForAuthority: (authorityId) => get().authorityForms
    .filter((f) => f.authorityId === authorityId)
    .sort((a, b) => a.sortOrder - b.sortOrder),

  workForAuthority: (authorityId) => {
    const st = get();
    const enabled = new Set(st.enabledProfileIds);
    const work: AuthorityWork = {
      records: [], documents: [], plan: [], unanswered: [], notApplicable: [],
    };
    for (const r of st.requirements) {
      if (r.authorityId !== authorityId || !enabled.has(r.profileId)) continue;
      const s = st.statusFor(r.id);
      if (!s) continue;
      if (s.status === 'needs_answer') { work.unanswered.push(r); continue; }
      if (s.status === 'not_applicable') { work.notApplicable.push(r); continue; }
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
    work.records.sort(byStatus);
    work.documents.sort(byStatus);
    work.plan.sort(byStatus);
    return work;
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
}));
