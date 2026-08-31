import { useState } from 'react';
import {
  ArrowLeft, Check, ChevronRight, Circle, Download, Eye, ExternalLink, Loader2, PenLine,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import { applicableQuestions } from '@/lib/compliance/formAnswers';
import type { FormPart, FormReadiness } from '@/lib/compliance/formReadiness';
import type { PacketForm } from '@/lib/compliance/nyPacket';
import { QuestionField } from './QuestionField';
import { SessionsPanel } from './SessionsPanel';
import { FormNamesCard } from './FormNamesCard';

/**
 * One form, and everything a director needs to trust it enough to sign it.
 *
 * Three questions, in the order they get asked: can I file this, where did each value come
 * from, and can I see it. The provenance column is the part that matters most. Nobody is going
 * to check two hundred and eighty cells against their own records, so they will either sign
 * blind or not sign at all, and both are bad outcomes. Checking a handful of named sources is a
 * thing a person will actually do.
 *
 * Ready or not ready, never a percentage. A percentage on a government form invites "close
 * enough", and the honest answer is binary: either every part is filled or a named list is not.
 *
 * The blocks are also where the questions get answered. They used to link out to a separate
 * page of question groups, which meant the thing being filled in and the place you filled it in
 * were never on screen together: the camp had to hold "2 things still to do" in their head while
 * reading a page of boxes that did not say which two. A block that is not done opens where it
 * sits, holds its own questions in printed order, and closes when they are answered.
 */

export function FormDetail({ form, readiness, busy, onBack, onPreview, onDownload, onOpenPlan }: {
  form: PacketForm;
  readiness: FormReadiness;
  busy: boolean;
  onBack: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onOpenPlan: () => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const done = readiness.parts.filter((p) => p.status === 'done').length;

  // Open on the first block that still needs something. A camp arriving from "not ready" should
  // land on the reason, not on a list of closed rows they have to open one at a time.
  const firstOpen = readiness.parts.find((p) => p.status === 'todo')?.label ?? null;
  const [openPart, setOpenPart] = useState<string | null>(firstOpen);

  return (
    <div>
      <button onClick={onBack}
        className="text-[12.5px] text-sage hover:text-forest inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> All forms
      </button>

      <div className="bg-white rounded-card border border-border px-5 py-4 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-forest">
              {form.code} <span className="font-normal text-ink-soft">· {form.title}</span>
            </p>
            <p className="text-[11.5px] text-ink-faint mt-1 font-mono">
              version {form.map.form_version} · published by the New York State Department of Health
            </p>
          </div>

          <div className={`px-3 py-1.5 rounded-btn text-[12.5px] font-semibold flex-shrink-0 ${
            readiness.ready ? 'bg-green-muted-bg text-green-muted-text' : 'bg-amber-bg text-amber-text'}`}>
            {readiness.ready
              ? 'Ready to file'
              : `${readiness.outstanding} thing${readiness.outstanding === 1 ? '' : 's'} still to do`}
          </div>
        </div>

        <p className="text-[12.5px] text-ink-soft mt-3 leading-relaxed max-w-[76ch]">
          This is the state's own form, unmodified. We draw your data onto it at the printed
          positions, so what your county receives is the form they expect. Check it before you
          file it: you are the one signing it.
        </p>

        <div className="flex items-center gap-2 mt-3.5 flex-wrap">
          <Button size="sm" disabled={busy}
                  onClick={() => { setPreviewing(true); onPreview(); setTimeout(() => setPreviewing(false), 1500); }}>
            {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            Preview it filled
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDownload}>
            <Download className="w-3.5 h-3.5" />
            {/* Do not call it filled when it is not. The camp finds out either way, and finding
                out from the button is better than finding out from the PDF. */}
            {readiness.ready ? 'Download filled' : 'Download partly filled'}
          </Button>
          <a href={`/forms/ny/${form.file}.pdf`} download>
            <Button size="sm" variant="ghost"><Download className="w-3.5 h-3.5" /> Blank</Button>
          </a>
        </div>
      </div>

      <div className="bg-white rounded-card border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-cream-dark">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">
            What we fill, and from where
          </p>
          <p className="text-[11.5px] text-ink-faint mt-1">
            {done} of {readiness.parts.length} parts of this form are complete.
          </p>
        </div>

        <div className="divide-y divide-cream-dark">
          {readiness.parts.map((p) => (
            <PartRow
              key={p.label}
              part={p}
              isOpen={openPart === p.label}
              onToggle={() => setOpenPart(openPart === p.label ? null : p.label)}
              onOpenPlan={onOpenPlan}
            />
          ))}
        </div>

        {/*
          Was "of the 280 cells that are yours, we fill 56", which read as a shortfall on a form
          that is ready to file. Most of those cells are the activity grid and the capacity
          table, where an empty box is the answer: nothing offered, nobody in that band. Counting
          them as unfilled measured the form, not the camp.
        */}
        <div className="px-5 py-3 bg-cream/40 border-t border-cream-dark">
          <p className="text-[11.5px] text-ink-soft leading-relaxed">
            This form has {readiness.ours + readiness.notOurs} boxes, most of them the activity
            grid and the camper capacity table. A box left blank there is an answer — nothing
            offered, nobody in that age band — so the list above is the accounting that matters.
          </p>
        </div>
      </div>
    </div>
  );
}

const ICON: Record<FormPart['status'], typeof Check> = {
  done: Check, todo: Circle, by_hand: PenLine,
};

const TONE: Record<FormPart['status'], string> = {
  done: 'text-sage', todo: 'text-amber-text', by_hand: 'text-ink-faint',
};

function PartRow({ part, isOpen, onToggle, onOpenPlan }: {
  part: FormPart;
  isOpen: boolean;
  onToggle: () => void;
  onOpenPlan: () => void;
}) {
  const st = useComplianceStore();
  const { currentUser, can } = useAuth();
  const questions = useComplianceStore((s) => s.formQuestions);
  const answers = useComplianceStore((s) => s.formAnswers);
  const setupAnswers = useComplianceStore((s) => s.answers);
  const activeForms = st.activeFormCodes();

  const Icon = ICON[part.status];
  const keys = part.questionKeys ?? [];

  // Only the questions this camp is actually being asked. A block whose questions are all ruled
  // out by setup has nothing to open, and should not pretend otherwise.
  const asked = keys.length === 0 ? [] : applicableQuestions(
    questions.filter((q) => keys.includes(q.questionKey)), setupAnswers, answers, activeForms,
  ).sort((a, b) => keys.indexOf(a.questionKey) - keys.indexOf(b.questionKey));

  const hasRequired = asked.some((q) => q.required);
  const expandable = asked.length > 0 || Boolean(part.panel);
  const href = part.goTo && 'href' in part.goTo ? part.goTo.href : null;

  const head = (
    <>
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${TONE[part.status]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-ink">{part.label}</p>
        <p className="text-[12px] text-ink-soft mt-0.5">{part.source}</p>
        {part.detail && (
          <p className="text-[12px] text-ink-faint mt-1 leading-relaxed max-w-[70ch]">{part.detail}</p>
        )}
      </div>
    </>
  );

  return (
    <div>
      {expandable ? (
        <button onClick={onToggle} aria-expanded={isOpen}
                className="w-full text-left px-5 py-3 flex items-start gap-3 hover:bg-cream transition-colors">
          {head}
          <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 text-ink-faint transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </button>
      ) : (
        <div className="px-5 py-3 flex items-start gap-3">
          {head}
          {part.status !== 'done' && href && (
            <a href={href} className="flex-shrink-0">
              <Button size="sm" variant="ghost">
                {part.goTo!.label} <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          )}
        </div>
      )}

      {expandable && isOpen && (
        <div className="px-5 pb-4 pt-1 bg-cream/30 space-y-4">
          {part.panel === 'roles' && <FormNamesCard />}
          {part.panel === 'sessions' && <SessionsPanel />}

          {asked.map((q) => (
            <QuestionField
              key={q.questionKey}
              question={q}
              showOptional={hasRequired && !q.required}
              value={answers[q.questionKey] ?? ''}
              disabled={!can('manageSafetyItems')}
              onSave={(v) => st.saveFormAnswer(q.questionKey, v, currentUser.name || null)}
              setupAnswers={setupAnswers}
              activeForms={activeForms}
            />
          ))}

          {part.goTo && 'tab' in part.goTo && (
            <Button size="sm" variant="ghost" onClick={onOpenPlan}>
              {part.goTo.label} <ExternalLink className="w-3 h-3" />
            </Button>
          )}
          {href && (
            <a href={href} className="inline-block">
              <Button size="sm" variant="ghost">
                {part.goTo!.label} <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
