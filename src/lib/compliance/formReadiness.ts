import type {
  ComplianceFormQuestion, FormAnswers, SessionCapacity, CompliancePlanSection,
} from '@/lib/types';
import type { PacketCamp } from './nyPacket';

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
   * Where to go and do it.
   *
   * `anchor` is the id of the section on that tab that holds the thing, for the parts whose
   * source is one block of a long page. Without it the camp lands at the top of Your records
   * and has to find the roster themselves, which is the gap this whole list exists to close.
   */
  /**
   * Where to go and do it. `group` opens that question group and scrolls to it, `highlight`
   * names the exact questions still unanswered so the page can point at them. Landing a camp
   * on the right tab and leaving them to hunt is barely better than not linking at all.
   */
  goTo?:
    | {
        tab: 'records' | 'plan' | 'documents'; label: string;
        anchor?: string; group?: string; highlight?: string[];
      }
    | { href: string; label: string };
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

/** The questions in a group this camp has not answered yet, so the page can point at them. */
function unansweredIn(
  questions: ComplianceFormQuestion[], answers: FormAnswers, groupKey: string,
  except: string[] = [],
): string[] {
  return questions
    .filter((q) => q.groupKey === groupKey && !except.includes(q.questionKey))
    .filter((q) => !answered(answers, q.questionKey))
    .map((q) => q.questionKey);
}

/**
 * DOH-367, block by block, in the order the form prints them.
 *
 * Hand-written rather than derived, because the point is to describe the form the way the person
 * holding it sees it. "The activity grid" is one thing to them; it is thirty-six cells to us.
 */
export function doh367Readiness(input: ReadinessInput): FormReadiness {
  const { camp, seasonName, questions, answers, sessions, planSections } = input;
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
    goTo: { tab: 'records', label: 'Enter it', group: 'filing', highlight: ['ny.filing.facility_code'] },
  });

  const acts = (answers['ny.activity.offered'] ?? '').split(',').filter(Boolean).length;
  parts.push({
    label: 'Activity grid',
    source: 'Your setup answers, plus anything else you tick',
    status: acts > 0 ? 'done' : 'todo',
    detail: acts > 0
      ? `${acts} extra ${acts === 1 ? 'activity' : 'activities'} ticked on top of what setup already told us.`
      : 'Tick the activities you offer. Archery, boating and the rest come from setup already.',
    goTo: { tab: 'records', label: 'Tick your activities', group: 'activities' },
  });

  const rows = sessions.filter((s) => s.sessionName || s.numberOfDays);
  parts.push({
    label: 'Camper capacity table',
    source: 'Your sessions and last season’s attendance',
    status: rows.length > 0 ? 'done' : 'todo',
    detail: rows.length > 0
      ? `${rows.length} ${rows.length === 1 ? 'session' : 'sessions'} on record.`
      : 'The form wants last season’s actual attendance by age and sex. Fill it once here.',
    goTo: { tab: 'records', label: 'Fill in your sessions', anchor: 'compliance-sessions' },
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
    goTo: {
      tab: 'records', label: 'Add director details', anchor: 'compliance-roster',
      group: 'key_staff', highlight: unansweredIn(questions, answers, 'key_staff'),
    },
  });

  parts.push({
    label: 'Certification tables',
    source: 'The certifications on your staff records',
    status: 'done',
    detail: 'Provider, course title and issue date come straight from each person’s certification.',
    goTo: { href: '/compliance', label: 'Staff and certs' },
  });

  const planStatus = answers['ny.safety_plan.previously_submitted'] ?? '';
  const planDone = planSections.filter((x) => x.status === 'complete' || x.status === 'not_applicable').length;
  parts.push({
    label: 'Written safety plan',
    source: planStatus === 'previously'
      ? 'A plan already on file with the county'
      : 'The plan you are writing in CampCommand',
    status: planStatus ? 'done' : 'todo',
    detail: !planStatus
      ? 'The form asks which of three situations you are in: the plan is attached, it went in a previous year and is still current, or an update is attached. Answer that and the right box ticks.'
      : planStatus === 'previously'
        ? 'Ticked as already on file. Nothing from the plan builder goes with this application.'
        : `Ticked as attached. ${planDone} of ${planSections.length} sections written, and the plan downloads with your packet.`,
    goTo: planStatus
      ? { tab: 'records', label: 'Change this', group: 'filing', highlight: ['ny.safety_plan.previously_submitted'] }
      : { tab: 'records', label: 'Answer this', group: 'filing', highlight: ['ny.safety_plan.previously_submitted'] },
  });

  const filingQs = groupProgress(questions, answers, 'filing',
    ['ny.filing.facility_code', 'ny.safety_plan.previously_submitted', 'ny.safety_plan.previously_submitted_on']);
  parts.push({
    label: 'Facility changes, trips and the parents’ brochure',
    source: 'This year’s filing questions',
    status: filingQs.done === filingQs.total ? 'done' : 'todo',
    detail: filingQs.done === filingQs.total ? undefined
      : `${filingQs.total - filingQs.done} of ${filingQs.total} to answer: what changed at the camp since last season, whether you take campers on trips, and which camper rights brochure you give parents.`,
    goTo: {
      tab: 'records', label: 'Answer them', group: 'filing',
      highlight: unansweredIn(questions, answers, 'filing',
        ['ny.filing.facility_code', 'ny.safety_plan.previously_submitted', 'ny.safety_plan.previously_submitted_on']),
    },
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
    goTo: {
      tab: 'records', label: 'Say who signs', group: 'operator',
      highlight: unansweredIn(questions, answers, 'operator', NOT_NEEDED_TO_PRINT),
    },
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
