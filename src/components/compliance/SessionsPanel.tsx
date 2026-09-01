import { Fragment, useMemo, useState } from 'react';
import { Plus, Trash2, Users, Wand2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import { daysBetween } from '@/lib/commissaryUnits';
import type { SessionCapacityInput } from '@/lib/complianceDb';
import type { SessionCapacity } from '@/lib/types';

/**
 * DOH-367's camper capacity table.
 *
 * It is the largest block of blank cells in the whole permit packet: ten session rows, each
 * split six ways by age and twice again by sex. A camp that does not fill it here fills it by
 * hand on a printed form, which is where the transcription errors come from.
 *
 * The grid deliberately looks like the form. A director checking our numbers against their
 * registration system is reading two tables side by side, and matching column order is what
 * makes that possible. Tab moves along a row, the way the row is filled in.
 *
 * The counts are last season's actual attendance, which is what the form asks for. They are not
 * taken from the kitchen's session list: `camper_count` there is this season's forecast, kept
 * current by whoever orders the food, and wiring the two together would let a portion-size edit
 * quietly amend a filed permit. Names and day counts can be copied across; numbers never are.
 */

/** The six age bands, in the order the form prints them, each with its two count fields. */
const BANDS = [
  { label: '1 to 5', male: 'age1To5Male', female: 'age1To5Female' },
  { label: '6 & 7', male: 'age6And7Male', female: 'age6And7Female' },
  { label: '8 to 12', male: 'age8To12Male', female: 'age8To12Female' },
  { label: '13 to 15', male: 'age13To15Male', female: 'age13To15Female' },
  { label: '16 & 17', male: 'age16And17Male', female: 'age16And17Female' },
  { label: 'CITs', male: 'citsMale', female: 'citsFemale' },
] as const;

type CountKey = (typeof BANDS)[number]['male'] | (typeof BANDS)[number]['female'];

const COUNT_KEYS: CountKey[] = BANDS.flatMap((b) => [b.male, b.female]);

/** The form has ten printed rows. Not a page-size choice; there is no eleventh line. */
const MAX_SESSIONS = 10;

/**
 * A row as it is being typed.
 *
 * Counts are held as strings so an empty cell stays empty. Zero campers in a band is a
 * statement a camp might mean to make, and a blank is not, so nothing here turns one into the
 * other while a person is still typing.
 */
interface Draft {
  sessionIndex: number;
  sessionName: string;
  campType: 'day' | 'overnight' | '';
  days: string;
  counts: Record<CountKey, string>;
  sourceSessionId: string | null;
}

function num(text: string): number {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * A session cannot run longer than a year, and the column says so with a check constraint.
 *
 * Clamped here rather than left to the database, because a rejected write surfaces as a generic
 * "a change didn't save" and the camp is left guessing which of thirteen cells it disliked. The
 * cap belongs where the typing happens.
 */
const MAX_SESSION_DAYS = 366;

function clampDays(text: string): string {
  const digits = text.replace(/[^0-9]/g, '').slice(0, 3);
  if (digits === '') return '';
  return String(Math.min(Number.parseInt(digits, 10), MAX_SESSION_DAYS));
}

function toDraft(row: SessionCapacity): Draft {
  const counts = {} as Record<CountKey, string>;
  for (const key of COUNT_KEYS) counts[key] = row[key] > 0 ? String(row[key]) : '';
  return {
    sessionIndex: row.sessionIndex,
    sessionName: row.sessionName ?? '',
    campType: row.campType ?? '',
    days: row.numberOfDays == null ? '' : String(row.numberOfDays),
    counts,
    sourceSessionId: row.sourceSessionId,
  };
}

function emptyDraft(sessionIndex: number): Draft {
  const counts = {} as Record<CountKey, string>;
  for (const key of COUNT_KEYS) counts[key] = '';
  return { sessionIndex, sessionName: '', campType: '', days: '', counts, sourceSessionId: null };
}

function toInput(d: Draft): SessionCapacityInput {
  const counts = {} as Record<CountKey, number>;
  for (const key of COUNT_KEYS) counts[key] = num(d.counts[key]);
  return {
    sessionIndex: d.sessionIndex,
    sessionName: d.sessionName.trim() || null,
    campType: d.campType === '' ? null : d.campType,
    numberOfDays: d.days.trim() === '' ? null : num(d.days),
    sourceSessionId: d.sourceSessionId,
    ...counts,
  };
}

function rowTotal(d: Draft): number {
  return COUNT_KEYS.reduce((sum, key) => sum + num(d.counts[key]), 0);
}

export function SessionsPanel() {
  const stored = useComplianceStore((s) => s.sessionCapacity);
  const saveSessionCapacity = useComplianceStore((s) => s.saveSessionCapacity);
  const removeSessionCapacity = useComplianceStore((s) => s.removeSessionCapacity);
  const kitchenSessions = useCommissaryStore((s) => s.sessions);
  const { currentUser, can } = useAuth();
  const canEdit = can('manageSafetyItems');

  /**
   * The rows being typed.
   *
   * Null until someone edits, and the grid simply shows what the store holds — which is what
   * lets the rows appear when the module finishes loading, without an effect that could re-seed
   * the grid under a person's hands. From the first keystroke the local copy is the truth, so
   * nothing typed is ever replaced by a reload. A lost number here is a wrong number on a filed
   * form rather than an inconvenience.
   */
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const rows = useMemo(() => drafts ?? stored.map(toDraft), [drafts, stored]);
  const [busy, setBusy] = useState(false);

  function edit(sessionIndex: number, patch: (d: Draft) => Draft) {
    setDrafts((prev) => (prev ?? stored.map(toDraft))
      .map((d) => (d.sessionIndex === sessionIndex ? patch(d) : d)));
  }

  /** What is already stored for this row, so a blur with nothing changed writes nothing. */
  function isUnchanged(input: SessionCapacityInput): boolean {
    const current = stored.find((r) => r.sessionIndex === input.sessionIndex);
    return current != null && JSON.stringify(toInput(toDraft(current))) === JSON.stringify(input);
  }

  async function save(row: Draft) {
    const input = toInput(row);
    if (isUnchanged(input)) return;
    await saveSessionCapacity(input, currentUser.name || null);
  }

  async function persist(sessionIndex: number) {
    const row = rows.find((d) => d.sessionIndex === sessionIndex);
    if (!row || !canEdit) return;
    await save(row);
  }

  async function addSession() {
    if (rows.length >= MAX_SESSIONS || !canEdit) return;
    const draft = emptyDraft(rows.length + 1);
    setDrafts([...rows, draft]);
    // Written straight away so the row exists on both sides and removing it is one path rather
    // than two. An all-blank row prints nothing on the form.
    await save(draft);
  }

  async function removeSession(sessionIndex: number) {
    if (!canEdit) return;
    setBusy(true);
    // The rows below move up a line, in the database and here: the index is which line of the
    // form this is, so a gap would print session 3 on the fourth line.
    setDrafts((prev) => (prev == null ? null : prev
      .filter((d) => d.sessionIndex !== sessionIndex)
      .map((d, i) => ({ ...d, sessionIndex: i + 1 }))));
    await removeSessionCapacity(sessionIndex, currentUser.name || null);
    setBusy(false);
  }

  /**
   * The kitchen's session list, in date order, as far as the form can print it.
   *
   * Only names and lengths are offered. The camper counts beside them are a forecast for
   * ordering food, and this form asks what actually happened last season.
   */
  const prefill = useMemo(() => kitchenSessions
    .slice()
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, MAX_SESSIONS)
    .map((s) => ({
      id: s.id,
      name: s.name,
      days: s.startDate && s.endDate ? Math.max(1, daysBetween(s.startDate, s.endDate) + 1) : null,
    })), [kitchenSessions]);

  // Offered only while it would actually do something: once every row it could fill is filled,
  // the button is a promise to change nothing.
  const canPrefill = canEdit && prefill.some((_, i) => {
    const row = rows[i];
    return !row || !row.sessionName.trim() || !row.days.trim();
  });

  async function runPrefill() {
    if (!canEdit) return;
    setBusy(true);
    const next = [...rows];
    for (let i = 0; i < prefill.length; i++) {
      const source = prefill[i];
      const row = next[i] ?? emptyDraft(i + 1);
      // Only blanks are filled. A name or a length someone typed is theirs, and a button
      // labelled "start from" must not overwrite work.
      next[i] = {
        ...row,
        sessionName: row.sessionName.trim() ? row.sessionName : source.name,
        days: row.days.trim() ? row.days : (source.days == null ? '' : String(source.days)),
        sourceSessionId: row.sourceSessionId ?? source.id,
      };
    }
    setDrafts(next);
    for (const row of next) await save(row);
    setBusy(false);
  }

  const columnTotals = COUNT_KEYS.map((key) => rows.reduce((sum, d) => sum + num(d.counts[key]), 0));
  const grandTotal = rows.reduce((sum, d) => sum + rowTotal(d), 0);

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark">
        <div className="flex items-start gap-2">
          <Users className="w-3.5 h-3.5 text-ink-faint mt-1 flex-shrink-0" />
          <div className="min-w-0">
            <h4 className="text-[13px] font-semibold text-forest">
              Campers by session{' '}
              <span className="font-mono text-[11px] text-ink-faint">{rows.length}/{MAX_SESSIONS}</span>
            </h4>
            <p className="text-[11.5px] text-ink-soft leading-relaxed mt-0.5">
              DOH-367 asks for every session you ran, how long it was, and how many campers were
              in it by age and sex. Fill it once here and it prints on the form. Use last
              season's actual attendance; if you did not operate last season, use your best
              estimates and say so on the form.
            </p>
          </div>
        </div>

        {prefill.length > 0 && canPrefill && (
          <div className="mt-3 rounded-card bg-cream/70 px-3.5 py-3">
            <p className="text-[11.5px] text-ink-soft leading-relaxed">
              Your kitchen already has {prefill.length} session{prefill.length === 1 ? '' : 's'}
              {' '}on file. We can copy the names and work out the length of each one as a
              starting point. Camper numbers are not copied: those are this season's forecast for
              ordering food, and this table is last season's attendance.
            </p>
            <Button size="sm" variant="ghost" className="mt-2" disabled={busy} onClick={runPrefill}>
              <Wand2 className="w-3.5 h-3.5" /> Start from my session list
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] text-ink-soft">No sessions yet.</p>
          {canEdit && (
            <Button size="sm" variant="ghost" className="mt-3" disabled={busy} onClick={addSession}>
              <Plus className="w-3.5 h-3.5" /> Add a session
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-[12px] border-collapse">
            <thead>
              <tr className="bg-cream/60">
                <th rowSpan={2} className="px-2 py-1.5 text-left font-semibold text-ink-soft border-b border-cream-dark">#</th>
                <th rowSpan={2} className="px-2 py-1.5 text-left font-semibold text-ink-soft border-b border-cream-dark">Session</th>
                <th rowSpan={2} className="px-2 py-1.5 text-left font-semibold text-ink-soft border-b border-cream-dark">Type</th>
                <th rowSpan={2} className="px-2 py-1.5 text-center font-semibold text-ink-soft border-b border-cream-dark">Days</th>
                {BANDS.map((b) => (
                  <th key={b.label} colSpan={2}
                      className="px-2 py-1 text-center font-semibold text-forest border-b border-l border-cream-dark whitespace-nowrap">
                    {b.label}
                  </th>
                ))}
                <th rowSpan={2} className="px-2 py-1.5 text-center font-semibold text-ink-soft border-b border-l border-cream-dark">Total</th>
                <th rowSpan={2} className="px-2 py-1.5 border-b border-cream-dark" />
              </tr>
              <tr className="bg-cream/60">
                {BANDS.map((b) => (
                  <Fragment key={b.label}>
                    <th className="px-1 pb-1.5 text-center text-[10.5px] font-semibold text-ink-faint border-b border-l border-cream-dark">M</th>
                    <th className="px-1 pb-1.5 text-center text-[10.5px] font-semibold text-ink-faint border-b border-cream-dark">F</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sessionIndex} className="border-b border-cream-dark last:border-0">
                  <td className="px-2 py-1.5 font-mono text-[11px] text-ink-faint text-center">{row.sessionIndex}</td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.sessionName}
                      disabled={!canEdit}
                      onChange={(e) => edit(row.sessionIndex, (d) => ({ ...d, sessionName: e.target.value }))}
                      onBlur={() => void persist(row.sessionIndex)}
                      placeholder="Session name"
                      className="w-36 text-[12px] bg-white border border-border rounded-btn px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={row.campType}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const campType = e.target.value as Draft['campType'];
                        edit(row.sessionIndex, (d) => ({ ...d, campType }));
                        // Persisted from the value in hand: a select has no typing to lose, and
                        // waiting for a blur would drop the change if the tab moves on.
                        void save({ ...row, campType });
                      }}
                      className="text-[12px] bg-white border border-border rounded-btn px-2 py-1 text-ink-soft"
                    >
                      <option value="">Not set</option>
                      <option value="day">Day</option>
                      <option value="overnight">Overnight</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <NumberCell
                      value={row.days}
                      disabled={!canEdit}
                      onChange={(days) => edit(row.sessionIndex, (d) => ({ ...d, days: clampDays(days) }))}
                      onBlur={() => void persist(row.sessionIndex)}
                    />
                  </td>
                  {BANDS.map((b) => (
                    <Fragment key={b.label}>
                      <td className="px-1 py-1.5 text-center border-l border-cream-dark">
                        <NumberCell
                          value={row.counts[b.male]}
                          disabled={!canEdit}
                          onChange={(v) => edit(row.sessionIndex, (d) => ({ ...d, counts: { ...d.counts, [b.male]: v } }))}
                          onBlur={() => void persist(row.sessionIndex)}
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <NumberCell
                          value={row.counts[b.female]}
                          disabled={!canEdit}
                          onChange={(v) => edit(row.sessionIndex, (d) => ({ ...d, counts: { ...d.counts, [b.female]: v } }))}
                          onBlur={() => void persist(row.sessionIndex)}
                        />
                      </td>
                    </Fragment>
                  ))}
                  <td className="px-2 py-1.5 text-center font-mono text-[12px] text-forest border-l border-cream-dark">
                    {rowTotal(row) || ''}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {canEdit && (
                      <button
                        onClick={() => void removeSession(row.sessionIndex)}
                        disabled={busy}
                        aria-label={`Remove session ${row.sessionIndex}`}
                        className="text-ink-faint hover:text-red-text transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-cream/60">
                <td className="px-2 py-1.5 text-[11px] font-semibold text-ink-soft" colSpan={4}>
                  Totals
                </td>
                {columnTotals.map((total, i) => (
                  <td key={COUNT_KEYS[i]}
                      className={`px-1 py-1.5 text-center font-mono text-[11.5px] text-ink-soft ${i % 2 === 0 ? 'border-l border-cream-dark' : ''}`}>
                    {total || ''}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center font-mono text-[12px] font-bold text-forest border-l border-cream-dark">
                  {grandTotal || ''}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="px-5 py-3 border-t border-cream-dark flex items-start gap-3 flex-wrap">
          {canEdit && rows.length < MAX_SESSIONS && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={addSession}>
              <Plus className="w-3.5 h-3.5" /> Add a session
            </Button>
          )}
          <p className="text-[11px] text-ink-faint leading-relaxed">
            {rows.length >= MAX_SESSIONS
              ? 'DOH-367 prints ten session rows and there is no eleventh line, so ten is as many as this form can carry. If you ran more, combine the shortest ones into one row or attach a separate sheet listing them.'
              : 'Totals are here for you to check against your own records. The form has no total row, so nothing in the totals line is printed. A band left blank prints blank.'}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One numeric cell.
 *
 * Text rather than a number input: a spinner in a grid this dense is a mis-click waiting to
 * happen, and a number input reports an empty string for "1e" as well as for blank, which would
 * make a typo look like a cleared cell. Only digits are accepted, so nothing else can be typed.
 */
function NumberCell({ value, onChange, onBlur, disabled }: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled: boolean;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      inputMode="numeric"
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
      onBlur={onBlur}
      className="w-10 text-[12px] font-mono text-center bg-white border border-border rounded-btn px-1 py-1"
    />
  );
}
