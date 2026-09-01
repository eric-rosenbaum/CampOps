import { useState } from 'react';
import type { ComplianceFormQuestion } from '@/lib/types';

/**
 * One question from the catalog, rendered as whatever kind of answer it takes.
 *
 * Shared by the form's own page, where the questions are asked block by block in printed order,
 * and by anywhere else that needs to show the same answer. One renderer, so a question cannot
 * look like a different question depending on the route the camp took to reach it.
 */

const INPUT =
  'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-1.5 text-ink focus:outline-none focus:border-sage';

export function QuestionField({ question: q, value, disabled, onSave, setupAnswers, onOpenSetup, activeForms, showOptional }: {
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
        <p className="text-[11.5px] text-ink-soft mt-0.5 leading-relaxed">{q.helpText}</p>
      )}

      <div className="mt-1.5">
        {q.answerKind === 'multi' ? (
          /* The whole grid the form prints, in its order, including the boxes decided
             elsewhere. Showing only the ones this question owns meant the screen and the
             printed form disagreed, which is how a camp stops trusting the rest of the page. */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1.5">
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
            /* A date or a count is a short answer, and stretching its box the width of the card
               makes it read as a long one. Text keeps the full width. */
            className={`${INPUT} ${q.answerKind === 'date' || q.answerKind === 'integer' ? 'sm:max-w-[220px]' : ''}`} />
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
