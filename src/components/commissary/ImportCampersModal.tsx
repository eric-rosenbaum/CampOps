import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { Camper, CamperRestriction, RestrictionSeverity } from '@/lib/types';
import {
  ALLERGENS, ALLERGEN_LABELS, DIETARY_RESTRICTIONS, DIETARY_LABELS, restrictionKind,
} from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

type Row = Record<string, string>;

/**
 * Interpret a restriction cell. A blank/no/0 cell means the camper does not have it.
 * Anything else is a severity if we recognise it, otherwise a confirmed allergy — a
 * roster that just puts an "x" in the peanut column should not be read as "no allergy".
 */
function parseSeverity(raw: string): RestrictionSeverity | null {
  const v = raw.trim().toLowerCase();
  if (!v || v === 'no' || v === 'n' || v === '0' || v === 'false' || v === '-') return null;
  if (v.startsWith('ana') || v === '!' || v.includes('epi')) return 'anaphylactic';
  if (v.startsWith('int') || v.startsWith('sens') || v === '~') return 'intolerance';
  return 'confirmed';
}

const NAME_KEYS = ['name', 'camper', 'camper name', 'full name', 'first name'];
const CABIN_KEYS = ['cabin', 'bunk', 'unit', 'group'];

function findKey(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const hit = headers.find((h) => h.trim().toLowerCase() === c);
    if (hit) return hit;
  }
  return null;
}

export function ImportCampersModal() {
  const { importCampers, activeSessionId, closeModal } = useCommissaryStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [nameKey, setNameKey] = useState('');
  const [cabinKey, setCabinKey] = useState('');
  const [importing, setImporting] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed = XLSX.utils.sheet_to_json<Row>(ws, { defval: '' });
        if (!parsed.length) { alert('That sheet appears to be empty.'); return; }
        const hdrs = Object.keys(parsed[0]);
        setRows(parsed);
        setHeaders(hdrs);
        setNameKey(findKey(hdrs, NAME_KEYS) ?? hdrs[0] ?? '');
        setCabinKey(findKey(hdrs, CABIN_KEYS) ?? '');
      } catch {
        alert('Could not read file. Please use a .csv or .xlsx file.');
      }
    };
    reader.readAsBinaryString(file);
  }

  // Restriction columns are matched by header name against the canonical slugs and
  // their labels, so "Tree nut", "tree_nut" and "TREE NUT" all land on the same slug.
  const restrictionColumns = headers
    .map((h): { header: string; slug: string } | null => {
      const norm = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
      const slug = [...ALLERGENS, ...DIETARY_RESTRICTIONS].find((s) => {
        const label = (ALLERGEN_LABELS as Record<string, string>)[s]
          ?? (DIETARY_LABELS as Record<string, string>)[s];
        return s === norm || label?.toLowerCase().replace(/[\s-]+/g, '_') === norm;
      });
      return slug ? { header: h, slug: slug as string } : null;
    })
    .filter((x): x is { header: string; slug: string } => x !== null);

  const validRows = rows.filter((r) => String(r[nameKey] ?? '').trim());
  const skipped = rows.length - validRows.length;

  async function handleImport() {
    if (!nameKey || !validRows.length) return;
    setImporting(true);
    const now = new Date().toISOString();

    const payload = validRows.map((r) => {
      const camperId = generateId();
      const camper: Camper = {
        id: camperId,
        sessionId: activeSessionId,
        name: String(r[nameKey]).trim(),
        cabin: cabinKey ? String(r[cabinKey] ?? '').trim() || null : null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      };
      const restrictions: CamperRestriction[] = [];
      for (const col of restrictionColumns) {
        const kind = restrictionKind(col.slug);
        const raw = String(r[col.header] ?? '');
        if (kind === 'allergen') {
          const severity = parseSeverity(raw);
          if (severity) {
            restrictions.push({
              id: generateId(), camperId, restriction: col.slug, kind: 'allergen',
              severity, notes: null, createdAt: now, updatedAt: now,
            });
          }
        } else {
          // Dietary columns are a yes/no; severity must be null per the CHECK constraint.
          if (parseSeverity(raw)) {
            restrictions.push({
              id: generateId(), camperId, restriction: col.slug, kind: 'dietary',
              severity: null, notes: null, createdAt: now, updatedAt: now,
            });
          }
        }
      }
      return { camper, restrictions };
    });

    await importCampers(payload);
    setImporting(false);
    closeModal();
  }

  return (
    <Modal title="Import camper roster" onClose={closeModal} width="600px">
      <div className="space-y-4">
        {rows.length === 0 ? (
          <>
            <p className="text-[13px] text-forest/60 leading-relaxed">
              Upload a spreadsheet with one row per camper. Include a name column, optionally
              a cabin column, and one column per allergy or dietary restriction.
            </p>
            <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-3">
              <p className="text-[11px] font-semibold text-forest/60 uppercase tracking-widest mb-1.5">Example</p>
              <pre className="text-[11px] font-mono text-forest/60 overflow-x-auto">
{`Name,Cabin,Peanut,Tree nut,Gluten,Vegetarian
Sarah M.,Cabin 3,anaphylactic,yes,,
Emma T.,Cabin 2,,anaphylactic,yes,yes`}
              </pre>
              <p className="text-[11px] text-forest/45 mt-2 leading-relaxed">
                A blank cell means no restriction. Write <span className="font-mono">anaphylactic</span>,{' '}
                <span className="font-mono">intolerance</span>, or anything else (like{' '}
                <span className="font-mono">yes</span>) for a confirmed allergy.
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
            <Button variant="ghost" className="w-full justify-center" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" /> Choose a .csv or .xlsx file
            </Button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Name column *</label>
                <select value={nameKey} onChange={(e) => setNameKey(e.target.value)} className={inputClass}>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Cabin column</label>
                <select value={cabinKey} onChange={(e) => setCabinKey(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-3">
              <p className="text-[12px] text-forest/70">
                <span className="font-mono font-semibold text-forest">{validRows.length}</span> campers ·{' '}
                <span className="font-mono font-semibold text-forest">{restrictionColumns.length}</span> restriction
                {restrictionColumns.length === 1 ? '' : 's'} recognised
              </p>
              {restrictionColumns.length > 0 && (
                <p className="text-[11px] text-forest/45 mt-1">
                  {restrictionColumns.map((c) => c.header).join(', ')}
                </p>
              )}
              {skipped > 0 && (
                <p className="text-[11px] text-amber-text mt-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> {skipped} row{skipped === 1 ? '' : 's'} skipped — no name.
                </p>
              )}
              {restrictionColumns.length === 0 && (
                <p className="text-[11px] text-amber-text mt-1.5 flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  No restriction columns matched. Campers will import with no allergies —
                  check that your headers use names like "Peanut" or "Tree nut".
                </p>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto rounded-card border border-border">
              <table className="w-full">
                <thead className="bg-cream-dark/40 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-forest/40">Name</th>
                    <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-forest/40">Cabin</th>
                    <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-forest/40">Restrictions</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.slice(0, 20).map((r, i) => {
                    const found = restrictionColumns.filter((c) => parseSeverity(String(r[c.header] ?? '')));
                    return (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5 text-[12px] text-forest">{String(r[nameKey])}</td>
                        <td className="px-3 py-1.5 text-[12px] text-forest/50">{cabinKey ? String(r[cabinKey] ?? '') : '—'}</td>
                        <td className="px-3 py-1.5 text-[11px] text-forest/50">
                          {found.length ? found.map((c) => c.header).join(', ') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {validRows.length > 20 && (
                <p className="px-3 py-1.5 text-[11px] text-forest/40 border-t border-border">
                  …and {validRows.length - 20} more
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 justify-center" onClick={handleImport} disabled={!nameKey || !validRows.length || importing}>
                {importing ? 'Importing…' : `Import ${validRows.length} camper${validRows.length === 1 ? '' : 's'}`}
              </Button>
              <Button variant="ghost" onClick={() => { setRows([]); setHeaders([]); }}>Choose another file</Button>
            </div>
          </>
        )}

        {rows.length === 0 && (
          <div className="flex justify-end">
            <Button variant="ghost" onClick={closeModal}>Cancel</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
