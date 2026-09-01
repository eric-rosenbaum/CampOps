import { useState } from 'react';
import { Upload, AlertTriangle, Check, ShieldOff } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useSafetyStore } from '@/store/safetyStore';
import { generateId } from '@/lib/utils';
import {
  parseDelimited, detectColumns, buildRows, isRefusedHeader, FIELD_LABEL,
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

export function StaffImportModal({ onClose }: { onClose: () => void }) {
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
      <Modal title="Roster imported" onClose={onClose} width="520px">
        <div className="py-2">
          <p className="text-[13px] text-ink leading-relaxed">
            <strong className="font-mono">{done}</strong> {done === 1 ? 'person' : 'people'} added.
            {skipped.length > 0 && ` ${skipped.length} skipped, listed before you confirmed.`}
          </p>
          <p className="text-[12px] text-ink-soft mt-2 leading-relaxed">
            Certifications and screening dates are not part of an import. Add those from the staff
            clearance screen, where each one is recorded by a person who knows what they are
            attesting to.
          </p>
          <div className="flex justify-end mt-4">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Import a staff roster" onClose={onClose} width="820px">
      <div className="space-y-4">
        <p className="text-[12.5px] text-ink-soft leading-relaxed">
          Export your roster from CampMinder, CampBrain, or whatever holds it, and paste it below.
          A spreadsheet copied straight out of Excel works too. Nothing is saved until you confirm
          the columns.
        </p>

        <div className="flex items-center gap-2.5 flex-wrap">
          <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-forest
                            border border-border rounded-btn px-3 py-1.5 cursor-pointer hover:border-sage">
            <Upload className="w-3.5 h-3.5" />
            Choose a CSV
            <input type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          </label>
          <span className="text-[11.5px] text-ink-faint">or paste below</span>
        </div>

        <textarea
          value={text}
          onChange={(e) => read(e.target.value)}
          rows={text ? 4 : 7}
          placeholder={'Name,Position,Date of Birth\nAvery Cole,Counselor,03/14/2007'}
          className="w-full rounded-input border border-border px-3 py-2 text-[12px] font-mono
                     focus:border-sage focus:outline-none"
        />

        {refusedHeaders.length > 0 && (
          <div className="rounded-card border border-amber/30 bg-amber-bg px-4 py-3">
            <p className="text-[12.5px] text-amber-text inline-flex items-start gap-1.5">
              <ShieldOff className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Ignoring {refusedHeaders.map((h) => `"${h}"`).join(', ')}. We record that a check
                was run and when — never its result, and never a social security number.
              </span>
            </p>
          </div>
        )}

        {mapping && (
          <>
            <div>
              <p className="text-[12px] font-semibold text-forest mb-2">
                What is in each column?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 min-w-0">
                    <span className="text-[11.5px] font-mono text-ink-soft truncate flex-1 min-w-0"
                      title={h}>
                      {h || <em className="text-ink-faint">unnamed</em>}
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
                      <option value="">Do not import</option>
                      {FIELDS.map((f) => (
                        <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-card border border-border overflow-hidden">
              <div className="px-4 py-2 border-b border-cream-dark flex items-baseline gap-3 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-ink-soft">
                  Preview
                </span>
                <span className="text-[11.5px] text-green-muted-text font-semibold">
                  {importable.length} to add
                </span>
                {skipped.length > 0 && (
                  <span className="text-[11.5px] text-amber-text font-semibold">
                    {skipped.length} skipped
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
                      {r.name || <em className="text-ink-faint">no name</em>}
                    </span>
                    <span className="text-ink-soft min-w-0 truncate flex-1">{r.title}</span>
                    <span className="font-mono text-[11px] text-ink-faint w-24 text-right">
                      {r.dateOfBirth ?? ''}
                    </span>
                    <span className={`text-[11px] w-52 text-right truncate ${
                      r.problem || r.duplicate ? 'text-amber-text' : 'text-ink-faint'}`}
                      title={r.warning ?? undefined}>
                      {r.duplicate ? 'already on the roster' : r.problem ?? r.warning ?? ''}
                    </span>
                  </div>
                ))}
                {preview.length > 60 && (
                  <p className="px-4 py-2 text-[11.5px] text-ink-faint">
                    …and {preview.length - 60} more.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={importable.length === 0} onClick={runImport}>
            Add {importable.length} {importable.length === 1 ? 'person' : 'people'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
