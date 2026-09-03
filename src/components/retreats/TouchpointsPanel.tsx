// What was actually said, and when.
//
// Append-only on purpose. A contact log people can rewrite is a log nobody trusts six months
// later, when the argument is about what the camp promised on the phone in March. Entries can be
// deleted (typos happen) but never edited into something they were not.
import { useMemo, useState } from 'react';
import { Phone, Mail, Users, MapPin, StickyNote, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatTouchpoint, TouchpointKind } from '@/lib/types';
import { dbAddTouchpoint, dbDeleteTouchpoint } from '@/lib/retreatsDb';
import { generateId } from '@/lib/utils';
import { inputClass, labelClass } from './retreatUi';

const KIND_LABELS: Record<TouchpointKind, string> = {
  call: 'Call', email: 'Email', meeting: 'Meeting', site_visit: 'Site visit', note: 'Note',
};
const KIND_ICONS: Record<TouchpointKind, React.ReactNode> = {
  call: <Phone className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
  meeting: <Users className="w-3.5 h-3.5" />,
  site_visit: <MapPin className="w-3.5 h-3.5" />,
  note: <StickyNote className="w-3.5 h-3.5" />,
};
const KINDS = Object.keys(KIND_LABELS) as TouchpointKind[];

/** A touchpoint is an instant, not a calendar day, so this formats the timestamp as one. */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** `datetime-local` wants local wall-clock with no zone, which is what a person is typing. */
function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TouchpointsPanel({ retreatId }: { retreatId: string }) {
  const { touchpoints, setTouchpoints } = useRetreatStore();
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<TouchpointKind>('call');
  const [when, setWhen] = useState(() => localInputValue(new Date()));
  const [summary, setSummary] = useState('');

  // Derived from the raw slice with useMemo. Never a selector: a filter inside a zustand v5
  // selector allocates a new array each render and loops forever.
  const list = useMemo(
    () => touchpoints
      .filter((t) => t.retreatId === retreatId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [touchpoints, retreatId],
  );

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) return;
    const parsed = when ? new Date(when) : new Date();
    const row: RetreatTouchpoint = {
      id: generateId(), campId: '', retreatId,
      kind,
      occurredAt: (Number.isNaN(parsed.getTime()) ? new Date() : parsed).toISOString(),
      summary: summary.trim(),
      byUserId: currentUser.id || null,
      byName: currentUser.name || null,
      createdAt: new Date().toISOString(),
    };
    setTouchpoints([row, ...touchpoints]);
    void dbAddTouchpoint(row);
    setSummary('');
    setWhen(localInputValue(new Date()));
    setAdding(false);
  }

  function remove(t: RetreatTouchpoint) {
    if (!window.confirm('Delete this log entry? The log is meant to be append-only.')) return;
    setTouchpoints(touchpoints.filter((x) => x.id !== t.id));
    void dbDeleteTouchpoint(t.id);
  }

  return (
    <div className="bg-white border border-border rounded-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-[13px] font-semibold text-forest">Contact log</h3>
          <p className="text-[11.5px] text-ink-soft">Every call, email and visit, newest first.</p>
        </div>
        {canManage && !adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Log
          </Button>
        )}
      </div>

      {adding && (
        <form onSubmit={add} className="px-4 py-4 bg-cream-dark/40 border-b border-border space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k} type="button" onClick={() => setKind(k)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[12px] border transition-colors ${
                  kind === k ? 'bg-forest text-white border-forest' : 'bg-white border-border text-ink hover:border-sage'
                }`}
              >
                {KIND_ICONS[k]}{KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <div>
            <label className={labelClass}>What was said</label>
            <textarea
              value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} autoFocus
              className={`${inputClass} resize-y`}
              placeholder="e.g. Rabbi Stein confirmed 48 and asked whether we can hold the lodge on Saturday afternoon."
            />
          </div>
          <div className="sm:max-w-[260px]">
            <label className={labelClass}>When</label>
            <input
              type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" type="submit" disabled={!summary.trim()}>Add to the log</Button>
          </div>
        </form>
      )}

      {list.length === 0 && !adding ? (
        <p className="px-4 py-6 text-[12.5px] text-ink-faint text-center">
          Nothing logged yet. The first call is worth writing down.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((t) => (
            <li key={t.id} className="px-4 py-3 flex gap-3">
              <span className="w-7 h-7 rounded-full bg-sage-pale text-forest flex items-center justify-center flex-shrink-0 mt-0.5">
                {KIND_ICONS[t.kind]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-ink-soft">
                  <span className="font-semibold text-forest">{KIND_LABELS[t.kind]}</span>
                  <span>{fmtWhen(t.occurredAt)}</span>
                  {t.byName && <span className="text-ink-faint">· {t.byName}</span>}
                </p>
                <p className="text-[13px] text-ink leading-snug mt-0.5 whitespace-pre-wrap">{t.summary}</p>
              </div>
              {canManage && (
                <button
                  type="button" title="Delete entry" onClick={() => remove(t)}
                  className="p-1.5 text-ink-faint hover:text-red transition-colors flex-shrink-0 self-start"
                ><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
