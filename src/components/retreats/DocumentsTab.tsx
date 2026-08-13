import { FileText, ShieldCheck, Waves, DollarSign, FileQuestion, AlertTriangle, Paperclip, Plus, Pencil, ExternalLink } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { FilterPill } from '@/components/shared/FilterPill';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { dbSignRetreatDocument } from '@/lib/retreatsDb';
import type { Retreat, RetreatDocument, RetreatDocType, RetreatDocStatus } from '@/lib/types';
import { Badge, fmtDate, fmtDateFull, money } from './retreatUi';
import { toDateStr } from '@/lib/utils';

const DOC_TYPE_LABEL: Record<RetreatDocType, string> = {
  agreement: 'Retreat agreement',
  coi: 'Certificate of insurance',
  waiver: 'Activity waiver',
  deposit: 'Deposit',
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

/** The one line under a doc name — shaped by type + its meta blob. */
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

function overallBadge(docs: RetreatDocument[], retreat: Retreat) {
  const coi = docs.find((d) => d.docType === 'coi');
  const coiMissing = !coi || coi.status === 'missing';
  if (coiMissing) {
    return <Badge tone="alert">COI missing — due {fmtDate(coiDueDate(retreat.arrivalDate))}</Badge>;
  }
  if (docs.some((d) => d.status === 'pending' || d.status === 'missing')) {
    return <Badge tone="warn">Documents pending</Badge>;
  }
  if (docs.length === 0) return <Badge tone="neutral">No documents yet</Badge>;
  return <Badge tone="ok">All documents complete</Badge>;
}

async function viewFile(path: string) {
  const url = await dbSignRetreatDocument(path);
  if (url) window.open(url, '_blank');
  else alert('Could not open this document.');
}

export function DocumentsTab() {
  const { retreats, activeRetreatId, setActiveRetreat, selectedRetreat, docsFor, openModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = selectedRetreat();

  if (retreats.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-forest/30" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No retreats yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed">
            Once you add a retreat, its agreement, certificate of insurance, waivers, and deposit will be tracked here.
          </p>
        </div>
      </div>
    );
  }

  const docs = retreat ? docsFor(retreat.id) : [];
  const coi = docs.find((d) => d.docType === 'coi');
  const coiMissing = retreat && (!coi || coi.status === 'missing');
  const agreement = docs.find((d) => d.docType === 'agreement');
  const agreementMissing = retreat && !agreement;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      <div className="flex flex-wrap gap-2 mb-5">
        {retreats.map((r) => (
          <FilterPill
            key={r.id}
            label={r.groupName}
            active={(activeRetreatId ?? retreat?.id) === r.id}
            onClick={() => setActiveRetreat(r.id)}
          />
        ))}
      </div>

      {retreat && (
        <>
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2.5">
              <h3 className="text-[14px] font-semibold text-forest">{retreat.groupName}</h3>
              <span className="text-[12px] text-forest/45 font-mono">
                {fmtDate(retreat.arrivalDate)} – {fmtDate(retreat.departureDate)}
              </span>
            </div>
            {overallBadge(docs, retreat)}
          </div>

          <div className="flex flex-col gap-2 mb-6">
            {docs.length === 0 && (
              <p className="bg-white rounded-card border border-border px-4 py-8 text-center text-[13px] text-forest/45">
                No documents on file for this retreat yet.
              </p>
            )}

            {docs.map((doc) => {
              const missing = doc.status === 'missing';
              return (
                <div
                  key={doc.id}
                  className={`flex items-center gap-3.5 rounded-card border px-4 py-3 ${
                    missing ? 'bg-red-bg border-red/30' : 'bg-white border-border'
                  }`}
                >
                  <DocIcon doc={doc} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold ${missing ? 'text-red' : 'text-forest'}`}>
                      {doc.name || DOC_TYPE_LABEL[doc.docType]} — {STATUS_LABEL[doc.status]}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${missing ? 'text-red-text' : 'text-forest/50'}`}>
                      {missing && doc.docType === 'coi'
                        ? `Required: $1M general liability · Pinecrest named additional insured · Must be received by ${fmtDateFull(coiDueDate(retreat.arrivalDate))}`
                        : metaLine(doc)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-[11px] font-mono ${missing ? 'text-red font-semibold' : 'text-forest/45'}`}>
                      {missing ? 'Overdue' : doc.dueDate ? `Due ${fmtDate(doc.dueDate)}` : fmtDate(doc.updatedAt.slice(0, 10))}
                    </p>
                    <div className="flex gap-1.5 justify-end mt-1.5">
                      {doc.filePath && (
                        <Button size="sm" variant="ghost" onClick={() => viewFile(doc.filePath!)}>
                          <ExternalLink className="w-3.5 h-3.5" /> View
                        </Button>
                      )}
                      {missing && canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red border-red/40 hover:bg-red-bg"
                          onClick={() => openModal({ kind: 'sendReminder', retreatId: retreat.id, reminderType: 'coi' })}
                        >
                          Send reminder
                        </Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'editDoc', retreatId: retreat.id, docId: doc.id })}>
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {canManage && (
            <div className="flex items-center justify-between mb-4">
              <span className="text-[12px] text-forest/45">
                {docs.length} document{docs.length === 1 ? '' : 's'} tracked for this retreat.
              </span>
              <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'uploadDoc', retreatId: retreat.id, docType: 'other' })}>
                <Plus className="w-3.5 h-3.5" /> Add other document
              </Button>
            </div>
          )}

          {/* Retreat agreement — a dedicated slot; upload here or it shows in the list once added. */}
          {canManage && agreementMissing && (
            <div className="bg-white rounded-card border border-border px-5 py-4 mb-3">
              <p className="text-[13px] font-semibold text-forest mb-1">Add the retreat agreement</p>
              <p className="text-[12px] text-forest/50 mb-3.5">Upload the signed rental / retreat agreement for this group.</p>
              <button
                type="button"
                onClick={() => openModal({ kind: 'uploadDoc', retreatId: retreat.id, docType: 'agreement' })}
                className="w-full rounded-btn border-2 border-dashed border-border hover:border-sage hover:bg-sage-pale/40 transition-colors px-4 py-4 sm:py-6 text-center cursor-pointer"
              >
                <Paperclip className="w-6 h-6 text-forest/40 mx-auto mb-2" />
                <p className="text-[13px] font-medium text-forest">Click to upload retreat agreement</p>
                <p className="text-[11px] text-forest/45 mt-1">PDF, JPG, or PNG · Max 10MB</p>
              </button>
            </div>
          )}

          {canManage && coiMissing && (
            <div className="bg-white rounded-card border border-border px-5 py-4 mb-6">
              <p className="text-[13px] font-semibold text-forest mb-1">Upload certificate of insurance</p>
              <p className="text-[12px] text-forest/50 mb-3.5">
                Groups can upload directly via the guest portal, or you can upload on their behalf below.
              </p>
              <button
                type="button"
                onClick={() => openModal({ kind: 'uploadDoc', retreatId: retreat.id, docType: 'coi' })}
                className="w-full rounded-btn border-2 border-dashed border-border hover:border-sage hover:bg-sage-pale/40 transition-colors px-4 py-4 sm:py-6 text-center cursor-pointer"
              >
                <Paperclip className="w-6 h-6 text-forest/40 mx-auto mb-2" />
                <p className="text-[13px] font-medium text-forest">Click to upload COI document</p>
                <p className="text-[11px] text-forest/45 mt-1">PDF, JPG, or PNG · Max 10MB</p>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
