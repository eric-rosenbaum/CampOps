// The one channel a camp uses to send us their setup data. Anything that arrives by email
// is outside RLS and outside the audit log; this keeps hand-offs inside the camp's own
// tenant boundary, with a visible receipt for the camp and a trail for us.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { localizedLabels } from '@/i18n';
import { Upload, Check, Download, FileText, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  dbListImplementationFiles, dbUploadImplementationFile, dbSignImplementationFile,
} from '@/lib/implementationFilesDb';
import { formatDateTime } from '@/lib/utils';
import { IMPLEMENTATION_CATEGORIES } from '@/lib/types';
import type { ImplementationFile, ImplementationCategory } from '@/lib/types';

const cardCls = 'bg-white border border-border rounded-xl p-5';

// Named for what the camp is sending, in the order the setup guide asks for it, so the list
// reads as a checklist rather than an inventory of our tables.
// Read in the viewer's language. The stored `category` is the key, never this label.
const CATEGORY_LABELS: Record<ImplementationCategory, string> =
  localizedLabels('campInfo:files.categories', IMPLEMENTATION_CATEGORIES);

// Most formats a camp will realistically have their data in.
const ACCEPT = '.csv,.tsv,.xlsx,.xls,.numbers,.pdf,.txt,.doc,.docx,.json,.zip';

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Reusable drop zone ────────────────────────────────────────────────────────

/** Drag-or-click upload target for a single hand-off file. */
export function ImplementationDropzone({
  category, title, blurb, note, onUploaded,
}: {
  category: ImplementationCategory;
  title: string;
  blurb: string;
  note?: string | null;
  onUploaded?: (f: ImplementationFile) => void;
}) {
  const { t } = useTranslation('campInfo');
  const { currentUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<{ state: 'uploading' | 'done' | 'error'; fileName: string } | null>(null);

  async function send(file: File | undefined) {
    if (!file) return;
    setStatus({ state: 'uploading', fileName: file.name });
    const saved = await dbUploadImplementationFile(file, category, note ?? null, currentUser);
    setStatus({ state: saved ? 'done' : 'error', fileName: file.name });
    if (saved) onUploaded?.(saved);
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); send(e.dataTransfer.files?.[0]); }}
      onClick={() => status?.state !== 'uploading' && inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
        dragOver ? 'border-sage bg-sage-pale/40' : 'border-border hover:border-forest/40 bg-paper/60'
      }`}
    >
      <input
        ref={inputRef} type="file" accept={ACCEPT} className="hidden"
        onChange={e => { send(e.target.files?.[0]); e.target.value = ''; }}
      />
      {status?.state === 'done' ? (
        <div className="flex flex-col items-center gap-1.5 text-sage">
          <Check className="w-5 h-5" />
          <p className="text-[12px] font-medium">{t('files.gotIt')} · <bdi>{status.fileName}</bdi></p>
          <p className="text-[11px] text-ink-faint">
            {t('files.followUp')} <span className="underline">{t('files.sendAnother')}</span>
          </p>
        </div>
      ) : status?.state === 'uploading' ? (
        <p className="text-[12px] text-ink-soft py-2">{t('files.uploading', { name: status.fileName })}</p>
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <Upload className={`w-5 h-5 ${dragOver ? 'text-sage' : 'text-ink-faint'}`} />
          <p className="text-[12px] font-semibold text-forest">{title}</p>
          <p className="text-[11px] text-ink-faint leading-snug">{blurb}</p>
          {status?.state === 'error' && <p className="text-[11px] text-red">{t('files.failed')}</p>}
        </div>
      )}
    </div>
  );
}

// ── Full tab ──────────────────────────────────────────────────────────────────

export function ImplementationFilesTab() {
  const { t } = useTranslation(['campInfo', 'common']);
  const [files, setFiles] = useState<ImplementationFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<ImplementationCategory>('locations');
  const [note, setNote] = useState('');

  const reload = useCallback(() => {
    dbListImplementationFiles().then(f => { setFiles(f); setLoading(false); });
  }, []);
  useEffect(reload, [reload]);

  async function download(f: ImplementationFile) {
    const url = await dbSignImplementationFile(f);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="p-7 max-w-3xl space-y-5">
      {/* Send something */}
      <div className={cardCls}>
        <h2 className="text-[13px] font-semibold text-forest mb-1">{t('files.title')}</h2>
        <p className="text-[12px] text-ink-faint mb-4">
          {t('files.intro')}
        </p>

        <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
          <label className="flex-1">
            <span className="block text-[12px] font-medium text-ink-soft mb-1">{t('files.whatIsIt')}</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as ImplementationCategory)}
              className="w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage"
            >
              {IMPLEMENTATION_CATEGORIES.map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="block text-[12px] font-medium text-ink-soft mb-1">
              {t('files.note')} <span className="text-forest/30 font-normal">{t('optional')}</span>
            </span>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('files.notePlaceholder')}
              className="w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage"
            />
          </label>
        </div>

        <ImplementationDropzone
          category={category}
          note={note}
          title={t('files.dropTitle')}
          blurb={t('files.dropBlurb')}
          onUploaded={() => { setNote(''); reload(); }}
        />

        <div className="mt-3 flex gap-2 text-[11px] text-ink-soft bg-cream/60 border border-border rounded-btn px-3 py-2.5 leading-relaxed">
          <ShieldCheck className="w-3.5 h-3.5 text-sage flex-shrink-0 mt-px" />
          <p>
            {t('files.privacy')}
          </p>
        </div>
      </div>

      {/* Receipts */}
      <div className={cardCls}>
        <h2 className="text-[13px] font-semibold text-forest mb-1">{t('files.sentTitle')}</h2>
        <p className="text-[12px] text-ink-faint mb-4">{t('files.sentIntro')}</p>

        {loading ? (
          <p className="text-[12px] text-ink-faint py-3">{t('common:actions.loading')}</p>
        ) : files.length === 0 ? (
          <div className="text-center py-7 text-ink-faint">
            <FileText className="w-7 h-7 mx-auto mb-2 opacity-40" />
            <p className="text-[12px]">{t('files.none')}</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-3 py-2.5">
                <FileText className="w-4 h-4 text-forest/25 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-forest truncate">{f.name}</p>
                  <p className="text-[11px] text-ink-faint">
                    {CATEGORY_LABELS[f.category] ?? f.category}
                    {f.sizeBytes != null && <> · <bdi>{formatSize(f.sizeBytes)}</bdi></>}
                    {' · '}{formatDateTime(f.createdAt)}
                    {f.uploaderName && ` · ${f.uploaderName}`}
                  </p>
                  {f.note && <p className="text-[11px] text-ink-faint italic mt-0.5 truncate">“{f.note}”</p>}
                </div>
                <button
                  onClick={() => download(f)}
                  className="flex items-center gap-1 text-[12px] text-ink-faint hover:text-forest px-2 py-1 rounded hover:bg-cream transition-colors flex-shrink-0"
                >
                  <Download className="w-3 h-3" />
                  {t('files.download')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
