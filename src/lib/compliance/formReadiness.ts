import type {
  ComplianceFormQuestion, FormAnswers, SessionCapacity, CompliancePlanSection, PlanAnswers,
} from '@/lib/types';
import type { ComplianceAnswers } from '@/lib/types';
import {
  DOH367A_ROWS, askedYes, doh367aRoster, lifeguardsWithoutCpr, type PacketCamp,
} from './nyPacket';
import { PLAN_STATUS_QUESTION, planIsWritten } from './planSource';

/**
 * What a form is made of, where each part comes from, and whether it is done.
 *
 * A percentage is the wrong number for this. It invites "good enough" on a document somebody
 * signs, and it tells a director nothing they can act on. What they need is a short list: these
 * parts are filled and here is what from, these parts are not and here is where to go.
 *
 * The provenance matters as much as the status. A director cannot sign a form they have not
 * checked, and checking two hundred and eighty cells against their own records is not something
 * anyone will do. Checking five sources is.
 */

export type PartStatus = 'done' | 'todo' | 'by_hand';

export interface FormPart {
  /** What a person would call this block of the form. */
  label: string;
  /** Where the values come from, in the camp's own terms. */
  source: string;
  status: PartStatus;
  /** Shown when there is something to do. */
  detail?: string;
  /**
   * The questions this block of the form is made of, in printed order.
   *
   * The block answers them itself. Sending a camp to a separate questions page and back was the
   * shape this had before, and it meant the thing being filled in and the place you filled it in
   * were never on screen together -- so "2 things still to do" and a page of boxes had to be
   * reconciled by the person, every time.
   */
  questionKeys?: string[];
  /** An editor that is not a list of questions: the session grid, the printed-role list. */
  panel?: 'sessions' | 'roles' | 'plan';
  /**
   * Somewhere else entirely, for the blocks fed by data this module does not own: the camp
   * record, the season, the written plan.
   */
  goTo?: { href: string; label: string } | { tab: 'plan'; label: string };
}

export interface FormReadiness {
  parts: FormPart[];
  ready: boolean;
  outstanding: number;
  /** Cells on the page that are the reviewer's, or that nobody may fill. */
  notOurs: number;
  ours: number;
  filled: number;
}

export interface ReadinessInput {
  camp: PacketCamp;
  seasonName: string | null;
  questions: ComplianceFormQuestion[];
  answers: FormAnswers;
  sessions: SessionCapacity[];
  planSections: CompliancePlanSection[];
  /** Answers to the state's 92-question template, the other way a plan gets written. */
  planAnswers?: PlanAnswers;
  /**
   * The setup interview's answers.
   *
   * Needed to tell "this section does not apply to you" from "this section is empty". A camp
   * with no rifle range and a camp that has one and has told us nothing about its instructor
   * both print a blank riflery block, and only one of them has something to do.
   */
  setupAnswers: ComplianceAnswers;
  /** The camp's own plan file, when they uploaded one instead of writing the sections. */
  planDocumentTitle?: string | null;
  /** Camp-owned and filled cell counts, from coverage(). */
  ours: number;
  filled: number;
  notOurs: number;
}

const answered = (a: FormAnswers, key: string) => (a[key] ?? '').trim() !== '';

/**
 * How many of a group's questions this camp has answered.
 *
 * `except` exists because a group is a place to sit down and answer things, while a part is a
 * block of the printed form, and the two do not line up exactly. The facility code lives in the
 * filing group but has its own row on this page, so counting it in both would tell a director
 * they have one more thing to do than they do.
 */
function groupProgress(
  questions: ComplianceFormQuestion[], answers: FormAnswers, groupKey: string,
  except: string[] = [],
): { done: number; total: number } {
  const qs = questions.filter((q) => q.groupKey === groupKey && !except.includes(q.questionKey));
  return { done: qs.filter((q) => answered(answers, q.questionKey)).length, total: qs.length };
}


/**
 * DOH-367, block by block, in the order the form prints them.
 *
 * Hand-written rather than derived, because the point is to describe the form the way the person
 * holding it sees it. "The activity grid" is one thing to them; it is thirty-six cells to us.
 */
/** Filing-group questions that print in a different block of the form, so they are asked there. */
const FILING_ELSEWHERE = [
  'ny.filing.facility_code',
  PLAN_STATUS_QUESTION,
  'ny.safety_plan.previously_submitted_on',
];

export function doh367Readiness(input: ReadinessInput): FormReadiness {
  const { camp, seasonName, questions, answers, sessions, planSections, planAnswers } = input;
  const planDocumentTitle = input.planDocumentTitle ?? null;
  const parts: FormPart[] = [];

  parts.push({
    label: 'Facility name and address',
    source: 'Your camp record',
    status: camp.campName && camp.address ? 'done' : 'todo',
    detail: camp.campName && camp.address ? undefined : 'Add your address under Camp Info.',
    goTo: { href: '/settings', label: 'Camp Info' },
  });

  parts.push({
    label: 'Season open and close dates',
    source: seasonName ? `Your ${seasonName} season` : 'Your season',
    status: camp.openDate && camp.closeDate ? 'done' : 'todo',
    detail: camp.openDate && camp.closeDate ? undefined : 'Set your season dates under Pre/Post Camp.',
    goTo: { href: '/pre-post', label: 'Pre/Post Camp' },
  });

  const code = answered(answers, 'ny.filing.facility_code');
  parts.push({
    label: 'Facility code',
    source: 'Your county assigns this',
    status: code ? 'done' : 'by_hand',
    detail: code ? undefined
      : 'Leave blank if this is your first application. The county fills it in when they issue your permit.',
    questionKeys: ['ny.filing.facility_code'],
  });

  const acts = (answers['ny.activity.offered'] ?? '').split(',').filter(Boolean).length;
  parts.push({
    label: 'Activity grid',
    source: 'Your setup answers, plus anything else you tick',
    status: acts > 0 ? 'done' : 'todo',
    detail: acts > 0
      ? `${acts} extra ${acts === 1 ? 'activity' : 'activities'} ticked on top of what setup already told us.`
      : 'Tick the activities you offer. Archery, boating and the rest come from setup already.',
    questionKeys: questions.filter((q) => q.groupKey === 'activities')
      .sort((a, b) => a.sortOrder - b.sortOrder).map((q) => q.questionKey),
  });

  const rows = sessions.filter((s) => s.sessionName || s.numberOfDays);
  parts.push({
    label: 'Camper capacity table',
    source: 'Your sessions and last season’s attendance',
    status: rows.length > 0 ? 'done' : 'todo',
    detail: rows.length > 0
      ? `${rows.length} ${rows.length === 1 ? 'session' : 'sessions'} on record.`
      : 'The form wants last season’s actual attendance by age and sex. Fill it once here.',
    panel: 'sessions',
    questionKeys: ['ny.capacity.estimates_used'],
  });

  const directorOnRoster = Boolean(camp.directorName);
  const dirQs = groupProgress(questions, answers, 'key_staff');
  parts.push({
    label: 'Camp director, health director and aquatics director',
    source: directorOnRoster
      ? `Your staff roster${camp.directorName ? `, starting with ${camp.directorName}` : ''}`
      : 'Your staff roster',
    status: directorOnRoster && dirQs.done === dirQs.total ? 'done' : 'todo',
    detail: !directorOnRoster
      ? 'Nobody on the roster has the title Camp Director, so these lines print blank.'
      : dirQs.done < dirQs.total
        ? `${dirQs.total - dirQs.done} of ${dirQs.total} details still to add: dates of birth, education, qualifying experience.`
        : undefined,
    panel: 'roles',
    questionKeys: questions.filter((q) => q.groupKey === 'key_staff')
      .sort((a, b) => a.sortOrder - b.sortOrder).map((q) => q.questionKey),
  });

  parts.push({
    label: 'Certification tables',
    source: 'The certifications on your staff records',
    status: 'done',
    detail: 'Provider, course title and issue date come straight from each person’s certification.',
    goTo: { href: '/settings/staff', label: 'Staff and certs' },
  });

  const planStatus = answers[PLAN_STATUS_QUESTION] ?? '';
  const planDone = planSections.filter((x) => x.status === 'complete' || x.status === 'not_applicable').length;
  // What the packet would actually carry, decided by the same rule the packet uses.
  const planExists = planDocumentTitle !== null || planIsWritten(planSections, planAnswers);
  // A box saying the plan is attached, with nothing to attach, is the one state on this form
  // that is worse than an unanswered question: it reads as done and files as incomplete. So it
  // is not "done" here, and the block says which of the two things to fix.
  const planClaimUnbacked = (planStatus === 'attached' || planStatus === 'update') && !planExists;
  parts.push({
    label: 'Written safety plan',
    source: planStatus === 'previously'
      ? 'A plan already on file with the county'
      : planDocumentTitle
        ? 'The plan you uploaded'
        : 'The plan you are writing in CampCommand',
    status: !planStatus || planClaimUnbacked ? 'todo' : 'done',
    detail: planClaimUnbacked
      ? 'This says your plan goes with the application, but there is no plan in CampCommand to send. Upload the one you already have, write it here, or say it went in a previous year.'
      : !planStatus
        ? 'The form asks which of three situations you are in: the plan is attached, it went in a previous year and is still current, or an update is attached. Answer that and the right box ticks.'
        : planStatus === 'previously'
          ? 'Ticked as already on file. No plan goes with this application.'
          : planDocumentTitle
            ? `Ticked as attached. ${planDocumentTitle} goes with your packet exactly as you uploaded it.`
            : `Ticked as attached. ${planDone} of ${planSections.length} sections written, and the plan downloads with your packet.`,
    questionKeys: [PLAN_STATUS_QUESTION, 'ny.safety_plan.previously_submitted_on'],
    panel: 'plan',
    goTo: { tab: 'plan', label: 'Open the plan' },
  });

  const filingQs = groupProgress(questions, answers, 'filing', FILING_ELSEWHERE);
  parts.push({
    label: 'Facility changes, trips and the parents’ brochure',
    source: 'This year’s filing questions',
    status: filingQs.done === filingQs.total ? 'done' : 'todo',
    detail: filingQs.done === filingQs.total ? undefined
      : `${filingQs.total - filingQs.done} of ${filingQs.total} to answer: what changed at the camp since last season, whether you take campers on trips, and which camper rights brochure you give parents.`,
    questionKeys: questions
      .filter((q) => q.groupKey === 'filing' && !FILING_ELSEWHERE.includes(q.questionKey))
      .sort((a, b) => a.sortOrder - b.sortOrder).map((q) => q.questionKey),
  });

  // The typed signature is a convenience, not a requirement: left blank the form prints an
  // empty rule for a wet signature, which is how this gets filed. Counting it would leave the
  // block reading "to do" forever for a camp that has done everything asked of it.
  const NOT_NEEDED_TO_PRINT = ['ny.operator.signature_text'];
  const opQs = groupProgress(questions, answers, 'operator', NOT_NEEDED_TO_PRINT);
  parts.push({
    label: 'Operator name and title',
    source: 'Who signs the permit',
    status: opQs.done === opQs.total ? 'done' : 'todo',
    detail: opQs.done === opQs.total ? undefined
      : 'The legal permit holder, which is often not the camp director.',
    questionKeys: questions.filter((q) => q.groupKey === 'operator')
      .sort((a, b) => a.sortOrder - b.sortOrder).map((q) => q.questionKey),
  });

  parts.push({
    label: 'Signature and date',
    source: 'Wet ink, after you print it',
    status: 'by_hand',
    detail: 'Not ours to fill. Print the form and sign it.',
  });

  const outstanding = parts.filter((p) => p.status === 'todo').length;
  return {
    parts, outstanding, ready: outstanding === 0,
    ours: input.ours, filled: input.filled, notOurs: input.notOurs,
  };
}

/**
 * DOH-367a, block by block.
 *
 * The continuation sheet of DOH-367: three tables of certified staff, a counselor headcount, and
 * a riflery instructor. It is the first form unparked, and the reason it is first is that almost
 * all of it is already on file — the tables are drawn from the safety roster and its
 * certifications, not from anything a camp has to retype here.
 *
 * So the blocks describing those tables report rather than ask. They say who will print and what
 * will be blank, because on this form a blank is usually a real gap in the camp's records rather
 * than a question nobody answered: a lifeguard with no CPR card on file prints as a lifeguard
 * with an empty CPR column, and that is the county's cue to ask about it.
 */
export function doh367aReadiness(input: ReadinessInput): FormReadiness {
  const { camp, seasonName, questions, answers, setupAnswers } = input;
  const parts: FormPart[] = [];

  // The header of every NY form, filled from the camp record and the season. Named here because
  // this form is filed on its own as often as it is filed behind DOH-367, and a camp looking at
  // it needs to know these three lines are not theirs to type.
  parts.push({
    label: 'Facility name and season dates',
    source: seasonName ? `Your camp record and your ${seasonName} season` : 'Your camp record and season',
    status: camp.campName && camp.openDate && camp.closeDate ? 'done' : 'todo',
    detail: camp.campName && camp.openDate && camp.closeDate ? undefined
      : 'The form prints your camp name and the dates you open and close. Set your season dates under Pre/Post Camp.',
    goTo: { href: '/pre-post', label: 'Pre/Post Camp' },
  });

  // The same question DOH-367 asks, deliberately. One answer, both forms: a camp that typed
  // their code once should never be asked for it again because a second sheet also prints it.
  const code = answered(answers, 'ny.filing.facility_code');
  parts.push({
    label: 'Facility code',
    source: 'Your county assigns this',
    status: code ? 'done' : 'by_hand',
    detail: code ? 'The same code DOH-367 prints; answered once, it fills both.'
      : 'Leave blank if this is your first application. The county fills it in when they issue your permit.',
    questionKeys: ['ny.filing.facility_code'],
  });

  const { psi, guards, firstAiders } = doh367aRoster(camp);
  const noCpr = lifeguardsWithoutCpr(camp);
  const hasWater = askedYes(setupAnswers, 'has_pool') === true
    || askedYes(setupAnswers, 'has_waterfront') === true;

  /** A table that reports the roster: how many rows print, and what the form does with the rest. */
  const table = (
    label: string, people: number, rows: number, cert: string, extra?: string,
  ): FormPart => ({
    label,
    source: 'The certifications on your staff records',
    // Never "to do": nobody can answer this block here. What it can do is say what will print.
    status: 'done',
    detail: people === 0
      ? `Nobody on your roster holds ${cert}, so this table prints blank.`
      : people > rows
        // The form's own note says to attach a sheet, so this is the camp's cue to do that
        // rather than a fault in what we drew.
        ? `${rows} of ${people} print here — the form has ${rows} rows. Attach a sheet for the other ${people - rows}.`
        : `${people} of ${rows} rows fill${extra ? `. ${extra}` : '.'}`,
    goTo: { href: '/settings/staff', label: 'Staff and certs' },
  });

  parts.push(table(
    'Progressive swimming instructors', psi.length, DOH367A_ROWS.psi,
    'a water safety instructor certification',
  ));

  const guardTable = table(
    'Lifeguards', guards.length, DOH367A_ROWS.lifeguard, 'a lifeguard certification',
    noCpr.length > 0
      ? `${noCpr.length} of them ${noCpr.length === 1 ? 'has' : 'have'} no CPR card on file, and the form asks each lifeguard for one, so that column prints blank for ${noCpr.length === 1 ? 'them' : 'those rows'}.`
      : undefined,
  );
  // The one case on this form where an empty table is something to fix rather than to report:
  // the camp has told us it has water, and nobody on the roster is certified to guard it.
  parts.push(guards.length === 0 && hasWater
    ? {
        ...guardTable,
        status: 'todo',
        detail: 'You told us you have a pool or waterfront, and nobody on your roster holds a lifeguard certification, so this table prints blank. Add their certifications under Staff and certs.',
      }
    : guardTable);

  parts.push(table(
    'Additional first aid and CPR staff', firstAiders.length, DOH367A_ROWS.firstAid,
    'a first aid or CPR certification',
    'Lifeguards already listed above are not repeated here.',
  ));

  // The counselor table is the one block on this form that is neither on the roster nor
  // derivable from it: who counts as a counselor is a judgement the camp makes, and reading it
  // out of a free-text job title would silently miss a unit head and silently count a
  // counselor-in-training. Its first row is day-camps-only, which is why an overnight camp is
  // asked four questions here and a day camp six.
  const counselorQs = groupProgress(questions, answers, 'counselors');
  parts.push({
    label: 'Counselor headcount',
    source: 'Counted by you',
    status: counselorQs.done === counselorQs.total ? 'done' : 'todo',
    detail: counselorQs.done === counselorQs.total
      ? undefined
      : `${counselorQs.total - counselorQs.done} of ${counselorQs.total} cells to fill: your counselors by age and sex.`,
    questionKeys: questions.filter((q) => q.groupKey === 'counselors')
      .sort((a, b) => a.sortOrder - b.sortOrder).map((q) => q.questionKey),
  });

  // Ruled out by setup, this group is empty and reads as done, which is correct: there is
  // nothing to do and nothing will print. Said out loud, because a silently complete block on a
  // government form invites the question "did it not ask me something?".
  const riflery = askedYes(setupAnswers, 'has_riflery');
  const rifleQs = groupProgress(questions, answers, 'riflery');
  parts.push({
    label: 'Riflery instructor',
    source: riflery === false ? 'Your setup answers' : 'Named by you',
    status: rifleQs.done === rifleQs.total ? 'done' : 'todo',
    detail: riflery === false
      ? 'You told us you do not run riflery, so this section prints blank.'
      : rifleQs.done === rifleQs.total
        ? undefined
        : `${rifleQs.total - rifleQs.done} of ${rifleQs.total} to answer. Nothing on your staff roster says who runs the range, so the form asks for them by name.`,
    questionKeys: questions.filter((q) => q.groupKey === 'riflery')
      .sort((a, b) => a.sortOrder - b.sortOrder).map((q) => q.questionKey),
  });

  const NOT_NEEDED_TO_PRINT = ['ny.operator.signature_text'];
  const opQs = groupProgress(questions, answers, 'operator', NOT_NEEDED_TO_PRINT);
  parts.push({
    label: 'Operator name and title',
    source: 'Who signs the permit',
    status: opQs.done === opQs.total ? 'done' : 'todo',
    detail: opQs.done === opQs.total
      ? 'The same answers DOH-367 prints.'
      : 'The legal permit holder, which is often not the camp director. Answering here fills DOH-367 too.',
    questionKeys: questions.filter((q) => q.groupKey === 'operator')
      .sort((a, b) => a.sortOrder - b.sortOrder).map((q) => q.questionKey),
  });

  parts.push({
    label: 'Signature and date',
    source: 'Wet ink, after you print it',
    status: 'by_hand',
    detail: 'Not ours to fill. This form carries its own attestation, so it is signed separately from DOH-367.',
  });

  const outstanding = parts.filter((p) => p.status === 'todo').length;
  return {
    parts, outstanding, ready: outstanding === 0,
    ours: input.ours, filled: input.filled, notOurs: input.notOurs,
  };
}
