import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { generateId } from '@/lib/utils';
import type { RetreatDocument, RetreatDocType, RetreatDocStatus } from '@/lib/types';
import { inputClass, labelClass } from './retreatUi';

const DOC_TYPE_OPTIONS: { value: RetreatDocType; label: string; defaultName: string }[] = [
  { value: 'agreement', label: 'Retreat agreement', defaultName: 'Retreat agreement' },
  { value: 'coi', label: 'Certificate of insurance', defaultName: 'Certificate of insurance' },
  { value: 'waiver', label: 'Activity waiver', defaultName: 'Activity waiver' },
  { value: 'deposit', label: 'Deposit', defaultName: 'Deposit received' },
  { value: 'other', label: 'Other document', defaultName: '' },
];

const STATUS_OPTIONS: { value: RetreatDocStatus; label: string }[] = [
  { value: 'missing', label: 'Not received' },
  { value: 'pending', label: 'Pending review' },
  { value: 'received', label: 'Received' },
  { value: 'signed', label: 'Signed' },
  { value: 'approved', label: 'Approved' },
];

export function DocumentModal({ retreatId, docType, docId }: { retreatId: string; docType?: RetreatDocType; docId?: string }) {
  const { docsFor, addDocument, updateDocument, deleteDocument, uploadDocument, closeModal } = useRetreatStore();
  const existing = docId ? docsFor(retreatId).find((d) => d.id === docId) ?? null : null;

  const initialType: RetreatDocType = existing?.docType ?? docType ?? 'coi';
  const [type, setType] = useState<RetreatDocType>(initialType);
  const [name, setName] = useState(
    existing?.name ?? DOC_TYPE_OPTIONS.find((o) => o.value === initialType)?.defaultName ?? '',
  );
  const [status, setStatus] = useState<RetreatDocStatus>(existing?.status ?? 'received');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // COI structured meta.
  const em = (existing?.meta ?? {}) as Record<string, unknown>;
  const [policyNumber, setPolicyNumber] = useState(em.policyNumber ? String(em.policyNumber) : '');
  const [coverage, setCoverage] = useState(em.coverage ? String(em.coverage) : '');
  const [expiry, setExpiry] = useState(em.expiry ? String(em.expiry) : '');
  const [additionalInsured, setAdditionalInsured] = useState(
    em.additionalInsured ? String(em.additionalInsured) : 'Pinecrest Summer Camp',
  );

  function handleTypeChange(v: RetreatDocType) {
    setType(v);
    const opt = DOC_TYPE_OPTIONS.find((o) => o.value === v);
    if (opt && (!name || DOC_TYPE_OPTIONS.some((o) => o.defaultName === name))) setName(opt.defaultName);
  }

  function coiMeta(): Record<string, unknown> | null {
    if (type !== 'coi') return existing?.meta ?? null;
    return {
      policyNumber: policyNumber.trim() || null,
      coverage: coverage.trim() || null,
      expiry: expiry || null,
      additionalInsured: additionalInsured.trim() || null,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const meta = coiMeta();

    if (existing) {
      updateDocument({
        ...existing,
        docType: type,
        name: name.trim(),
        status,
        dueDate: dueDate || null,
        meta,
        updatedAt: new Date().toISOString(),
      });
      closeModal();
      return;
    }

    if (file) {
      setBusy(true);
      try {
        await uploadDocument(file, retreatId, type, name.trim(), meta, dueDate || null);
        closeModal();
      } finally {
        setBusy(false);
      }
      return;
    }

    const now = new Date().toISOString();
    const doc: RetreatDocument = {
      id: generateId(), campId: '', retreatId,
      docType: type, name: name.trim(), status,
      filePath: null, signedBy: null, signedAt: null,
      dueDate: dueDate || null, meta,
      sortOrder: docsFor(retreatId).length, createdAt: now, updatedAt: now,
    };
    addDocument(doc);
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Remove "${existing.name}" from this retreat?`)) {
      deleteDocument(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit document' : 'Add document'} onClose={closeModal} width="520px">
      <form onSubmit={handleSubmit} className="space-y-4">
        {type === 'coi' && (
          <div className="rounded-card border border-blue/20 bg-blue-bg px-3.5 py-3 text-[12px] text-blue-text leading-relaxed">
            <strong>Required coverage:</strong> $1M general liability · $2M aggregate ·
            Pinecrest Summer Camp named as additional insured · valid through the retreat departure date.
          </div>
        )}

        <div>
          <label className={labelClass}>Document type</label>
          <select value={type} onChange={(e) => handleTypeChange(e.target.value as RetreatDocType)} className={inputClass}>
            {DOC_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass}>Name *</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass}
                 placeholder="e.g. Certificate of insurance" />
        </div>

        {!existing && (
          <div>
            <label className={labelClass}>File (optional)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-[12px] text-ink file:mr-3 file:rounded-btn file:border file:border-border file:bg-cream-dark file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-forest hover:file:bg-cream cursor-pointer"
            />
            <p className="text-[11px] text-ink-faint mt-1">
              Attach the PDF/image to store it privately. Leave blank to just record the status.
            </p>
          </div>
        )}

        {(existing || !file) && (
          <div>
            <label className={labelClass}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as RetreatDocStatus)} className={inputClass}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        {type === 'coi' && (
          <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-3 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">Policy details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Policy number</label>
                <input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className={inputClass} placeholder="Policy #" />
              </div>
              <div>
                <label className={labelClass}>Coverage</label>
                <input value={coverage} onChange={(e) => setCoverage(e.target.value)} className={inputClass} placeholder="$1M general liability" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Expiration</label>
                <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Additional insured</label>
                <input value={additionalInsured} onChange={(e) => setAdditionalInsured(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>Due date {type === 'coi' && <span className="text-ink-faint normal-case">(14 days before arrival)</span>}</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={busy} className="flex-1 justify-center">
            {busy ? 'Uploading…' : existing ? 'Save changes' : file ? 'Upload document' : 'Add document'}
          </Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
