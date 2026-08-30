import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useComplianceStore } from '@/store/complianceStore';
import { applicableQuestions } from './formAnswers';
import { doh367Readiness, type FormReadiness } from './formReadiness';
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
 * Only DOH-367 so far, deliberately: a form is worth describing block by block only once we can
 * take it all the way to ready, and half-describing the others would be the same "mostly filled"
 * problem one level up.
 */
export function useReadinessFor(): (form: PacketForm) => FormReadiness | null {
  const camp = usePacketCamp();
  const season = useChecklistStore((s) => s.season);
  const {
    planSections, answers, planRowKeys, formQuestions, formAnswers, sessionCapacity,
    activeFormCodes,
  } = useComplianceStore();
  const inScope = activeFormCodes();

  return (form: PacketForm) => {
    if (form.code !== 'DOH-367') return null;
    const ours = form.map.fields.length;
    const pct = coverage(
      form, camp, planSections, answers, planRowKeys(), formQuestions, formAnswers, sessionCapacity,
    );
    return doh367Readiness({
      camp, seasonName: season?.name ?? null,
      // Only the questions actually being asked. Counting a question that setup ruled out, or one
      // that prints on a form we are not showing, would make a block look unfinished with nothing
      // on the records page to finish it.
      questions: applicableQuestions(formQuestions, answers, formAnswers, inScope),
      answers: formAnswers,
      sessions: sessionCapacity, planSections,
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
