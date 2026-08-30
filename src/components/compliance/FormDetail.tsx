import { useState } from 'react';
import {
  ArrowLeft, Check, Circle, Download, Eye, ExternalLink, Loader2, PenLine, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import type { FormPart, FormReadiness } from '@/lib/compliance/formReadiness';
import type { PacketForm } from '@/lib/compliance/nyPacket';

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
 */

export function FormDetail({ form, readiness, busy, onBack, onPreview, onDownload, onGoTo }: {
  form: PacketForm;
  readiness: FormReadiness;
  busy: boolean;
  onBack: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onGoTo: (part: FormPart) => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const done = readiness.parts.filter((p) => p.status === 'done').length;

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
            <Download className="w-3.5 h-3.5" /> Download filled
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
            <PartRow key={p.label} part={p} onGoTo={() => onGoTo(p)} />
          ))}
        </div>

        {/* The honest denominator, at the bottom where it belongs rather than as a headline. */}
        <div className="px-5 py-3 bg-cream/40 border-t border-cream-dark">
          <p className="text-[11.5px] text-ink-soft leading-relaxed">
            This form has {readiness.ours + readiness.notOurs} cells. {readiness.notOurs} of them
            belong to the health department or have no box to fill. Of the {readiness.ours} that
            are yours, we fill {readiness.filled}.
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

function PartRow({ part, onGoTo }: { part: FormPart; onGoTo: () => void }) {
  const Icon = ICON[part.status];
  const isLink = part.goTo && 'href' in part.goTo;

  return (
    <div className="px-5 py-3 flex items-start gap-3">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${TONE[part.status]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-ink">{part.label}</p>
        <p className="text-[12px] text-ink-soft mt-0.5">{part.source}</p>
        {part.detail && (
          <p className="text-[12px] text-ink-faint mt-1 leading-relaxed max-w-[70ch]">{part.detail}</p>
        )}
      </div>

      {part.status !== 'done' && part.goTo && (
        isLink ? (
          <a href={(part.goTo as { href: string }).href} className="flex-shrink-0">
            <Button size="sm" variant="ghost">
              {part.goTo.label} <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
        ) : (
          <Button size="sm" variant="ghost" onClick={onGoTo} className="flex-shrink-0">
            {part.goTo.label} <ArrowRight className="w-3 h-3" />
          </Button>
        )
      )}
    </div>
  );
}
