import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import type { ComplianceAnswers } from '@/lib/types';

/**
 * The front door: the questions that decide which requirements a camp actually sees.
 *
 * It exists because the alternative is showing every camp every rule, which is how a compliance
 * product becomes something people close. A camp with no rifle range should never read a word
 * about rifle ranges.
 *
 * Answers are stored and re-runnable. Re-answering re-derives the requirement set and retires
 * sections that no longer apply without deleting anything the camp wrote.
 */

type Q =
  | { key: string; kind: 'choice'; label: string; help?: string; options: { value: string; label: string }[] }
  | { key: string; kind: 'bool'; label: string; help?: string }
  | { key: string; kind: 'multi'; label: string; help?: string; options: { value: string; label: string }[] };

const QUESTIONS: Q[] = [
  { key: 'state', kind: 'choice', label: 'Which state is your camp in?',
    help: 'This decides the whole regulatory regime. Only New York is available today.',
    options: [{ value: 'NY', label: 'New York' }] },
  { key: 'county', kind: 'choice', label: 'Which county issues your permit?',
    help: 'Your local health department adds its own items on top of the state forms.',
    options: [{ value: 'WESTCHESTER', label: 'Westchester' }] },
  { key: 'camp_type', kind: 'choice', label: 'Overnight or day camp?',
    help: 'Overnight camps must provide an infirmary; day camps need only a holding area.',
    options: [{ value: 'overnight', label: 'Overnight' }, { value: 'day', label: 'Day camp' }] },
  { key: 'water_source', kind: 'choice', label: 'Where does your drinking water come from?',
    help: 'An on-site well brings a whole sampling and disinfection schedule that public water does not.',
    options: [{ value: 'public', label: 'Public supply' }, { value: 'well', label: 'On-site well' }] },
  { key: 'sewage', kind: 'choice', label: 'How is sewage handled?',
    options: [{ value: 'public', label: 'Public sewer' }, { value: 'septic', label: 'On-site septic' }] },
  { key: 'is_nonprofit', kind: 'bool', label: 'Is the camp a registered nonprofit?',
    help: 'Changes the county fee path.' },
  { key: 'has_pool', kind: 'bool', label: 'Do you have a swimming pool?' },
  { key: 'has_waterfront', kind: 'bool', label: 'Do you have a lake, river or beach waterfront?' },
  { key: 'offers_offsite_swim', kind: 'bool', label: 'Do campers swim off-site or on wilderness trips?' },
  { key: 'has_kitchen', kind: 'bool', label: 'Do you run a kitchen on site?' },
  { key: 'has_boating', kind: 'bool', label: 'Do you run boating or paddling?' },
  { key: 'has_archery', kind: 'bool', label: 'Do you run archery?' },
  { key: 'has_riflery', kind: 'bool', label: 'Do you run riflery?' },
  { key: 'has_equestrian', kind: 'bool', label: 'Do you run horseback riding?' },
  { key: 'has_challenge_course', kind: 'bool', label: 'Do you have a ropes or challenge course?' },
  { key: 'offers_trips', kind: 'bool', label: 'Do you take campers on out-of-camp trips?' },
  { key: 'operates_vehicles', kind: 'bool', label: 'Do you transport campers in camp vehicles?' },
  { key: 'enrolls_campers_with_disabilities', kind: 'bool',
    label: 'Do you enrol campers with developmental disabilities?',
    help: 'Adds the New York safety-plan addendum and additional supervision ratios.' },
];

export function SetupInterview({ onDone }: { onDone: () => void }) {
  const { answers, runSetup, busy } = useComplianceStore();
  // Counted from the catalog rather than written into the copy, so seeding another county does
  // not leave a stale number on the page.
  const totalRequirements = useComplianceStore((s) => s.requirements.length);
  const { currentUser } = useAuth();
  const [draft, setDraft] = useState<ComplianceAnswers>(() => ({
    state: 'NY', county: 'WESTCHESTER', ...answers,
  }));
  const [error, setError] = useState<string | null>(null);

  const unanswered = QUESTIONS.filter((q) => draft[q.key] === undefined || draft[q.key] === '');

  async function submit() {
    if (unanswered.length > 0) {
      setError(`${unanswered.length} question${unanswered.length === 1 ? '' : 's'} still to answer. Anything you leave blank stays on your list marked "needs an answer", because we will not tell you a rule does not apply when we have not asked.`);
      return;
    }
    setError(null);
    const ok = await runSetup(draft, currentUser.name || null);
    if (ok) onDone();
    else setError('Could not save your setup. Please try again.');
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-[18px] font-semibold text-forest">Set up your compliance profile</h2>
      <p className="text-[13.5px] text-ink-soft mt-1.5 leading-relaxed">
        These questions decide which of the {totalRequirements} New York and Westchester
        requirements actually apply to you. You will only ever see the ones that do. Anything you
        leave unanswered stays on your list until you answer it, because we will not tell you a
        rule does not apply when we have not asked. You can change these answers later.
      </p>

      <div className="mt-6 space-y-1">
        {QUESTIONS.map((q) => (
          <div key={q.key} className="py-3.5 border-b border-cream-dark last:border-0">
            <p className="text-[14px] font-medium text-ink">{q.label}</p>
            {q.help && <p className="text-[12.5px] text-ink-soft mt-0.5 leading-relaxed">{q.help}</p>}
            <div className="flex flex-wrap gap-2 mt-2.5">
              {(q.kind === 'bool'
                ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
                : q.options
              ).map((o) => {
                const on = (draft[q.key] ?? '').toLowerCase() === o.value.toLowerCase();
                return (
                  <button
                    key={o.value}
                    onClick={() => setDraft((d) => ({ ...d, [q.key]: o.value }))}
                    className={`text-[13px] font-semibold rounded-btn px-3.5 py-1.5 border transition-colors ${
                      on ? 'bg-forest border-forest text-white'
                         : 'bg-white border-border text-ink-soft hover:border-sage'}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-card border border-amber/30 bg-amber-bg px-4 py-3">
          <p className="text-[13px] text-amber-text leading-relaxed">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3 mt-6">
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Setting up…' : 'Build my requirement list'}
        </Button>
        <span className="text-[12.5px] text-ink-faint">
          {QUESTIONS.length - unanswered.length} of {QUESTIONS.length} answered
        </span>
      </div>
    </div>
  );
}
