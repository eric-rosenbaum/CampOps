import { useState } from 'react';
import { ChevronDown, ExternalLink, Paperclip, Ban, FileText, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import type { ComplianceRequirement, RequirementStatus, ComplianceStatus } from '@/lib/types';
import { generatedFormFor } from '@/lib/compliance/generatedForms';
import { useFormIsReady } from '@/lib/compliance/usePacketCamp';

/** The documents this product prepares, rather than merely asks a camp to hold. */


/** The word a camp reads, and the colour it reads it in. */
const TONE: Record<ComplianceStatus, { label: string; cls: string; dot: string }> = {
  satisfied:      { label: 'Met',            cls: 'bg-green-muted-bg text-green-muted-text', dot: 'bg-sage' },
  expiring:       { label: 'Expiring',       cls: 'bg-amber-bg text-amber-text',             dot: 'bg-amber' },
  partial:        { label: 'Partly done',    cls: 'bg-amber-bg text-amber-text',             dot: 'bg-amber' },
  missing:        { label: 'Not met',        cls: 'bg-red-bg text-red-text',                 dot: 'bg-red' },
  not_applicable: { label: 'Not applicable', cls: 'bg-cream-dark text-ink-soft',             dot: 'bg-border' },
  needs_answer:   { label: 'Needs an answer', cls: 'bg-amber-bg text-amber-text',             dot: 'bg-amber' },
};

/**
 * The setup answer keys, in the words the interview uses. A camp should never be shown the
 * database key it still owes us an answer to.
 */
const QUESTION: Record<string, string> = {
  state: 'which state you are in',
  county: 'which county issues your permit',
  camp_type: 'whether you are an overnight or day camp',
  water_source: 'where your drinking water comes from',
  sewage: 'how sewage is handled',
  is_nonprofit: 'whether the camp is a nonprofit',
  has_pool: 'whether you have a pool',
  has_waterfront: 'whether you have a waterfront',
  offers_offsite_swim: 'whether campers swim off-site',
  has_kitchen: 'whether you run a kitchen',
  has_boating: 'whether you run boating',
  has_archery: 'whether you run archery',
  has_riflery: 'whether you run riflery',
  has_equestrian: 'whether you run horseback riding',
  has_challenge_course: 'whether you have a challenge course',
  offers_trips: 'whether you take campers on trips',
  operates_vehicles: 'whether you transport campers',
  enrolls_campers_with_disabilities: 'whether you enroll campers with disabilities',
};

const questionLabel = (key: string): string => QUESTION[key] ?? '';

/**
 * Turn the engine's detail object into a sentence. Never show a raw status with no reason.
 *
 * Forms the product generates do not come through here: they are not satisfied by a document
 * on record, so the row states the form's own readiness instead.
 */
function explain(s: RequirementStatus): string {
  const d = s.detail as Record<string, unknown>;
  if (s.status === 'not_applicable') return (s.naReason || (d.reason as string)) ?? 'Does not apply to your camp';
  if (s.status === 'needs_answer') {
    const keys = Array.isArray(d.unanswered) ? (d.unanswered as string[]) : [];
    const asked = keys.map(questionLabel).filter(Boolean);
    if (asked.length > 0) {
      return `We cannot tell yet whether this applies to you. Answer ${asked.join(' and ')} in setup.`;
    }
    return 'We cannot tell yet whether this applies to you. Finish the setup questions.';
  }
  if (typeof d.need === 'string') {
    if (typeof d.awaiting_feature === 'string') {
      return `${d.need}. (Automatic tracking for this is not built yet.)`;
    }
    return d.need;
  }
  if (d.complete !== undefined && d.sections !== undefined) return `${d.complete} of ${d.sections} sections written`;
  if (d.held !== undefined) return `${d.held} current certification${d.held === 1 ? '' : 's'} on file`;
  if (d.overdue !== undefined && Number(d.overdue) > 0) return `${d.overdue} of ${d.items} items overdue`;
  if (d.expires_on) {
    return `On file, expires ${d.expires_on}`;
  }
  if (d.next_due) return `On file, next due ${d.next_due}`;
  if (d.documents !== undefined) {
    return `${d.documents} document${d.documents === 1 ? '' : 's'} attached`;
  }
  if (d.completed !== undefined) return `${d.completed} completed`;
  if (d.entries !== undefined) return `${d.entries} entries logged`;
  if (d.readings !== undefined) return `${d.readings} readings logged`;
  if (d.assets !== undefined) return `${d.assets} on file`;
  return 'On file';
}

export function RequirementList({
  requirements,
  renderAction,
  emptyLabel,
  onOpenForm,
}: {
  requirements: ComplianceRequirement[];
  /**
   * An extra control for this requirement, shown alongside the built-in ones. Used by the
   * records page to put "log a drill" next to the requirement a drill would satisfy, so the
   * camp does the work where it reads about it rather than hunting for the right module.
   */
  renderAction?: (r: ComplianceRequirement) => React.ReactNode;
  emptyLabel?: string;
  /** Opens the form this requirement is, when the product generates it. */
  onOpenForm?: (formCode: string) => void;
}) {
  const { statusFor } = useComplianceStore();
  const formIsReady = useFormIsReady();
  const [open, setOpen] = useState<string | null>(null);

  if (requirements.length === 0) {
    return (
      <p className="text-[13px] text-ink-faint italic py-6">
        {emptyLabel ?? 'Nothing in this package applies to your camp.'}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {requirements.map((r) => {
        const st = statusFor(r.id);
        const genForm = generatedFormFor(r.formCodes);
        /*
          A form we generate is not something we can mark met.

          Filing happens in an envelope: the camp prints it, signs it in ink and posts it, and
          nothing about that reaches us. Showing MET or NOT MET here claimed knowledge we do
          not have -- and, while a file could be attached, let an unrelated certificate supply
          it. What we do know is whether the form has everything it needs to be printed, so
          that is what the badge says.
        */
        const ruledOut = st?.status === 'not_applicable';
        const ready = genForm && !ruledOut ? formIsReady(genForm) : null;
        const tone = genForm && !ruledOut
          ? (ready
              ? { label: 'Ready to file', cls: 'bg-green-muted text-green-muted-text', dot: 'bg-sage' }
              : { label: 'Not ready', cls: 'bg-amber-bg text-amber-text', dot: 'bg-amber' })
          : TONE[st?.status ?? 'missing'];
        const isOpen = open === r.id;
        return (
          <div key={r.id} className="bg-white rounded-card border border-border overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : r.id)}
              aria-expanded={isOpen}
              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-cream transition-colors"
            >
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${tone.dot}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-ink">{r.label}</span>
                <span className="block text-[12px] text-ink-soft mt-0.5">
                  {genForm && !ruledOut
                    ? (ready
                        ? `Everything ${genForm} needs is answered. Print it from Hand-off, sign it and send it to your county.`
                        : `${genForm} is not ready yet. Finish it under Hand-off.`)
                    : st ? explain(st) : 'Not yet evaluated'}
                </span>
              </span>
              <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-tag ${tone.cls}`}>
                {tone.label}
              </span>
              <ChevronDown className={`w-4 h-4 flex-shrink-0 text-ink-faint mt-0.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
            </button>
            {isOpen && (
              <RequirementDetail requirement={r} status={st} extraAction={renderAction?.(r)}
                                 onOpenForm={onOpenForm} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RequirementDetail({ requirement: r, status: st, extraAction, onOpenForm }: {
  requirement: ComplianceRequirement; status: RequirementStatus | undefined;
  extraAction?: React.ReactNode;
  onOpenForm?: (formCode: string) => void;
}) {
  const { documentsFor, documents, linkDocument, unlinkDocument, openDocument, markNotApplicable } = useComplianceStore();
  const { currentUser, can } = useAuth();
  const canManage = can('manageSafetyItems');
  const linked = documentsFor(r.id);
  // The forms the product generates. A requirement tagged with one of these is a document we
  // produce, not a file the camp happens to hold, and it needs a different story.
  const generatedForm = generatedFormFor(r.formCodes);
  const [naOpen, setNaOpen] = useState(false);
  const [naReason, setNaReason] = useState('');

  return (
    <div className="border-t border-cream-dark bg-cream/40 px-4 py-3.5">
      {r.summary && <p className="text-[13px] text-ink leading-relaxed">{r.summary}</p>}

      {r.evidenceHint && !generatedForm && (
        <p className="text-[12.5px] text-ink-soft mt-2 leading-relaxed">
          <span className="font-semibold text-forest">What proves it: </span>{r.evidenceHint}
        </p>
      )}

      {/*
        A requirement that IS a form we produce needs a different story from a requirement
        satisfied by a file the camp holds. There is nothing to upload here: they print it,
        sign it in ink and post it. All this row can usefully do is say so and open the form.
      */}
      {generatedForm && (
        <div className="mt-2.5 rounded-card border border-border bg-cream/50 px-4 py-3">
          <p className="text-[12.5px] text-forest font-semibold">
            This one is a form we prepare for you.
          </p>
          <p className="text-[12px] text-ink-soft mt-1 leading-relaxed max-w-[70ch]">
            Fill it in under Hand-off, print it, sign it and send it to your county. Filing
            happens on paper, so nothing about it is tracked here.
          </p>
          {onOpenForm && (
            <Button size="sm" variant="ghost" className="mt-2"
                    onClick={() => onOpenForm(generatedForm)}>
              <FileText className="w-3.5 h-3.5" /> Open {generatedForm}
            </Button>
          )}
        </div>
      )}

      {/*
        The evidence here is other people's personal records. An inspector checks those where
        the camp already keeps them; nobody needs a second copy in a general document store that
        more staff can reach than the health office intended.
      */}
      {r.holdsPersonalRecords && (
        <p className="text-[12px] text-amber-text mt-2 inline-flex items-start gap-1.5 max-w-[70ch] leading-relaxed">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            These are personal records about campers or staff. Keep them where you keep them
            now and attach only a summary or a signed confirmation that you hold them. Do not
            upload the records themselves.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[11.5px] text-ink-faint">
        {/* Which document this lands on. Nothing in this module should leave a camp guessing
            whether an item is paperwork they file or something an inspector asks about. */}
        <span className="inline-flex items-center gap-1.5 text-ink-soft">
          <FileText className="w-3 h-3" />
          {r.formCodes.length > 0
            ? <>Prints on {r.formCodes.join(', ')}</>
            : <>Not on a form. Checked at inspection.</>}
        </span>
        {r.frequency && <span>Frequency: {r.frequency.replace(/_/g, ' ')}</span>}
        {st?.dueOn && <span>Due {st.dueOn}</span>}
        {/*
          Regulatory wording is only ever linked, never quoted, and only when the row has been
          confirmed against the current rule text. An unverified row says so out loud.
        */}
        {r.citation && r.verifyStatus === 'verified' && r.citationUrl && (
          <a href={r.citationUrl} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1 text-sage hover:text-forest">
            {r.citation} <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {r.verifyStatus === 'needs_verification' && (
          <span className="text-amber-text">Wording not yet confirmed against the current rule</span>
        )}
      </div>

      {linked.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {linked.map((d) => (
            <div key={d.id} className="flex items-center gap-2 bg-white border border-border rounded-btn px-3 py-2">
              <FileText className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />
              <button
                onClick={async () => { const u = await openDocument(d.bucketPath); if (u) window.open(u, '_blank', 'noopener'); }}
                className="text-[12.5px] text-forest hover:underline truncate flex-1 text-left"
              >
                {d.title}
              </button>
              {d.expiresOn && <span className="text-[11px] text-ink-faint flex-shrink-0">expires {d.expiresOn}</span>}
              {canManage && (
                <button onClick={() => unlinkDocument(r.id, d.id)}
                        className="text-[11px] text-ink-faint hover:text-red flex-shrink-0">Remove</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/*
        No upload, no attach, no document picker on a form we generate.

        The camp prints this, signs it in ink and posts it. Asking them to scan it back in was
        busywork for a record nobody reads, and while the slot existed any file dropped into it
        turned the row green -- which is how a workers' compensation certificate came to stand
        in for DOH-367. What we can honestly say is whether the form is ready to print, and that
        is what the row says now.
      */}
      {canManage && !generatedForm && (
        <div className="flex flex-wrap gap-2 mt-3">
          {extraAction}
          {/*
            No "attach an existing document" picker on a form we generate. This is the exact
            path by which a workers' compensation certificate came to satisfy DOH-367: the
            picker offers every file the camp holds, and any one of them turns the row green.
            The only thing that belongs here is the copy they filed, which has to be uploaded.
          */}
          {documents.length > 0 && !generatedForm && (
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) { linkDocument(r.id, e.target.value); e.target.value = ''; } }}
              className="text-[12.5px] bg-white border border-border rounded-btn px-2.5 py-1.5 text-ink-soft"
            >
              <option value="">Attach an existing document…</option>
              {documents.filter((d) => !d.requirementIds.includes(r.id)).map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          )}
          {st?.status !== 'not_applicable' ? (
            <Button size="sm" variant="ghost" onClick={() => setNaOpen((v) => !v)}>
              <Ban className="w-3.5 h-3.5" /> Not applicable
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => markNotApplicable(r.id, null, currentUser.name || null)}>
              This does apply after all
            </Button>
          )}
        </div>
      )}

      {canManage && generatedForm && (
        <div className="flex flex-wrap gap-2 mt-3">
          {st?.status !== 'not_applicable' ? (
            <Button size="sm" variant="ghost" onClick={() => setNaOpen((v) => !v)}>
              <Ban className="w-3.5 h-3.5" /> Not applicable
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => markNotApplicable(r.id, null, currentUser.name || null)}>
              This does apply after all
            </Button>
          )}
        </div>
      )}

      {naOpen && st?.status !== 'not_applicable' && (
        <div className="mt-3 bg-white border border-border rounded-card p-3">
          <p className="text-[12.5px] text-ink-soft mb-2">
            Why does this not apply? The reason is recorded and appears in your exports.
          </p>
          <div className="flex gap-2">
            <input
              autoFocus value={naReason} onChange={(e) => setNaReason(e.target.value)}
              placeholder="e.g. No amusement devices on site"
              className="flex-1 text-[13px] bg-white border border-border rounded-btn px-3 py-1.5"
            />
            <Button size="sm" disabled={!naReason.trim()}
              onClick={() => { markNotApplicable(r.id, naReason.trim(), currentUser.name || null); setNaOpen(false); setNaReason(''); }}>
              Save
            </Button>
          </div>
        </div>
      )}

      {linked.length === 0 && !canManage && (
        <p className="text-[12px] text-ink-faint italic mt-3 inline-flex items-center gap-1.5">
          <Paperclip className="w-3 h-3" /> No evidence attached yet
        </p>
      )}
    </div>
  );
}
