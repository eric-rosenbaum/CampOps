import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Upload, AlertTriangle, Check, ShieldOff } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useSafetyStore } from '@/store/safetyStore';
import { generateId } from '@/lib/utils';
import {
  parseDelimited, detectColumns, buildRows, isRefusedHeader,
  type StaffField, type ImportedStaffRow,
} from '@/lib/staffImport';
import type { SafetyStaff } from '@/lib/types';

/**
 * Bring a roster in from wherever it already lives.
 *
 * Three steps, and the middle one is the point: paste, *confirm what each column is*, then import.
 * Auto-detection handles the usual CampMinder and CampBrain headers, but it is shown as a set of
 * dropdowns the camp can correct, because a mis-mapped column writes one person's date of birth
 * against another person's name onto a form the director signs.
 *
 * Nothing is written until the last step, and the preview names every row that will be skipped
 * and why, so the count that appears on the roster afterwards is one the camp already agreed to.
 */
const FIELDS: StaffField[] = [
  'name', 'firstName', 'lastName', 'title', 'dateOfBirth', 'sex',
  'education', 'qualifyingExperience', 'hiredOn', 'firstDayOn', 'isVolunteer',
];

/**
 * The parser names a row's trouble in English (src/lib/staffImport.ts, shared and unit-tested).
 * Its known phrases are said in the reader's language here; anything new it learns to say still
 * shows, in English, rather than disappearing.
 */
const ROW_NOTE = {
  'no name in this row': 'import.noNameInRow',
  'date of birth not understood, left blank': 'import.dobNotUnderstood',
} as const;

export function StaffImportModal({ onClose }: { onClose: () => void }) {
  // Only opened from Camp Info › Staff, which is translated. The column headings a roster is
  // matched on are NOT translated: detectColumns reads English headings, and a camp's export
  // comes out of CampMinder or CampBrain in English whatever language its director reads.
  const { t, i18n } = useTranslation(['staff', 'common']);
  const rowNote = (s: string | null) =>
    s ? (ROW_NOTE[s as keyof typeof ROW_NOTE] ? t(ROW_NOTE[s as keyof typeof ROW_NOTE]) : s) : '';
  const { staff, addStaff } = useSafetyStore();
  const [text, setText] = useState('');
  const [mapping, setMapping] = useState<(StaffField | null)[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [body, setBody] = useState<string[][]>([]);
  const [done, setDone] = useState<number | null>(null);

  function read(raw: string) {
    setText(raw);
    const rows = parseDelimited(raw);
    if (rows.length < 2) { setMapping(null); setHeaders([]); setBody([]); return; }
    setHeaders(rows[0]);
    setBody(rows.slice(1));
    setMapping(detectColumns(rows[0]));
  }

  async function onFile(file: File) {
    read(await file.text());
  }

  const preview: ImportedStaffRow[] = mapping
    ? buildRows(body, mapping, staff.map((s) => s.name))
    : [];
  const importable = preview.filter((r) => !r.problem && !r.duplicate);
  const skipped = preview.filter((r) => r.problem || r.duplicate);
  const refusedHeaders = headers.filter(isRefusedHeader);

  function runImport() {
    const now = new Date().toISOString();
    for (const r of importable) {
      const member: SafetyStaff = {
        id: generateId(),
        name: r.name,
        title: r.title,
        isActive: true,
        dateOfBirth: r.dateOfBirth,
        sex: r.sex,
        education: r.education,
        qualifyingExperience: r.qualifyingExperience,
        professionalLicenseNumber: null,
        createdAt: now,
        updatedAt: now,
      };
      addStaff(member);
    }
    setDone(importable.length);
  }

  if (done !== null) {
    return (
      <Modal title={t('import.doneTitle')} onClose={onClose} width="520px">
        <div className="py-2">
          <p className="text-[13px] text-ink leading-relaxed">
            <Trans t={t} i18nKey="import.added" count={done}
              components={{ b: <strong className="font-mono" /> }} />
            {skipped.length > 0 && <> {t('import.skippedAfter', { count: skipped.length })}</>}
          </p>
          <p className="text-[12px] text-ink-soft mt-2 leading-relaxed">
            {t('import.doneNote')}
          </p>
          <div className="flex justify-end mt-4">
            <Button onClick={onClose}>{t('common:actions.done')}</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t('import.title')} onClose={onClose} width="820px">
      <div className="space-y-4">
        <p className="text-[12.5px] text-ink-soft leading-relaxed">
          {t('import.intro')}
          {i18n.language !== 'en' && <> {t('import.headersNote')}</>}
        </p>

        <div className="flex items-center gap-2.5 flex-wrap">
          <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-forest
                            border border-border rounded-btn px-3 py-1.5 cursor-pointer hover:border-sage">
            <Upload className="w-3.5 h-3.5" />
            {t('import.chooseCsv')}
            <input type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          </label>
          <span className="text-[11.5px] text-ink-faint">{t('import.orPaste')}</span>
        </div>

        <textarea
          value={text}
          onChange={(e) => read(e.target.value)}
          rows={text ? 4 : 7}
          dir="auto"
          placeholder={'Name,Position,Date of Birth\nAvery Cole,Counselor,03/14/2007'}
          className="w-full rounded-input border border-border px-3 py-2 text-[12px] font-mono
                     focus:border-sage focus:outline-none"
        />

        {refusedHeaders.length > 0 && (
          <div className="rounded-card border border-amber/30 bg-amber-bg px-4 py-3">
            <p className="text-[12.5px] text-amber-text inline-flex items-start gap-1.5">
              <ShieldOff className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                {t('import.ignoring', { headers: refusedHeaders.map((h) => `"${h}"`).join(', ') })}
              </span>
            </p>
          </div>
        )}

        {mapping && (
          <>
            <div>
              <p className="text-[12px] font-semibold text-forest mb-2">
                {t('import.whatColumn')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 min-w-0">
                    <span className="text-[11.5px] font-mono text-ink-soft truncate flex-1 min-w-0"
                      title={h}>
                      {h || <em className="text-ink-faint">{t('import.unnamed')}</em>}
                    </span>
                    <select
                      value={mapping[i] ?? ''}
                      disabled={isRefusedHeader(h)}
                      onChange={(e) => setMapping(mapping.map((m, j) =>
                        j === i ? (e.target.value || null) as StaffField | null : m))}
                      className="rounded-input border border-border px-2 py-1 text-[11.5px]
                                 focus:border-sage focus:outline-none disabled:bg-paper-raised
                                 w-[10.5rem] flex-shrink-0"
                    >
                      <option value="">{t('import.doNotImport')}</option>
                      {FIELDS.map((f) => (
                        <option key={f} value={f}>{t(`field.${f}`)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-card border border-border overflow-hidden">
              <div className="px-4 py-2 border-b border-cream-dark flex items-baseline gap-3 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-ink-soft">
                  {t('import.preview')}
                </span>
                <span className="text-[11.5px] text-green-muted-text font-semibold">
                  {t('import.toAdd', { count: importable.length })}
                </span>
                {skipped.length > 0 && (
                  <span className="text-[11.5px] text-amber-text font-semibold">
                    {t('import.skipped', { count: skipped.length })}
                  </span>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto">
                {preview.slice(0, 60).map((r, i) => (
                  <div key={i}
                    className="px-4 py-1.5 border-b border-cream-dark last:border-b-0 flex items-center gap-3 text-[12px]">
                    {r.problem || r.duplicate
                      ? <AlertTriangle className="w-3 h-3 text-amber-text flex-shrink-0" />
                      : r.warning
                        ? <AlertTriangle className="w-3 h-3 text-ink-faint flex-shrink-0" />
                        : <Check className="w-3 h-3 text-green-muted-text flex-shrink-0" />}
                    <span className="font-medium text-ink min-w-0 truncate flex-1">
                      {r.name || <em className="text-ink-faint">{t('import.noName')}</em>}
                    </span>
                    <span className="text-ink-soft min-w-0 truncate flex-1">{r.title}</span>
                    <span dir="ltr" className="font-mono text-[11px] text-ink-faint w-24 text-end">
                      {r.dateOfBirth ?? ''}
                    </span>
                    <span className={`text-[11px] w-52 text-end truncate ${
                      r.problem || r.duplicate ? 'text-amber-text' : 'text-ink-faint'}`}
                      title={r.warning ? rowNote(r.warning) : undefined}>
                      {r.duplicate ? t('import.alreadyOnRoster') : rowNote(r.problem ?? r.warning)}
                    </span>
                  </div>
                ))}
                {preview.length > 60 && (
                  <p className="px-4 py-2 text-[11.5px] text-ink-faint">
                    {t('import.more', { count: preview.length - 60 })}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button disabled={importable.length === 0} onClick={runImport}>
            {t('import.addPeople', { count: importable.length })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
