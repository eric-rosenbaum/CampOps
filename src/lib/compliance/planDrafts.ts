import type { ComplianceAnswers, SafetyStaff, SafetyItem } from '@/lib/types';

/**
 * Opening drafts for plan sections, assembled from facts the camp has already given us.
 *
 * The line this file holds: **facts we hold, never prose the camp must own.** A camp told us its
 * water comes from an on-site well, so the Water Supply section can start by saying that. It has
 * not told us its sampling schedule, its treatment, or what it does when a sample fails, and
 * writing those for it would be putting our invention into a document a director signs and a
 * sanitarian reads.
 *
 * So every draft here restates something on file and then stops, leaving the sentence the camp
 * has to finish visible and obviously theirs. A draft is never counted as complete, is labelled
 * as a draft in the UI, and is discarded the moment the camp edits it.
 */

export interface DraftContext {
  answers: ComplianceAnswers;
  campName: string;
  staff: SafetyStaff[];
  items: SafetyItem[];
  openingDate?: string | null;
  closingDate?: string | null;
}

type Draft = { text: string; from: string };

const yes = (v: string | undefined) => (v ?? '').toLowerCase() === 'true';

/** Section title → the draft, when we hold enough to write one honestly. */
export function draftFor(title: string, ctx: DraftContext): Draft | null {
  const a = ctx.answers;

  switch (title) {
    case 'Water Supply': {
      if (!a.water_source) return null;
      const well = a.water_source === 'well';
      return {
        from: 'your setup answers',
        text: well
          ? 'Drinking water is supplied by an on-site well.\n\nStill to write: how and how often the well is sampled, who takes the samples, where the results are kept, and what happens when a sample fails.'
          : 'Drinking water is supplied from the public water system.\n\nStill to write: where the connection enters the property, who to contact about an interruption, and how non-potable outlets are labelled.',
      };
    }

    case 'On-Site Sewage Treatment System(s)': {
      if (!a.sewage) return null;
      const septic = a.sewage === 'septic';
      return {
        from: 'your setup answers',
        text: septic
          ? 'Sewage is handled by an on-site septic system.\n\nStill to write: which buildings it serves, when it was last inspected and pumped, who services it, and what you do if it backs up or surfaces.'
          : 'Sewage discharges to the public sewer.\n\nStill to write: who to contact about a blockage or interruption, and what you do if service is lost while campers are on site.',
      };
    }

    case 'Chain of Command': {
      const named = ctx.staff.filter((s) => s.isActive && s.title);
      if (named.length < 2) return null;
      const lines = named.slice(0, 12).map((s) => `  ${s.name} — ${s.title}`).join('\n');
      return {
        from: 'your staff roster',
        text: `These positions are on your roster for this season:\n\n${lines}\n\nStill to write: who reports to whom, who is in charge when the director is off site, and where the chain of command is posted.`,
      };
    }

    case 'Camp Infirmary Description': {
      if (a.camp_type !== 'overnight') return null;
      return {
        from: 'your setup answers',
        text: 'This is an overnight camp, so a separate infirmary is required rather than a holding area.\n\nStill to write: which building it is, how many beds, whether it has a separate isolation room and its own bathroom, how medication is stored, and whether a vehicle can reach it in all weather.',
      };
    }

    case 'Fire Prevention': {
      const fire = ctx.items.filter((i) => i.category === 'fire');
      if (fire.length === 0) return null;
      return {
        from: 'your safety register',
        text: `You have ${fire.length} fire protection item${fire.length === 1 ? '' : 's'} on the register, inspected on the schedule recorded there.\n\nStill to write: your smoking rule, where open flames are permitted and under what supervision, and where flammable liquids are stored.`,
      };
    }

    case 'Lightning Risk Assessment': {
      const water = yes(a.has_pool) || yes(a.has_waterfront);
      if (!water) return null;
      return {
        from: 'your setup answers',
        text: 'You run aquatics, so this section has to cover clearing the water.\n\nStill to write: who watches the weather and how, the signal that clears the water and the outdoor activity areas, where campers shelter, and how long you wait after the last thunder before returning.',
      };
    }

    default:
      return null;
  }
}

/** Titles that have a draft available given this camp's data. Drives the button state. */
export function hasDraft(title: string, ctx: DraftContext): boolean {
  return draftFor(title, ctx) !== null;
}
