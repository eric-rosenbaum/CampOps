import { useRef, useState } from 'react';
import { Upload, FileText, Download, Trash2, Loader2 } from 'lucide-react';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import { dbSignCommissaryFile } from '@/lib/db';
import type { CommissaryFile } from '@/lib/types';

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Drag-and-drop document locker for allergy/roster source files. Health-gated by RLS. */
export function CommissaryFilesPanel() {
  const { files, uploadFile, deleteFile, activeSessionId } = useCommissaryStore();
  const { currentUser, can } = useAuth();
  const canManage = can('manageCommissary');
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFiles(list: FileList | null) {
    if (!list || !list.length) return;
    setBusy(true);
    for (const file of Array.from(list)) {
      await uploadFile(file, activeSessionId, currentUser.name || null);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function download(f: CommissaryFile) {
    const url = await dbSignCommissaryFile(f.path);
    if (url) window.open(url, '_blank');
    else alert('Could not open this file. Try again.');
  }

  return (
    <div className="mb-6">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-forest/40 mb-2">Allergy documents</p>

      {canManage && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-card border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-sage bg-green-muted-bg/40' : 'border-border bg-cream-dark/20 hover:border-forest/30'
          }`}
        >
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          {busy ? (
            <Loader2 className="w-6 h-6 text-forest/40 mx-auto mb-2 animate-spin" />
          ) : (
            <Upload className="w-6 h-6 text-forest/40 mx-auto mb-2" />
          )}
          <p className="text-[13px] font-medium text-forest">Drop an allergy roster or document here</p>
          <p className="text-[12px] text-forest/45 mt-1">
            or click to choose a file. Stored securely — visible only to admins and health staff.
          </p>
        </div>
      )}

      {files.length > 0 ? (
        <div className="bg-white rounded-card border border-border overflow-hidden mt-3">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
              <FileText className="w-4 h-4 text-forest/40 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-forest truncate">{f.name}</p>
                <p className="text-[11px] text-forest/40">
                  {fmtSize(f.sizeBytes)}{f.sizeBytes != null ? ' · ' : ''}
                  {new Date(f.createdAt).toLocaleDateString()}{f.uploadedBy ? ` · ${f.uploadedBy}` : ''}
                </p>
              </div>
              <button onClick={() => download(f)} className="p-1.5 text-forest/40 hover:text-forest" title="Download" aria-label="Download">
                <Download className="w-4 h-4" />
              </button>
              {canManage && (
                <button
                  onClick={() => { if (confirm(`Delete "${f.name}"?`)) deleteFile(f); }}
                  className="p-1.5 text-forest/30 hover:text-red" title="Delete" aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        !canManage && <p className="text-[13px] text-forest/45 mt-2">No documents uploaded.</p>
      )}
    </div>
  );
}
