import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileSignature, Loader2, PencilLine, RotateCcw } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { supabase } from '@/lib/supabase';
import { campError } from '@/lib/campLog';

export interface TermLine {
  key: string;
  label: string;
  value: string | null;
  source: string;
  missing?: boolean;
}

interface Props {
  retreatId: string;
  groupName: string;
  onClose: () => void;
  onConfirmed?: () => void;
}

const inputClass =
  'w-full rounded-btn border border-border bg-white px-2.5 py-1.5 text-[13px] text-ink ' +
  'focus:border-sage focus:outline-none';

/**
 * Review the terms before they become part of an agreement.
 *
 * This screen exists because of one failure it has to make impossible: a director discovering,
 * after the fact, that the platform filled in an agreement and it went out. So nothing here is
 * implicit. Every value is shown with WHERE IT CAME FROM, every value can be typed over, a value
 * the platform does not have blocks confirmation instead of rendering blank, and confirming is a
 * deliberate act with a name attached to it.
 *
 * Confirming freezes the terms. They are never recomputed afterwards -- a rate edited in November
 * must not rewrite an agreement signed in June.
 */
export function TermsScheduleModal({ retreatId, groupName, onClose, onConfirmed }: Props) {
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<TermLine[]>([]);
  const [proposed, setProposed] = useState<Record<string, string | null>>({});
  const [fromProposal, setFromProposal] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error: err } = await supabase.rpc('propose_retreat_terms', { p_retreat_id: retreatId });
      if (!live) return;
      if (err) { campError('propose terms', err.message); setError(err.message); setLoading(false); return; }
      const d = data as { terms: TermLine[]; from_proposal: boolean };
      setLines(d.terms ?? []);
      setProposed(Object.fromEntries((d.terms ?? []).map((t) => [t.key, t.value])));
      setFromProposal(Boolean(d.from_proposal));
      setLoading(false);
    })();
    return () => { live = false; };
  }, [retreatId]);

  /** Which lines the camp typed over. Shown on the document, so a hand-set number looks hand-set. */
  const overridden = useMemo(
    () => lines.filter((l) => (l.value ?? '') !== (proposed[l.key] ?? '')).map((l) => l.key),
    [lines, proposed],
  );
  const blanks = lines.filter((l) => !(l.value ?? '').trim());

  function edit(key: string, value: string) {
    setLines((xs) => xs.map((l) => (l.key === key ? { ...l, value } : l)));
  }
  function reset(key: string) {
    setLines((xs) => xs.map((l) => (l.key === key ? { ...l, value: proposed[key] ?? '' } : l)));
  }

  async function confirm() {
    setSaving(true); setError(null);
    const { error: err } = await supabase.rpc('confirm_retreat_terms', {
      p_retreat_id: retreatId,
      p_terms: lines.map((l) => ({
        key: l.key, label: l.label, value: l.value,
        source: overridden.includes(l.key) ? 'typed by hand' : l.source,
      })),
      p_overridden: overridden,
      p_name: name,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onConfirmed?.();
    onClose();
  }

  return (
    <Modal title="Terms for the agreement" onClose={onClose} width="640px">
      {loading ? (
        <p className="inline-flex items-center gap-2 text-[13px] text-ink-soft">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading this booking…
        </p>
      ) : (
        <div className="space-y-4">
          {/* What this is, said plainly and first. */}
          <div className="rounded-card border border-amber-text/25 bg-amber-bg px-4 py-3">
            <div className="flex items-start gap-2.5">
              <FileSignature className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-text" />
              <div>
                <p className="text-[13px] font-semibold text-amber-text">
                  These values were filled in for you. Check every one.
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-amber-text/90">
                  They become a page in front of your own agreement, which {groupName} signs. Your
                  agreement itself is not changed or read — only this page is generated.
                  {fromProposal
                    ? ' The money comes from the proposal this group accepted.'
                    : ' There is no accepted proposal on file, so the money was worked out from the booking — check it especially.'}
                </p>
              </div>
            </div>
          </div>

          <ul className="divide-y divide-border rounded-card border border-border">
            {lines.map((l) => {
              const isOverridden = overridden.includes(l.key);
              const isBlank = !(l.value ?? '').trim();
              return (
                <li key={l.key} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="sm:w-48 sm:flex-shrink-0">
                      <p className="text-[12.5px] font-semibold text-forest">{l.label}</p>
                      <p className={`mt-0.5 text-[11px] leading-snug ${isBlank ? 'text-red' : 'text-ink-faint'}`}>
                        {isOverridden ? 'typed by hand' : l.source}
                      </p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <input
                          value={l.value ?? ''}
                          onChange={(e) => edit(l.key, e.target.value)}
                          placeholder={isBlank ? 'Nothing on file — type it' : ''}
                          className={`${inputClass} ${isBlank ? 'border-red/50' : ''} ${
                            isOverridden ? 'border-sage bg-green-muted-bg/40' : ''
                          }`}
                        />
                        {isOverridden && (
                          <button
                            onClick={() => reset(l.key)}
                            title="Put back what was filled in"
                            className="flex-shrink-0 p-1 text-ink-faint hover:text-forest"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {isOverridden && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-green-muted-text">
                          <PencilLine className="h-3 w-3" /> Yours, not ours. It will say so on the page.
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {blanks.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-card border border-red/30 bg-red-bg px-3.5 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red" />
              <p className="text-[12.5px] text-red">
                {blanks.length === 1 ? `"${blanks[0].label}" is` : `${blanks.length} values are`} still
                empty. An agreement cannot go out with a blank in it.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
              Your name, to confirm you have read these
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Who is confirming this"
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-ink-faint">
              Recorded against the agreement, with the date.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-card border border-red/30 bg-red-bg px-3.5 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red" />
              <p className="text-[12.5px] text-red">{error}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={confirm}
              disabled={saving || blanks.length > 0 || !name.trim()}
              className="flex-1 justify-center"
            >
              {saving ? 'Confirming…' : 'These are correct — confirm the terms'}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          </div>
          <p className="text-[11px] text-ink-faint">
            Nothing is sent by confirming. It fixes these numbers so they cannot change underneath a
            signature later.
          </p>
        </div>
      )}
    </Modal>
  );
}
