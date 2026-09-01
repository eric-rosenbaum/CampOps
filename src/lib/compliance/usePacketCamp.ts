import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useComplianceStore } from '@/store/complianceStore';
import { applicableQuestions } from './formAnswers';
import {
  doh367Readiness, doh367aReadiness, type FormReadiness, type ReadinessInput,
} from './formReadiness';
import { NY_FORMS, campOwnedCount, coverage, packetRoster, type PacketCamp, type PacketForm }
  from './nyPacket';

/**
 * The camp as the NY forms want it, assembled once.
 *
 * Lives outside FormsPanel so that anything else asking "is this form ready" gets the same
 * answer as the form's own page. Two places computing readiness from the same raw data is how
 * a row comes to say MET while the form says two things still to do.
 */
export function usePacketCamp(): PacketCamp {
  const { currentCamp } = useCampStore();
  const season = useChecklistStore((s) => s.season);
  const safetyStaff = useSafetyStore((s) => s.staff);
  const safetyCerts = useSafetyStore((s) => s.certifications);
  const answers = useComplianceStore((s) => s.answers);

  // The forms ask for these three by name, and the safety roster already has them. Matched on
  // title rather than a dedicated field, so a camp that has not filled its roster simply leaves
  // the line blank for a person to write in, which is the correct outcome.
  const byTitle = (re: RegExp) =>
    safetyStaff.find((m) => m.isActive && re.test(m.title))?.name;

  // The county is the camp's own setup answer, not a constant. It was hardcoded, which printed
  // "Westchester" on the packet of any camp that is not in Westchester, and printed it even for
  // camps in Westchester without ever reading what they told us.
  const county = (answers.county ?? '').trim();

  return {
    campName: currentCamp?.name ?? 'Camp',
    // Stored uppercase as an applicability key; the form wants it written the way a person does.
    county: county ? county.charAt(0) + county.slice(1).toLowerCase() : '',
    address: [currentCamp?.addressLine1, currentCamp?.city, currentCamp?.state]
      .filter(Boolean).join(', '),
    town: currentCamp?.city ?? undefined,
    directorName: byTitle(/^camp director$|^director$/i),
    healthDirectorName: byTitle(/health director/i),
    aquaticsDirectorName: byTitle(/aquatics? director/i),
    openDate: season?.openingDate,
    closeDate: season?.closingDate,
    // DOH-367a is three tables of certified staff, and DOH-367 asks after each director's
    // background. Both read the roster from here, in one fixed order.
    staff: packetRoster(safetyStaff, safetyCerts),
  };
}

/**
 * Readiness for the forms that have a detail page.
 *
 * A form earns one only once we can take it all the way to ready; half-describing a form would
 * be the same "mostly filled" problem one level up. DOH-367 first, then DOH-367a, which is the
 * same filing's continuation sheet and is drawn almost entirely from the roster.
 *
 * A form with no entry here returns null and keeps the plain row on the forms list, which is the
 * honest state for one we have not yet described.
 */
export function useReadinessFor(): (form: PacketForm) => FormReadiness | null {
  const camp = usePacketCamp();
  const season = useChecklistStore((s) => s.season);
  const {
    planSections, answers, planRowKeys, formQuestions, formAnswers, sessionCapacity,
    activeFormCodes, planDocument, planAnswers,
  } = useComplianceStore();
  const inScope = activeFormCodes();
  const uploadedPlan = planDocument();

  const READINESS: Record<string, (input: ReadinessInput) => FormReadiness> = {
    'DOH-367': doh367Readiness,
    'DOH-367a': doh367aReadiness,
  };

  return (form: PacketForm) => {
    const build = READINESS[form.code];
    if (!build) return null;
    const ours = form.map.fields.length;
    const pct = coverage(
      form, camp, planSections, answers, planRowKeys(), formQuestions, formAnswers, sessionCapacity,
    );
    return build({
      camp, seasonName: season?.name ?? null,
      // Only the questions actually being asked. Counting a question that setup ruled out, or one
      // that prints on a form we are not showing, would make a block look unfinished with nothing
      // on the records page to finish it.
      questions: applicableQuestions(formQuestions, answers, formAnswers, inScope),
      answers: formAnswers,
      setupAnswers: answers,
      sessions: sessionCapacity, planSections, planAnswers,
      // So the block can say which plan travels with the form, and can refuse to call itself
      // done when the form claims a plan the packet has no copy of.
      planDocumentTitle: uploadedPlan?.title ?? null,
      ours: campOwnedCount(form), filled: Math.round((pct / 100) * campOwnedCount(form)),
      notOurs: ours - campOwnedCount(form),
    });
  };
}

/** Whether a form we generate has everything it needs to be printed and signed. */
export function useFormIsReady(): (formCode: string) => boolean | null {
  const readinessFor = useReadinessFor();
  return (formCode: string) => {
    const form = NY_FORMS.find((f) => f.code === formCode);
    if (!form) return null;
    const readiness = readinessFor(form);
    if (!readiness) return null;
    return readiness.parts.every((p) => p.status !== 'todo');
  };
}
