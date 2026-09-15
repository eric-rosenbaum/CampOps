// Everything that passes between the camp and the group, on one page, in the order it happens.
//
// Five sections and nothing else: the agreement, their certificate of insurance, anything else
// either side sends, who to talk to, and what was said. It used to be the agreement panel, then a
// second heading called "Other documents" that contained a whole documents tab -- which had its
// own group name, its own date range, its own status badge, its own COI upload box and a
// machine-filled "terms page" bolted to the bottom. Four nested headers deep and no two panels
// the same shape.
//
// The panels below all wear the same chrome (white card, one header row, one action on the
// right), because a page of five things should read as a page of five things.
import { ShieldCheck, FileText, Waves, DollarSign, FileQuestion, AlertTriangle, Paperclip, Plus, Pencil, ExternalLink } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { dbSignRetreatDocument } from '@/lib/retreatsDb';
import type { RetreatDocument, RetreatDocType, RetreatDocStatus } from '@/lib/types';
import { Badge, fmtDate, fmtDateFull, money } from './retreatUi';
import { toDateStr } from '@/lib/utils';
import { ProposalsPanel } from './ProposalsPanel';
import { ContactsPanel } from './ContactsPanel';
import { TouchpointsPanel } from './TouchpointsPanel';

const DOC_TYPE_LABEL: Record<RetreatDocType, string> = {
  agreement: 'Retreat agreement',
  coi: 'Certificate of insurance',
  waiver: 'Activity waiver',
  deposit: 'Deposit',
  schedule: 'Their schedule',
  other: 'Document',
};

const STATUS_LABEL: Record<RetreatDocStatus, string> = {
  missing: 'not received',
  pending: 'pending',
  received: 'received',
  signed: 'signed',
  approved: 'approved',
};

/** Green = have it, amber = in flight, red = nothing yet. */
function statusTone(status: RetreatDocStatus): 'ok' | 'warn' | 'alert' {
  if (status === 'missing') return 'alert';
  if (status === 'pending') return 'warn';
  return 'ok';
}

function DocIcon({ doc }: { doc: RetreatDocument }) {
  const tone = statusTone(doc.status);
  const bg = tone === 'ok' ? 'bg-green-muted-bg text-green-muted-text'
    : tone === 'warn' ? 'bg-amber-bg text-amber-text' : 'bg-red-bg text-red';
  const Icon = doc.status === 'missing' ? AlertTriangle
    : doc.docType === 'coi' ? ShieldCheck
    : doc.docType === 'waiver' ? Waves
    : doc.docType === 'deposit' ? DollarSign
    : doc.docType === 'other' ? FileQuestion
    : FileText;
  return (
    <div className={`w-8 h-8 rounded-btn flex items-center justify-center flex-shrink-0 ${bg}`}>
      <Icon className="w-4 h-4" />
    </div>
  );
}

/** The COI must be in hand 14 days before arrival. */
function coiDueDate(arrival: string): string {
  const d = new Date(`${arrival}T00:00:00`);
  d.setDate(d.getDate() - 14);
  return toDateStr(d);
}

/** The one line under a doc name, shaped by type + its meta blob. */
function metaLine(doc: RetreatDocument): string {
  const m = (doc.meta ?? {}) as Record<string, unknown>;
  if (doc.docType === 'coi') {
    const parts = [
      m.policyNumber ? `Policy #${m.policyNumber}` : null,
      m.coverage ? String(m.coverage) : null,
      m.additionalInsured ? `${m.additionalInsured} named additional insured` : null,
      m.expiry ? `Exp ${fmtDate(String(m.expiry))}` : null,
    ].filter(Boolean);
    return parts.join(' · ') || 'Policy details pending';
  }
  if (doc.docType === 'waiver') {
    const signed = Number(m.signedCount ?? 0);
    const total = Number(m.total ?? 0);
    return total ? `${signed} of ${total} participants signed` : 'Collected via portal';
  }
  if (doc.docType === 'deposit') {
    const amt = m.amount != null ? money(Number(m.amount)) : null;
    return [amt ? `Deposit ${amt}` : null, doc.signedBy].filter(Boolean).join(' · ') || 'Deposit on file';
  }
  return [doc.signedBy ? `Signed by ${doc.signedBy}` : null, doc.signedAt ? fmtDateFull(doc.signedAt.slice(0, 10)) : null]
    .filter(Boolean).join(' · ') || 'On file';
}

async function viewFile(path: string) {
  const url = await dbSignRetreatDocument(path);
  if (url) window.open(url, '_blank');
  else alert('Could not open this document.');
}

/** One filed document. The same row whether it is the COI or a bus schedule. */
function DocRow({ doc, retreatId, canManage }: {
  doc: RetreatDocument; retreatId: string; canManage: boolean;
}) {
  const openModal = useRetreatStore((s) => s.openModal);
  const missing = doc.status === 'missing';
  return (
    <li className={`flex items-center gap-3.5 px-4 py-3 ${missing ? 'bg-red-bg/50' : ''}`}>
      <DocIcon doc={doc} />
      <div className="flex-1 min-w-0">
        {/* What it IS, then what it is called. The filename led, so an agreement uploaded as
            "Screenshot 2026-09-07 at 3.10.17 PM.png" announced itself as a screenshot. */}
        <p className={`text-[13px] font-semibold ${missing ? 'text-red' : 'text-forest'}`}>
          {DOC_TYPE_LABEL[doc.docType]} · {STATUS_LABEL[doc.status]}
        </p>
        {doc.name && doc.name !== DOC_TYPE_LABEL[doc.docType] && (
          <p className="mt-0.5 truncate text-[11.5px] text-ink-soft">{doc.name}</p>
        )}
        <p className={`mt-0.5 text-[11px] ${missing ? 'text-red-text' : 'text-ink-soft'}`}>{metaLine(doc)}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className={`text-[11px] font-mono ${missing ? 'font-semibold text-red' : 'text-ink-faint'}`}>
          {missing ? 'Overdue' : doc.dueDate ? `Due ${fmtDate(doc.dueDate)}` : fmtDate(doc.updatedAt.slice(0, 10))}
        </p>
        <div className="mt-1.5 flex justify-end gap-1.5">
          {doc.filePath && (
            <Button size="sm" variant="ghost" onClick={() => viewFile(doc.filePath!)}>
              <ExternalLink className="w-3.5 h-3.5" /> View
            </Button>
          )}
          {canManage && (
            <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'editDoc', retreatId, docId: doc.id })}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** The dashed target that both empty slots use, so uploading looks the same wherever it is. */
function UploadBox({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full cursor-pointer rounded-btn border-2 border-dashed border-border px-4 py-5
                 text-center transition-colors hover:border-sage hover:bg-sage-pale/40"
    >
      <Paperclip className="mx-auto mb-2 h-5 w-5 text-ink-faint" />
      <p className="text-[13px] font-medium text-forest">{label}</p>
      <p className="mt-1 text-[11px] text-ink-faint">PDF, JPG, or PNG · Max 10MB</p>
    </button>
  );
}

/**
 * The certificate of insurance, on its own.
 *
 * It is the one document that can stop a group arriving, it has a hard date, and it is the one
 * the camp chases. Buried in a list of "documents" beside a bus timetable, its deadline was a
 * line of small text.
 */
function CoiPanel({ retreatId }: { retreatId: string }) {
  const { docsFor, retreatById, openModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = retreatById(retreatId);
  const coi = docsFor(retreatId).find((d) => d.docType === 'coi');
  const missing = !coi || coi.status === 'missing';
  const due = retreat?.arrivalDate ? coiDueDate(retreat.arrivalDate) : null;

  return (
    <div className="rounded-card border border-border bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-[13px] font-semibold text-forest">Certificate of insurance</h3>
          <p className="text-[11.5px] text-ink-soft">
            {missing
              ? due ? `Required before arrival · due ${fmtDateFull(due)}` : 'Required before arrival'
              : '$1M general liability, camp named additional insured.'}
          </p>
        </div>
        {missing
          ? <Badge tone="alert">Not received</Badge>
          : <Badge tone="ok">Received</Badge>}
      </div>

      {coi && coi.status !== 'missing' ? (
        <ul className="divide-y divide-border">
          <DocRow doc={coi} retreatId={retreatId} canManage={canManage} />
        </ul>
      ) : canManage ? (
        <div className="px-4 py-4">
          <p className="mb-3 text-[12px] leading-relaxed text-ink-soft">
            The group can upload theirs in the guest portal — this is for when they email it to
            you instead.
          </p>
          <UploadBox
            label="Click to upload the certificate of insurance"
            onClick={() => openModal({ kind: 'uploadDoc', retreatId, docType: 'coi' })}
          />
          <div className="mt-3 flex justify-end">
            <Button
              size="sm" variant="ghost"
              onClick={() => openModal({ kind: 'sendReminder', retreatId, reminderType: 'coi' })}
            >
              Send a reminder
            </Button>
          </div>
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">Not received yet.</p>
      )}
    </div>
  );
}

/**
 * Everything else either side sends.
 *
 * Not the agreement (its own section), not the COI (its own section), and not their run sheet —
 * that lives on the Active retreat tab beside the day it belongs to, because it is not paperwork
 * anybody is chasing.
 */
function OtherDocumentsPanel({ retreatId }: { retreatId: string }) {
  const { docsFor, openModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const docs = docsFor(retreatId).filter(
    (d) => !['agreement', 'coi', 'schedule'].includes(d.docType),
  );

  return (
    <div className="rounded-card border border-border bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-[13px] font-semibold text-forest">Other documents</h3>
          <p className="text-[11.5px] text-ink-soft">Waivers, permits, anything either of you sends.</p>
        </div>
        {canManage && (
          <Button
            size="sm" variant="ghost"
            onClick={() => openModal({ kind: 'uploadDoc', retreatId, docType: 'other' })}
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        )}
      </div>

      {docs.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">Nothing else on file.</p>
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((doc) => (
            <DocRow key={doc.id} doc={doc} retreatId={retreatId} canManage={canManage} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function PaperworkTab({ retreatId }: { retreatId: string }) {
  return (
    <div className="flex flex-col gap-5">
      <ProposalsPanel retreatId={retreatId} />
      <CoiPanel retreatId={retreatId} />
      <OtherDocumentsPanel retreatId={retreatId} />
      <ContactsPanel retreatId={retreatId} />
      <TouchpointsPanel retreatId={retreatId} />
    </div>
  );
}
