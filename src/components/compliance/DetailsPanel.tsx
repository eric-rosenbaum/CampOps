import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import { applicableQuestions } from '@/lib/compliance/formAnswers';
import type { ComplianceFormQuestion } from '@/lib/types';

/**
 * The things the forms ask that nothing else in the platform knows.
 *
 * This is what closes the gap between a packet that is mostly filled and a packet a camp can
 * actually file. Everything derivable is already derived; what is left are genuine questions,
 * and the honest thing is to ask them once, plainly, and remember the answers.
 *
 * Grouped into sittings rather than presented as one list of eighty, because the answers come
 * from different places: your directors' details are in a personnel file, the counselor
 * headcount is in someone's head, the certified statement needs the director themselves. A
 * director can finish one group in a few minutes and come back.
 */

export function DetailsPanel({ onOpenSetup, focus, onOpenForm }: {
  onOpenSetup?: () => void;
  /** Sent by a "go and do this" link: open this group and point at these questions. */
  focus?: { group?: string; highlight?: string[]; from?: string; formCode?: string } | null;
  /** Takes the camp back to the form that sent them here. */
  onOpenForm?: (formCode: string) => void;
}) {
  const st = useComplianceStore();
  const { currentUser, can } = useAuth();
  const questions = useComplianceStore((s) => s.formQuestions);
  const answers = useComplianceStore((s) => s.formAnswers);
  const setupAnswers = useComplianceStore((s) => s.answers);

  const activeForms = st.activeFormCodes();
  const asked = useMemo(
    () => applicableQuestions(questions, setupAnswers, answers, activeForms),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, setupAnswers, answers, [...activeForms].sort().join(',')],
  );

  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; questions: ComplianceFormQuestion[] }>();
    for (const q of asked) {
      const g = byKey.get(q.groupKey)
        ?? { key: q.groupKey, label: q.groupLabel, questions: [] };
      g.questions.push(q);
      byKey.set(q.groupKey, g);
    }
    return [...byKey.values()].map((g) => ({
      ...g,
      questions: g.questions.sort((a, b) => a.sortOrder - b.sortOrder),
      answered: g.questions.filter((q) => (answers[q.questionKey] ?? '') !== '').length,
      // Only worth saying inside a group that also holds required questions. A group where
      // nothing is required is not a group of optional extras, it is a set of plain questions.
      hasRequired: g.questions.some((q) => q.required),
    }));
  }, [asked, answers]);

  const [open, setOpen] = useState<string | null>(null);
  // The focused group wins over whatever was open, so arriving from a link always lands on the
  // thing the link was about rather than wherever the camp happened to be.
  const openGroup = focus?.group ?? open;
  const highlight = new Set(focus?.highlight ?? []);
  // How much of what the form was waiting on is still blank, and where to go when it is not.
  const stillOpen = [...highlight].filter((k) => (answers[k] ?? '') === '').length;
  const backTo = onOpenForm ? focus?.formCode ?? null : null;

  useEffect(() => {
    if (!focus?.group) return;
    const el = document.getElementById(`details-group-${focus.group}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [focus?.group]);

  const total = asked.length;
  const done = asked.filter((q) => (answers[q.questionKey] ?? '') !== '').length;

  if (total === 0) return null;

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[14px] font-semibold text-forest">Details your forms ask for</p>
            <p className="text-[12px] text-ink-soft mt-1 leading-relaxed max-w-[74ch]">
              Everything the forms want that we can work out from your records is already filled.
              These are the rest: real questions, asked once. Answer them and they print on every
              form that wants them, this season and the next.
            </p>
          </div>
          <span className="font-mono text-[13px] text-ink-soft whitespace-nowrap">
            {done}/{total} answered
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden mt-3">
          <div className="h-full bg-sage rounded-full transition-all"
               style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }} />
        </div>
      </div>

      {/* Arriving from a form. Say what sent you here and how many answers it is waiting on, so
          the amber rings below read as an instruction rather than as decoration. */}
      {focus?.from && highlight.size > 0 && (
        <div className="px-5 py-3 bg-amber-bg/50 border-b border-amber-border/50 flex items-center gap-3">
          <p className="text-[12px] text-ink leading-relaxed flex-1 min-w-0">
            From <span className="font-medium">{focus.from}</span>.{' '}
            {stillOpen === 0
              ? 'All answered.'
              : `It is waiting on ${stillOpen === highlight.size ? '' : `${stillOpen} more of `}${
                  highlight.size === 1 ? 'the answer' : `the ${highlight.size} answers`
                } outlined below.`}
          </p>
          {backTo && (
            <button
              onClick={() => onOpenForm?.(backTo)}
              className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-medium text-forest hover:text-forest-dark"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to {backTo}
            </button>
          )}
        </div>
      )}

      <div>
        {groups.map((g) => (
          <div key={g.key} id={`details-group-${g.key}`} className="border-b border-cream-dark last:border-0 scroll-mt-4">
            <button
              onClick={() => setOpen(openGroup === g.key ? null : g.key)}
              aria-expanded={openGroup === g.key}
              className="w-full px-5 py-3 flex items-center gap-3 hover:bg-cream transition-colors text-left"
            >
              <ChevronRight className={`w-3.5 h-3.5 text-ink-faint flex-shrink-0 transition-transform ${openGroup === g.key ? 'rotate-90' : ''}`} />
              <span className="text-[13.5px] font-medium text-ink flex-1 min-w-0">{g.label}</span>
              {g.answered === g.questions.length ? (
                <span className="text-[11.5px] text-green-muted-text inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Done
                </span>
              ) : (
                <span className="font-mono text-[11.5px] text-ink-faint">
                  {g.answered}/{g.questions.length}
                </span>
              )}
            </button>

            {openGroup === g.key && (
              <div className="px-5 pb-4 pt-1 space-y-4 bg-cream/30">
                {g.questions.map((q) => (
                  <div key={q.questionKey}
                       className={highlight.has(q.questionKey)
                         ? 'rounded-card ring-2 ring-amber/60 bg-amber-bg/40 -mx-2 px-2 py-2'
                         : undefined}>
                  <QuestionField
                    question={q}
                    showOptional={g.hasRequired && !q.required}
                    value={answers[q.questionKey] ?? ''}
                    disabled={!can('manageSafetyItems')}
                    onSave={(v) => st.saveFormAnswer(q.questionKey, v, currentUser.name || null)}
                    setupAnswers={setupAnswers}
                    onOpenSetup={onOpenSetup}
                    activeForms={activeForms}
                  />
                  </div>
                ))}

                {/* The way back, at the end of the last answer rather than at the top of the
                    page. Answers commit when the box loses focus, and pressing this takes the
                    focus off the box, so there is nothing to save first. */}
                {backTo && focus?.group === g.key && (
                  <div className="pt-3 border-t border-cream-dark flex items-center gap-3">
                    <p className="text-[11.5px] text-ink-faint flex-1 min-w-0">
                      {stillOpen === 0
                        ? `Everything ${backTo} was waiting on is answered.`
                        : `${stillOpen} still blank. Each answer saves when you leave the box.`}
                    </p>
                    <Button size="sm" variant={stillOpen === 0 ? 'primary' : 'ghost'}
                            onClick={() => onOpenForm?.(backTo)}>
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to {backTo}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const INPUT =
  'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-1.5 text-ink focus:outline-none focus:border-sage';

function QuestionField({ question: q, value, disabled, onSave, setupAnswers, onOpenSetup, activeForms, showOptional }: {
  question: ComplianceFormQuestion;
  showOptional?: boolean;
  value: string;
  disabled: boolean;
  onSave: (value: string) => void;
  setupAnswers: Record<string, string>;
  onOpenSetup?: () => void;
  activeForms: Set<string>;
}) {
  // Only the forms currently in scope. Naming a parked document invites the camp to go looking
  // for one they cannot see.
  const printsOn = [...new Set(
    (q.renders ?? [])
      .map((r) => (r as { form?: string }).form)
      .filter((f): f is string => Boolean(f) && activeForms.has(f as string)),
  )];

  const setupSaysYes = (key: string) =>
    (setupAnswers[key] ?? '').toLowerCase().replace(/^"|"$/g, '') === 'true';
  // Local while typing, committed on blur. Writing on every keystroke would put a round trip
  // between the camp and their own text.
  const [draft, setDraft] = useState(value);
  const commit = () => { if (draft !== value) onSave(draft); };

  return (
    <div>
      <label className="block text-[12.5px] font-medium text-ink">
        {q.label}
        {q.required && <span className="text-ink-faint font-normal"> · required</span>}
        {showOptional && <span className="text-ink-faint font-normal"> · optional</span>}
      </label>
      {/* Which form this answer lands on. Whatever route a camp took to get here, they should
          not have to work out why the question is being asked. */}
      {printsOn.length > 0 && (
        <p className="text-[11px] text-ink-faint mt-0.5">Prints on {printsOn.join(', ')}</p>
      )}
      {q.helpText && (
        <p className="text-[11.5px] text-ink-soft mt-0.5 leading-relaxed max-w-[70ch]">{q.helpText}</p>
      )}

      <div className="mt-1.5 max-w-lg">
        {q.answerKind === 'multi' ? (
          /* The whole grid the form prints, in its order, including the boxes decided
             elsewhere. Showing only the ones this question owns meant the screen and the
             printed form disagreed, which is how a camp stops trusting the rest of the page. */
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 max-w-2xl">
            {(q.choices ?? []).map((c) => {
              const picked = draft.split(',').filter(Boolean);
              const fromSetup = c.from ? setupSaysYes(c.from) : false;
              const locked = Boolean(c.from);
              const on = locked ? fromSetup : picked.includes(c.value);
              return (
                <label key={c.value}
                  title={locked ? `Set by your setup answer: ${c.fromLabel ?? c.from}` : undefined}
                  className={`flex items-start gap-2 text-[12.5px] ${
                    locked ? 'opacity-80' : 'cursor-pointer'} ${disabled ? 'opacity-60' : ''}`}>
                  <input
                    type="checkbox" checked={on} disabled={disabled || locked}
                    onChange={() => {
                      const next = on ? picked.filter((v) => v !== c.value) : [...picked, c.value];
                      // Kept in the catalog's own order so the stored value does not depend on
                      // the order somebody happened to click.
                      const ordered = (q.choices ?? [])
                        .filter((x) => !x.from)
                        .map((x) => x.value).filter((v) => next.includes(v)).join(',');
                      setDraft(ordered);
                      onSave(ordered);
                    }}
                    className="w-3.5 h-3.5 accent-forest flex-shrink-0 mt-0.5"
                  />
                  <span className="text-ink-soft">
                    {c.label}
                    {locked && (
                      /* Naming the question and linking to it, because "from setup" on its own
                         tells a camp the box is not theirs to click without telling them where
                         it is theirs to change. */
                      <button
                        onClick={(e) => { e.preventDefault(); onOpenSetup?.(); }}
                        className="block text-[10.5px] text-sage hover:text-forest text-left"
                      >
                        {c.fromLabel ?? 'Set in setup'} · change in setup
                      </button>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        ) : q.answerKind === 'longtext' ? (
          <textarea rows={3} value={draft} disabled={disabled}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            className={`${INPUT} resize-y leading-relaxed`} />
        ) : q.answerKind === 'choice' ? (
          <div className="flex flex-wrap gap-2">
            {(q.choices ?? []).map((c) => (
              <button key={c.value} disabled={disabled}
                onClick={() => {
                  // Clicking the selected answer clears it. Without this a question answered by
                  // mistake can be changed but never unanswered, and on these forms an unticked
                  // box is a real answer.
                  const next = draft === c.value ? '' : c.value;
                  setDraft(next); onSave(next);
                }}
                className={`text-[12.5px] font-semibold rounded-btn px-3 py-1.5 border transition-colors ${
                  draft === c.value ? 'bg-forest border-forest text-white'
                                    : 'bg-white border-border text-ink-soft hover:border-sage'}`}>
                {c.label}
              </button>
            ))}
          </div>
        ) : q.answerKind === 'bool' ? (
          <div className="flex gap-2">
            {[['true', 'Yes'], ['false', 'No']].map(([v, label]) => (
              <button key={v} disabled={disabled}
                onClick={() => {
                  const next = draft === v ? '' : v;
                  setDraft(next); onSave(next);
                }}
                className={`text-[12.5px] font-semibold rounded-btn px-3.5 py-1.5 border transition-colors ${
                  draft === v ? 'bg-forest border-forest text-white'
                              : 'bg-white border-border text-ink-soft hover:border-sage'}`}>
                {label}
              </button>
            ))}
          </div>
        ) : (
          <input
            type={q.answerKind === 'date' ? 'date' : q.answerKind === 'integer' ? 'number' : 'text'}
            value={draft} disabled={disabled}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            className={INPUT} />
        )}
      </div>

      {(q.answerKind === 'bool' || q.answerKind === 'choice') && draft !== '' && !disabled && (
        <p className="text-[11px] text-ink-faint mt-1">Click your answer again to clear it.</p>
      )}

      {/* `derivesFrom` is an engineering note about where the answer should eventually live
          ("Move to safety_staff.education once that column exists"). It was being printed to
          camps as provenance, which it is not. It stays in the database for us. */}
    </div>
  );
}
