import { useRef, useState } from 'react';
import { Upload, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { UploadProgressBar } from '@/components/shared/UploadProgressBar';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import type { UploadStatus } from '@/lib/uploadProgress';

/**
 * The evidence locker: everything the camp has attached, and what expires when.
 *
 * Expiry is the point. A certificate on file that lapsed in June is worse than no certificate,
 * because it reads as done. The engine already refuses to count expired documents; this screen
 * is where a camp sees it coming.
 */
export function DocumentsPanel() {
  const { documents, requirements, enabledProfileIds, uploadDocument, openDocument } = useComplianceStore();
  const { currentUser, can } = useAuth();
  const canManage = can('manageSafetyItems');

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [reqId, setReqId] = useState('');
  const [progress, setProgress] = useState<UploadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabled = new Set(enabledProfileIds);
  const attachable = requirements
    .filter((r) => enabled.has(r.profileId))
    .sort((a, b) => a.reqCode.localeCompare(b.reqCode));

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  async function submit() {
    if (!file) return;
    setError(null);
    setProgress({ stage: 'uploading', percent: 0, label: 'Uploading' });
    try {
      await uploadDocument(file, title.trim() || file.name, reqId ? [reqId] : [],
        expiresOn || null, { id: currentUser.id ?? null, name: currentUser.name ?? null }, setProgress);
      setFile(null); setTitle(''); setExpiresOn(''); setReqId('');
      setTimeout(() => setProgress(null), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload did not complete.');
      setProgress(null);
    }
  }

  return (
    <div>
      {canManage && (
        <div className="bg-white rounded-card border border-border px-5 py-4 mb-5">
          <p className="text-[14px] font-semibold text-forest mb-3">Attach evidence</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <input ref={fileRef} type="file" className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xlsx"
                onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); e.target.value = ''; }} />
              <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> {file ? 'Change file' : 'Choose a file'}
              </Button>
              {file && <p className="text-[12px] text-ink-soft mt-1.5 truncate">{file.name}</p>}
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is it? e.g. Workers' comp certificate"
              className="text-[13px] bg-white border border-border rounded-btn px-3 py-2" />
            <select value={reqId} onChange={(e) => setReqId(e.target.value)}
              className="text-[13px] bg-white border border-border rounded-btn px-3 py-2 text-ink-soft">
              <option value="">Attach to a requirement (optional)</option>
              {attachable.map((r) => <option key={r.id} value={r.id}>{r.reqCode} — {r.label.slice(0, 60)}</option>)}
            </select>
            <div>
              <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)}
                className="w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2" />
              <p className="text-[11px] text-ink-faint mt-1">Expiry, if it has one. We stop counting it the day it lapses.</p>
            </div>
          </div>
          {progress && <div className="mt-3"><UploadProgressBar status={progress} fileName={file?.name} /></div>}
          {error && <p className="text-[12.5px] text-red-text mt-2">{error}</p>}
          <Button size="sm" className="mt-3" disabled={!file || progress !== null} onClick={submit}>Upload</Button>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="bg-white rounded-card border border-border px-5 py-8 text-center">
          <FileText className="w-6 h-6 text-ink-faint mx-auto mb-2" />
          <p className="text-[13px] text-ink-soft">Nothing attached yet.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {documents.map((d) => {
            const expired = !!d.expiresOn && d.expiresOn < today;
            const expiring = !!d.expiresOn && !expired && d.expiresOn <= soon;
            return (
              <div key={d.id} className={`bg-white rounded-card border px-4 py-3 flex items-center gap-3 ${
                expired ? 'border-red/40' : expiring ? 'border-amber/40' : 'border-border'}`}>
                <FileText className="w-4 h-4 text-ink-faint flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <button onClick={async () => { const u = await openDocument(d.bucketPath); if (u) window.open(u, '_blank', 'noopener'); }}
                    className="text-[13.5px] font-medium text-forest hover:underline truncate block text-left">
                    {d.title}
                  </button>
                  <p className="text-[11.5px] text-ink-faint mt-0.5">
                    {d.uploaderName ? `${d.uploaderName} · ` : ''}{d.createdAt.slice(0, 10)}
                    {d.requirementIds.length > 0 && ` · linked to ${d.requirementIds.length} requirement${d.requirementIds.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                {d.expiresOn && (
                  <span className={`text-[11.5px] font-medium flex-shrink-0 inline-flex items-center gap-1 ${
                    expired ? 'text-red-text' : expiring ? 'text-amber-text' : 'text-ink-faint'}`}>
                    {(expired || expiring) && <AlertTriangle className="w-3 h-3" />}
                    {expired ? `Expired ${d.expiresOn}` : `Expires ${d.expiresOn}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
