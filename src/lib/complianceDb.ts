// Data layer for the Compliance module.
//
// Follows the platform's conventions: row↔camelCase mappers, one bulk loader per camp-season,
// granular non-throwing writers, and the sync guard around reloads.
//
// The one thing this layer deliberately does NOT do is compute status. That happens in Postgres
// (compute_camp_compliance) and is read back. Deriving completeness in the browser would mean
// deriving it from whatever stores happen to have hydrated, and this is a number a camp files a
// permit on.
import { supabase } from './supabase';
import { campError } from './campLog';
import { uploadToBucket } from './storageUpload';
import type { UploadProgress } from './uploadProgress';
import type {
  ComplianceProfile, ComplianceRequirement, RequirementStatus, ComplianceDocument,
  CompliancePlanSection, ComplianceAnswers, PlanSectionStatus,
  ComplianceAuthority, ComplianceAuthorityForm, CompliancePlanTemplate,
  ComplianceFormQuestion, FormAnswers, SessionCapacity,
} from './types';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

const BUCKET = 'compliance-files';

// ─── Mappers ──────────────────────────────────────────────────────────────────
function toProfile(r: Row): ComplianceProfile {
  return {
    id: r.id as string, code: r.code as string, name: r.name as string,
    jurisdictionLevel: r.jurisdiction_level as ComplianceProfile['jurisdictionLevel'],
    jurisdictionCode: s(r.jurisdiction_code), reader: r.reader as ComplianceProfile['reader'],
    description: s(r.description), sourceUrl: s(r.source_url),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function toRequirement(r: Row): ComplianceRequirement {
  return {
    id: r.id as string, profileId: r.profile_id as string,
    authorityId: s(r.authority_id), reqCode: r.req_code as string,
    label: r.label as string, summary: s(r.summary), category: r.category as string,
    evidenceType: r.evidence_type as ComplianceRequirement['evidenceType'],
    evidenceHint: s(r.evidence_hint), frequency: s(r.frequency),
    appliesWhen: (r.applies_when as Record<string, string>) ?? {},
    citation: s(r.citation), citationUrl: s(r.citation_url),
    verifyStatus: r.verify_status as ComplianceRequirement['verifyStatus'],
    holdsPersonalRecords: Boolean(r.holds_personal_records),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function toAuthority(r: Row): ComplianceAuthority {
  return {
    id: r.id as string, profileId: r.profile_id as string, code: r.code as string,
    name: r.name as string, shortName: s(r.short_name),
    level: r.level as ComplianceAuthority['level'],
    visitsSite: Boolean(r.visits_site), visitSchedule: s(r.visit_schedule),
    scope: s(r.scope), contactNote: s(r.contact_note), sourceUrl: s(r.source_url),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function toAuthorityForm(r: Row): ComplianceAuthorityForm {
  return {
    id: r.id as string, authorityId: r.authority_id as string,
    designation: s(r.designation), title: r.title as string, revision: s(r.revision),
    bundledPath: s(r.bundled_path), pageRef: s(r.page_ref),
    issuedBy: s(r.issued_by), sourceUrl: s(r.source_url),
    obtainNote: s(r.obtain_note), fillable: Boolean(r.fillable),
    campSupplied: Boolean(r.camp_supplied),
    isActive: r.is_active !== false,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function toPlanTemplate(r: Row): CompliancePlanTemplate {
  return {
    code: r.code as string, category: r.category as string, title: r.title as string,
    prompt: s(r.prompt),
    checklist: Array.isArray(r.checklist) ? (r.checklist as string[]) : null,
    formRowKey: s(r.form_row_key),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function toFormQuestion(r: Row): ComplianceFormQuestion {
  return {
    id: r.id as string, questionKey: r.question_key as string, formCode: r.form_code as string,
    groupKey: r.group_key as string, groupLabel: r.group_label as string,
    label: r.label as string, helpText: s(r.help_text),
    answerKind: r.answer_kind as ComplianceFormQuestion['answerKind'],
    choices: Array.isArray(r.choices) ? (r.choices as { value: string; label: string }[]) : null,
    renders: Array.isArray(r.renders) ? (r.renders as Record<string, unknown>[]) : [],
    dependsOn: s(r.depends_on), dependsOnValue: s(r.depends_on_value),
    derivesFrom: s(r.derives_from),
    appliesWhen: (r.applies_when as Record<string, string>) ?? {},
    required: Boolean(r.required), sortOrder: Number(r.sort_order ?? 0),
  };
}

function toStatus(r: Row): RequirementStatus {
  return {
    requirementId: r.requirement_id as string,
    status: r.status as RequirementStatus['status'],
    detail: (r.detail as Record<string, unknown>) ?? {},
    dueOn: s(r.due_on), assignedTo: s(r.assigned_to), naReason: s(r.na_reason),
    computedAt: r.computed_at as string,
  };
}

function toPlanSection(r: Row): CompliancePlanSection {
  return {
    id: r.id as string, campId: r.camp_id as string, seasonId: r.season_id as string,
    sectionCode: r.section_code as string, category: r.category as string,
    title: r.title as string, body: s(r.body), pageRef: s(r.page_ref),
    status: r.status as PlanSectionStatus, naReason: s(r.na_reason),
    sortOrder: Number(r.sort_order ?? 0), updatedAt: r.updated_at as string,
  };
}

/**
 * The twelve camper-count cells of one session row, as [interface property, database column].
 *
 * One table, read by the mapper and by the writer, so a read and a write can never disagree
 * about which band a number belongs to. The form's own key names are a third spelling again
 * ("6 & 7" is `age_6_and_7` there, `age_6_7` here) and are kept in the form layer, where the
 * page is drawn.
 */
type CapacityCount =
  | 'age1To5Male' | 'age1To5Female' | 'age6And7Male' | 'age6And7Female'
  | 'age8To12Male' | 'age8To12Female' | 'age13To15Male' | 'age13To15Female'
  | 'age16And17Male' | 'age16And17Female' | 'citsMale' | 'citsFemale';

const CAPACITY_COLUMNS: [CapacityCount, string][] = [
  ['age1To5Male', 'age_1_to_5_male'],
  ['age1To5Female', 'age_1_to_5_female'],
  ['age6And7Male', 'age_6_7_male'],
  ['age6And7Female', 'age_6_7_female'],
  ['age8To12Male', 'age_8_to_12_male'],
  ['age8To12Female', 'age_8_to_12_female'],
  ['age13To15Male', 'age_13_to_15_male'],
  ['age13To15Female', 'age_13_to_15_female'],
  ['age16And17Male', 'age_16_17_male'],
  ['age16And17Female', 'age_16_17_female'],
  ['citsMale', 'cits_male'],
  ['citsFemale', 'cits_female'],
];

function toSessionCapacity(r: Row): SessionCapacity {
  const counts = {} as Record<CapacityCount, number>;
  for (const [prop, column] of CAPACITY_COLUMNS) counts[prop] = Number(r[column] ?? 0);
  return {
    id: r.id as string, campId: r.camp_id as string, seasonId: r.season_id as string,
    sessionIndex: Number(r.session_index), sessionName: s(r.session_name),
    campType: (r.camp_type as SessionCapacity['campType']) ?? null,
    numberOfDays: r.number_of_days == null ? null : Number(r.number_of_days),
    sourceSessionId: s(r.source_session_id),
    updatedAt: r.updated_at as string,
    ...counts,
  };
}

// ─── Bulk load ────────────────────────────────────────────────────────────────
export interface ComplianceData {
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
  planSections: CompliancePlanSection[];
  answers: ComplianceAnswers;
  /** DOH-367's camper capacity table, one row per session. */
  sessionCapacity: SessionCapacity[];
}

export async function loadCompliance(campId: string, seasonId: string | null): Promise<ComplianceData | null> {
  try {
    const [prof, auth, authForms, planTpl, formQ, formA, reqs, enabled, stat, docs, links, plan, ans, sess] = await Promise.all([
      supabase.from('compliance_profiles').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('compliance_authorities').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('compliance_authority_forms').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('compliance_plan_templates').select('*').order('sort_order'),
      supabase.from('compliance_form_questions').select('*').order('sort_order'),
      seasonId ? supabase.from('camp_form_answers').select('question_key, value').eq('camp_id', campId).eq('season_id', seasonId)
               : Promise.resolve({ data: [], error: null }),
      supabase.from('compliance_requirements').select('*').order('sort_order'),
      seasonId ? supabase.from('camp_compliance_profiles').select('profile_id').eq('camp_id', campId).eq('season_id', seasonId)
               : Promise.resolve({ data: [], error: null }),
      seasonId ? supabase.from('camp_requirement_status').select('*').eq('camp_id', campId).eq('season_id', seasonId)
               : Promise.resolve({ data: [], error: null }),
      supabase.from('compliance_documents').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
      supabase.from('requirement_documents').select('requirement_id, document_id').eq('camp_id', campId),
      seasonId ? supabase.from('compliance_plan_sections').select('*').eq('camp_id', campId).eq('season_id', seasonId).order('sort_order')
               : Promise.resolve({ data: [], error: null }),
      seasonId ? supabase.from('camp_compliance_answers').select('key, value').eq('camp_id', campId).eq('season_id', seasonId)
               : Promise.resolve({ data: [], error: null }),
      seasonId ? supabase.from('compliance_session_capacity').select('*').eq('camp_id', campId).eq('season_id', seasonId).order('session_index')
               : Promise.resolve({ data: [], error: null }),
    ]);

    const byDoc = new Map<string, string[]>();
    for (const l of (links.data ?? []) as Row[]) {
      const id = l.document_id as string;
      byDoc.set(id, [...(byDoc.get(id) ?? []), l.requirement_id as string]);
    }

    return {
      profiles: ((prof.data ?? []) as Row[]).map(toProfile),
      authorities: ((auth.data ?? []) as Row[]).map(toAuthority),
      authorityForms: ((authForms.data ?? []) as Row[]).map(toAuthorityForm),
      planTemplates: ((planTpl.data ?? []) as Row[]).map(toPlanTemplate),
      formQuestions: ((formQ.data ?? []) as Row[]).map(toFormQuestion),
      formAnswers: Object.fromEntries(
        ((formA.data ?? []) as Row[]).map((r) => [r.question_key as string, r.value as string]),
      ),
      requirements: ((reqs.data ?? []) as Row[]).map(toRequirement),
      enabledProfileIds: ((enabled.data ?? []) as Row[]).map((r) => r.profile_id as string),
      statuses: ((stat.data ?? []) as Row[]).map(toStatus),
      documents: ((docs.data ?? []) as Row[]).map((r) => ({
        id: r.id as string, campId: r.camp_id as string, seasonId: s(r.season_id),
        title: r.title as string, docType: s(r.doc_type), bucketPath: r.bucket_path as string,
        mime: s(r.mime), sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
        expiresOn: s(r.expires_on), uploadedBy: s(r.uploaded_by), uploaderName: s(r.uploader_name),
        createdAt: r.created_at as string,
        requirementIds: byDoc.get(r.id as string) ?? [],
      })),
      planSections: ((plan.data ?? []) as Row[]).map(toPlanSection),
      answers: Object.fromEntries(((ans.data ?? []) as Row[]).map((r) => [r.key as string, r.value as string])),
      sessionCapacity: ((sess.data ?? []) as Row[]).map(toSessionCapacity),
    };
  } catch (e) {
    campError('[Compliance] load threw', e);
    return null;
  }
}

// ─── Setup / recompute ────────────────────────────────────────────────────────
/** Records the interview answers, enables matching profiles, lays down plan sections, recomputes. */
export async function dbSetupCompliance(
  campId: string, seasonId: string, answers: ComplianceAnswers, actor: string | null,
): Promise<{ profilesEnabled: number; planSections: number; requirements: number } | null> {
  const { data, error } = await supabase.rpc('setup_camp_compliance', {
    p_camp_id: campId, p_season_id: seasonId, p_answers: answers, p_actor: actor,
  });
  if (error) { campError('setup compliance', error.message); return null; }
  const d = (data ?? {}) as Record<string, number>;
  return { profilesEnabled: d.profiles_enabled ?? 0, planSections: d.plan_sections ?? 0, requirements: d.requirements ?? 0 };
}

/** Re-evaluate every requirement against current evidence. Cheap; call after any write. */
export async function dbRecompute(campId: string, seasonId: string): Promise<number> {
  const { data, error } = await supabase.rpc('compute_camp_compliance', {
    p_camp_id: campId, p_season_id: seasonId,
  });
  if (error) { campError('recompute compliance', error.message); return 0; }
  return Number(data ?? 0);
}

// ─── Documents ────────────────────────────────────────────────────────────────
export async function dbUploadComplianceDocument(
  file: File, campId: string, seasonId: string, title: string,
  requirementIds: string[], expiresOn: string | null,
  uploader: { id: string | null; name: string | null },
  onProgress?: UploadProgress,
): Promise<ComplianceDocument> {
  const path = `${campId}/${seasonId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await uploadToBucket(supabase, BUCKET, path, file, onProgress);

  const { data, error } = await supabase.from('compliance_documents').insert({
    camp_id: campId, season_id: seasonId, title, bucket_path: path,
    mime: file.type || null, size_bytes: file.size, expires_on: expiresOn,
    uploaded_by: uploader.id, uploader_name: uploader.name,
  }).select('*').single();
  if (error) throw new Error(`The file uploaded but the record did not save. ${error.message}`);

  const doc = data as Row;
  if (requirementIds.length > 0) {
    const { error: linkErr } = await supabase.from('requirement_documents').insert(
      requirementIds.map((rid) => ({
        camp_id: campId, requirement_id: rid, document_id: doc.id as string, season_id: seasonId,
      })),
    );
    if (linkErr) campError('link document to requirement', linkErr.message);
  }

  return {
    id: doc.id as string, campId, seasonId, title, docType: null, bucketPath: path,
    mime: file.type || null, sizeBytes: file.size, expiresOn,
    uploadedBy: uploader.id, uploaderName: uploader.name,
    createdAt: doc.created_at as string, requirementIds,
  };
}

export async function dbLinkDocument(campId: string, seasonId: string, requirementId: string, documentId: string) {
  const { error } = await supabase.from('requirement_documents')
    .insert({ camp_id: campId, season_id: seasonId, requirement_id: requirementId, document_id: documentId });
  if (error) campError('link document', error.message);
}

export async function dbUnlinkDocument(seasonId: string, requirementId: string, documentId: string) {
  const { error } = await supabase.from('requirement_documents').delete()
    .eq('season_id', seasonId).eq('requirement_id', requirementId).eq('document_id', documentId);
  if (error) campError('unlink document', error.message);
}

export async function dbSignComplianceDocument(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
  if (error) { campError('sign compliance doc', error.message); return null; }
  return data?.signedUrl ?? null;
}

// ─── Plan sections ────────────────────────────────────────────────────────────
export async function dbUpdatePlanSection(
  id: string, patch: { body?: string | null; pageRef?: string | null; status?: PlanSectionStatus; naReason?: string | null },
  actor: string | null,
) {
  const row: Row = { updated_at: new Date().toISOString(), updated_by: actor };
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.pageRef !== undefined) row.page_ref = patch.pageRef;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.naReason !== undefined) row.na_reason = patch.naReason;
  const { error } = await supabase.from('compliance_plan_sections').update(row).eq('id', id);
  if (error) campError('update plan section', error.message);
}

// ─── Requirement overrides ────────────────────────────────────────────────────
/** A camp declaring a requirement not applicable. The reason is required and recorded. */
export async function dbSetRequirementNa(
  campId: string, seasonId: string, requirementId: string, reason: string | null, actor: string | null,
) {
  const { error } = await supabase.from('camp_requirement_status').upsert({
    camp_id: campId, season_id: seasonId, requirement_id: requirementId,
    status: reason ? 'not_applicable' : 'missing',
    na_reason: reason, na_by: reason ? actor : null, na_at: reason ? new Date().toISOString() : null,
    detail: {}, computed_at: new Date().toISOString(),
  }, { onConflict: 'camp_id,season_id,requirement_id' });
  if (error) campError('set requirement N/A', error.message);
}

export async function dbAssignRequirement(
  campId: string, seasonId: string, requirementId: string, assignee: string | null,
) {
  const { error } = await supabase.from('camp_requirement_status')
    .update({ assigned_to: assignee })
    .eq('camp_id', campId).eq('season_id', seasonId).eq('requirement_id', requirementId);
  if (error) campError('assign requirement', error.message);
}

// ─── Exports ──────────────────────────────────────────────────────────────────
/**
 * Notes that a packet was built, and for whom.
 *
 * The zip itself is assembled and saved in the browser, so bucket_path stays null: recording a
 * storage path for a file we never stored would be a lie a camp might later rely on. What the
 * row is for is the question "when did we last send the county something, and what was in
 * force at the time".
 */
export async function dbRecordComplianceExport(
  campId: string, seasonId: string, packageCode: string,
  reader: string | null, generatedBy: string | null,
) {
  const { error } = await supabase.from('compliance_exports').insert({
    camp_id: campId, season_id: seasonId, package_code: packageCode,
    reader, generated_by: generatedBy,
  });
  if (error) campError('record compliance export', error.message);
}

/**
 * Record one answer to a form question.
 *
 * Upsert on the natural key rather than insert-then-update, so a director correcting a typo
 * replaces the answer instead of adding a second one the projection would then have to choose
 * between.
 */
export async function dbSaveFormAnswer(
  campId: string, seasonId: string, questionKey: string, value: string, actor: string | null,
) {
  const { error } = await supabase.from('camp_form_answers').upsert({
    camp_id: campId, season_id: seasonId, question_key: questionKey,
    row_index: 0, value, answered_by: actor, answered_at: new Date().toISOString(),
  }, { onConflict: 'camp_id,season_id,question_key,row_index' });
  if (error) campError('save form answer', error.message);
  return !error;
}

// ─── Session capacity (DOH-367) ───────────────────────────────────────────────
/** One row of the capacity table as the editor holds it, before it has been saved. */
export type SessionCapacityInput = Omit<SessionCapacity, 'id' | 'campId' | 'seasonId' | 'updatedAt'>;

/** The ten rows DOH-367 prints. Also loaded in bulk; this is for reloading after a write. */
export async function dbLoadSessionCapacity(campId: string, seasonId: string): Promise<SessionCapacity[]> {
  const { data, error } = await supabase.from('compliance_session_capacity')
    .select('*').eq('camp_id', campId).eq('season_id', seasonId).order('session_index');
  if (error) { campError('load session capacity', error.message); return []; }
  return ((data ?? []) as Row[]).map(toSessionCapacity);
}

/**
 * Write one session row.
 *
 * Upsert on camp, season and index rather than insert-then-update, because the index is the
 * printed row: saving the same row twice must replace it, not add an eleventh the table has
 * nowhere to print. The index is checked here as well as in the database, so a bug produces a
 * logged error rather than a constraint violation the camp sees as a failed save.
 */
export async function dbSaveSessionCapacity(
  campId: string, seasonId: string, row: SessionCapacityInput, actor: string | null,
): Promise<SessionCapacity | null> {
  if (!Number.isInteger(row.sessionIndex) || row.sessionIndex < 1 || row.sessionIndex > 10) {
    campError('save session capacity', `session index ${row.sessionIndex} is outside the form's ten rows`);
    return null;
  }
  const payload: Row = {
    camp_id: campId, season_id: seasonId, session_index: row.sessionIndex,
    session_name: row.sessionName?.trim() || null,
    camp_type: row.campType,
    number_of_days: row.numberOfDays,
    source_session_id: row.sourceSessionId,
    updated_by: actor, updated_at: new Date().toISOString(),
  };
  for (const [prop, column] of CAPACITY_COLUMNS) {
    const n = Number(row[prop] ?? 0);
    payload[column] = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  const { data, error } = await supabase.from('compliance_session_capacity')
    .upsert(payload, { onConflict: 'camp_id,season_id,session_index' })
    .select('*').single();
  if (error) { campError('save session capacity', error.message); return null; }
  return toSessionCapacity(data as Row);
}

/** Remove one session row. Keyed by index, the same way the row is written. */
export async function dbDeleteSessionCapacity(campId: string, seasonId: string, sessionIndex: number) {
  const { error } = await supabase.from('compliance_session_capacity').delete()
    .eq('camp_id', campId).eq('season_id', seasonId).eq('session_index', sessionIndex);
  if (error) campError('delete session capacity', error.message);
}
