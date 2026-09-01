import { supabase } from './supabase';
import { campError } from './campLog';
import type { SafetyStaff } from './types';

/**
 * Links a camp sends to its staff so each person fills in their own record.
 *
 * The roster arrives by CSV; the fields the permit forms need — date of birth, education,
 * qualifying experience — arrive from the people themselves, because they are in none of the
 * systems a roster is exported from. Camps already do this by email. This removes the re-typing.
 *
 * Submissions land in a queue and an admin applies them. A public link that wrote straight to the
 * roster would be an unauthenticated door into camp data.
 */

export interface StaffIntakeLink {
  id: string;
  campId: string;
  staffId: string | null;
  token: string;
  label: string | null;
  expiresOn: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface StaffIntakeSubmission {
  id: string;
  campId: string;
  staffId: string | null;
  payload: {
    name: string;
    title: string | null;
    date_of_birth: string | null;
    sex: string | null;
    education: string | null;
    qualifying_experience: string | null;
  };
  submittedAt: string;
  appliedAt: string | null;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

/**
 * A token with enough entropy that guessing one is not a route in.
 *
 * 160 bits, url-safe. These links get forwarded around a camp's staff email thread, so they are
 * treated as capabilities: unguessable, revocable, and expiring by default.
 */
function newToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function dbCreateIntakeLink(
  campId: string, seasonId: string | null,
  opts: { staffId?: string | null; label?: string | null; expiresOn?: string | null },
  actor: string | null,
): Promise<StaffIntakeLink | null> {
  const { data, error } = await supabase.from('staff_intake_links').insert({
    camp_id: campId, season_id: seasonId, staff_id: opts.staffId ?? null,
    token: newToken(), label: opts.label ?? null, expires_on: opts.expiresOn ?? null,
    created_by: actor,
  }).select('*').single();
  if (error) { campError('create intake link', error.message); return null; }
  return toLink(data as Row);
}

export async function dbRevokeIntakeLink(id: string): Promise<boolean> {
  const { error } = await supabase.from('staff_intake_links')
    .update({ revoked_at: new Date().toISOString() }).eq('id', id);
  if (error) { campError('revoke intake link', error.message); return false; }
  return true;
}

export async function dbLoadIntake(campId: string): Promise<{
  links: StaffIntakeLink[]; submissions: StaffIntakeSubmission[];
}> {
  const [l, s2] = await Promise.all([
    supabase.from('staff_intake_links').select('*').eq('camp_id', campId)
      .order('created_at', { ascending: false }),
    supabase.from('staff_intake_submissions').select('*').eq('camp_id', campId)
      .is('applied_at', null).order('submitted_at', { ascending: false }),
  ]);
  return {
    links: ((l.data ?? []) as Row[]).map(toLink),
    submissions: ((s2.data ?? []) as Row[]).map(toSubmission),
  };
}

/** Mark a submission handled. The roster write itself goes through the safety store. */
export async function dbMarkSubmissionApplied(id: string, actor: string | null): Promise<boolean> {
  const { error } = await supabase.from('staff_intake_submissions')
    .update({ applied_at: new Date().toISOString(), applied_by: actor }).eq('id', id);
  if (error) { campError('apply intake submission', error.message); return false; }
  return true;
}

/** What the person opening the link is allowed to see: the camp's name, and their own. */
export async function rpcIntakePrompt(token: string): Promise<{
  campName: string; personName: string | null; isOpen: boolean;
} | null> {
  const { data, error } = await supabase.rpc('staff_intake_prompt', { p_token: token });
  if (error || !data || (data as Row[]).length === 0) return null;
  const r = (data as Row[])[0];
  return {
    campName: String(r.camp_name),
    personName: s(r.person_name),
    isOpen: Boolean(r.is_open),
  };
}

export async function rpcIntakeSubmit(token: string, v: {
  name: string; title: string; dateOfBirth: string | null; sex: string;
  education: string; qualifyingExperience: string;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('staff_intake_submit', {
    p_token: token, p_name: v.name, p_title: v.title,
    p_date_of_birth: v.dateOfBirth, p_sex: v.sex,
    p_education: v.education, p_qualifying_experience: v.qualifyingExperience,
  });
  if (error) return false;
  return Boolean(data);
}

/** A submission turned into the patch that goes onto a staff record. */
export function submissionPatch(sub: StaffIntakeSubmission): Partial<SafetyStaff> {
  return {
    name: sub.payload.name,
    title: sub.payload.title ?? '',
    dateOfBirth: sub.payload.date_of_birth,
    sex: sub.payload.sex,
    education: sub.payload.education,
    qualifyingExperience: sub.payload.qualifying_experience,
  };
}

function toLink(r: Row): StaffIntakeLink {
  return {
    id: r.id as string, campId: r.camp_id as string, staffId: s(r.staff_id),
    token: r.token as string, label: s(r.label), expiresOn: s(r.expires_on),
    revokedAt: s(r.revoked_at), createdAt: r.created_at as string,
  };
}

function toSubmission(r: Row): StaffIntakeSubmission {
  return {
    id: r.id as string, campId: r.camp_id as string, staffId: s(r.staff_id),
    payload: r.payload as StaffIntakeSubmission['payload'],
    submittedAt: r.submitted_at as string, appliedAt: s(r.applied_at),
  };
}
