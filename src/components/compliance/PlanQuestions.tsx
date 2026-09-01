import { useState } from 'react';
import { Check, ExternalLink, FileDown } from 'lucide-react';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import { PLAN_SECTIONS, type PlanQuestion } from '@/lib/compliance/planTemplate';
import type { PlanAnswerValue } from '@/lib/types';

/**
 * The safety plan, as the state actually asks it.
 *
 * Ninety-two numbered questions in six sections, mostly checkboxes. The numbers are New York's,
 * not ours, and they are shown because the document cross-references itself and because a
 * sanitarian reading the camp's plan is looking at the same numbering.
 *
 * The skip logic is the template's own: answering "No" to question 13 hides 14 and 15, exactly as
 * the paper form says ("No — skip to question 16"). An unanswered gate also hides its dependants,
 * which is the paper behaviour too.
 *
 * Nothing here is scored. A camp part-way through sees how much is answered and nothing that
 * implies the plan is adequate — that judgement belongs to the reviewer who approves it.
 */
export function PlanQuestions() {
  const asked = useComplianceStore((s) => s.planQuestionsAsked)();
  const answers = useComplianceStore((s) => s.planAnswers);
  const addenda = useComplianceStore((s) => s.planAddenda)();
  const progress = useComplianceStore((s) => s.planAnswerProgress)();
  const savePlanAnswer = useComplianceStore((s) => s.savePlanAnswer);
  const { currentUser, can } = useAuth();
  const editable = can('manageSafetyItems');
  const [section, setSection] = useState(PLAN_SECTIONS[0].category);

  const inSection = asked.filter((q) => q.category === section);
  const countFor = (cat: string) => {
    const qs = asked.filter((q) => q.category === cat);
    return { done: qs.filter((q) => answers[q.key] !== undefined).length, total: qs.length };
  };

  const save = (q: PlanQuestion, value: PlanAnswerValue | null) =>
    void savePlanAnswer(q.key, value, currentUser.name || null);

  return (
    <div>
      <div className="bg-white border border-border rounded-card px-5 py-4 mb-4">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-[15px] font-semibold text-forest">
              Children&rsquo;s Camp Safety Plan
            </h3>
            <p className="text-[12px] text-ink-soft mt-0.5">
              New York&rsquo;s template, question for question.
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-[22px] font-semibold text-forest tabular-nums">
              {progress.answered}<span className="text-ink-faint text-[15px]">/{progress.total}</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.11em] text-ink-soft font-bold">
              answered
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-4">
        {PLAN_SECTIONS.map((s) => {
          const c = countFor(s.category);
          const on = s.category === section;
          return (
            <button key={s.category} onClick={() => setSection(s.category)} aria-pressed={on}
              className={`px-2.5 py-1 rounded-pill text-[11.5px] font-semibold border transition-colors ${
                on ? 'bg-forest text-white border-forest'
                   : 'bg-white text-ink-soft border-border hover:border-sage'}`}>
              {s.title}
              <span className={`ml-1.5 font-mono ${on ? 'text-side' : 'text-ink-faint'}`}>
                {c.done}/{c.total}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {inSection.map((q) => (
          <Question key={q.key} q={q} value={answers[q.key]} editable={editable}
            onChange={(v) => save(q, v)} />
        ))}
      </div>

      {section === PLAN_SECTIONS[4].category && addenda.length > 0 && (
        <div className="bg-white border border-border rounded-card mt-4 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-cream-dark">
            <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-ink-soft">
              Activity plans you also owe
            </span>
          </div>
          <p className="px-4 pt-3 text-[12px] text-ink-soft leading-relaxed max-w-[74ch]">
            The state publishes a separate plan for each of these. They attach to your safety plan.
          </p>
          <div className="px-4 pb-3 pt-2 flex flex-col gap-1.5">
            {addenda.map((a) => (
              <a key={a.code} href={a.sourceUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 text-[12.5px] text-forest hover:underline">
                <FileDown className="w-3.5 h-3.5 flex-shrink-0" />
                {a.title}
                <ExternalLink className="w-3 h-3 text-ink-faint" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Question({ q, value, editable, onChange }: {
  q: PlanQuestion;
  value: PlanAnswerValue | undefined;
  editable: boolean;
  onChange: (v: PlanAnswerValue | null) => void;
}) {
  const checked = value?.checked ?? [];
  const answered = value !== undefined;

  const toggle = (choice: string) => {
    const next = q.kind === 'multi_select'
      ? (checked.includes(choice) ? checked.filter((c) => c !== choice) : [...checked, choice])
      : (checked.includes(choice) ? [] : [choice]);
    onChange({ ...value, checked: next });
  };

  return (
    <section className="bg-white border border-border rounded-card px-4 py-3.5">
      <div className="flex gap-3">
        <span className={`font-mono text-[11px] font-bold flex-shrink-0 w-7 pt-0.5 ${
          answered ? 'text-green-muted-text' : 'text-ink-faint'}`}>
          {answered ? <Check className="w-3.5 h-3.5" /> : q.n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink leading-relaxed max-w-[78ch]">{q.prompt}</p>

          {(q.kind === 'yes_no' || q.kind === 'select' || q.kind === 'multi_select'
            || q.kind === 'attest') && (
            <div className="mt-2.5 flex flex-col gap-1">
              {(q.kind === 'yes_no' ? ['Yes', 'No'] : q.choices).map((choice) => (
                <label key={choice}
                  className="flex items-start gap-2 text-[12.5px] text-ink-soft cursor-pointer">
                  <input
                    type={q.kind === 'multi_select' ? 'checkbox' : 'radio'}
                    name={q.key}
                    checked={checked.includes(choice)}
                    disabled={!editable}
                    onChange={() => toggle(choice)}
                    className="mt-[3px] flex-shrink-0 accent-forest"
                  />
                  <span className="leading-snug">{choice}</span>
                </label>
              ))}
            </div>
          )}

          {q.kind === 'table' && q.columns.length > 0 && (
            <TableAnswer q={q} value={value} editable={editable} onChange={onChange} />
          )}

          {(q.kind === 'long_text' || q.freeText) && (
            <textarea
              defaultValue={value?.text ?? ''}
              disabled={!editable}
              rows={q.kind === 'long_text' ? 3 : 2}
              placeholder={q.kind === 'long_text' ? 'Enter text here' : 'Other, or anything to add'}
              onBlur={(e) => {
                if ((e.target.value ?? '') === (value?.text ?? '')) return;
                onChange({ ...value, text: e.target.value });
              }}
              className="mt-2.5 w-full rounded-input border border-border px-2.5 py-1.5 text-[12.5px]
                         focus:border-sage focus:outline-none disabled:bg-paper-raised"
            />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The ten questions the template asks as a grid.
 *
 * Rows grow as they are filled: there is always one blank row at the bottom and no "add row"
 * button, because a camp listing four water sources should not have to ask permission for the
 * fifth.
 */
function TableAnswer({ q, value, editable, onChange }: {
  q: PlanQuestion;
  value: PlanAnswerValue | undefined;
  editable: boolean;
  onChange: (v: PlanAnswerValue | null) => void;
}) {
  const rows = value?.rows ?? [];
  const shown = [...rows, q.columns.map(() => '')];

  const edit = (r: number, c: number, text: string) => {
    const next = shown.map((row) => [...row]);
    next[r][c] = text;
    onChange({ ...value, rows: next.filter((row) => row.some((cell) => cell.trim())) });
  };

  return (
    <div className="mt-2.5 overflow-x-auto">
      <table className="w-full text-[12px] border border-border rounded-card">
        <thead>
          <tr className="bg-paper-raised">
            {q.columns.map((c, i) => (
              <th key={i}
                className="text-left text-[10px] uppercase tracking-[0.1em] text-ink-soft font-bold px-2 py-1.5 border-b border-border">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, r) => (
            <tr key={r} className="border-b border-cream-dark last:border-b-0">
              {q.columns.map((_, c) => (
                <td key={c} className="px-1 py-1">
                  <input
                    defaultValue={row[c] ?? ''}
                    disabled={!editable}
                    onBlur={(e) => { if (e.target.value !== (row[c] ?? '')) edit(r, c, e.target.value); }}
                    className="w-full min-w-[8rem] rounded-input border border-transparent px-1.5 py-1
                               text-[12px] hover:border-border focus:border-sage focus:outline-none
                               disabled:bg-transparent"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
