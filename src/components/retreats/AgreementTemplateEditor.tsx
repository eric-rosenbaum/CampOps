import { useState } from 'react';
import { Check, Info } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useCampStore } from '@/store/campStore';

/**
 * Every token the platform can fill, grouped the way a camp thinks about them.
 *
 * Kept here and in agreement_tokens() in Postgres. They have to agree: a token this list offers
 * that the function does not resolve renders as "{{whatever}}" in a contract, which is the one
 * outcome worth engineering against.
 */
const TOKENS: { group: string; items: { key: string; hint: string }[] }[] = [
  {
    group: 'The group',
    items: [
      { key: 'group_name', hint: 'Tufts' },
      { key: 'coordinator_name', hint: 'their contact' },
      { key: 'coordinator_email', hint: '' },
      { key: 'coordinator_phone', hint: '' },
      { key: 'headcount', hint: 'how many people' },
    ],
  },
  {
    group: 'The stay',
    items: [
      { key: 'arrival_date', hint: 'Wednesday, 21 October 2026' },
      { key: 'arrival_time', hint: '7:00pm' },
      { key: 'departure_date', hint: '' },
      { key: 'departure_time', hint: '11:00am' },
      { key: 'nights', hint: '3' },
    ],
  },
  {
    group: 'Money',
    items: [
      { key: 'rate', hint: '$120 per person per night' },
      { key: 'total', hint: '$18,000' },
      { key: 'deposit', hint: '$5,000' },
      { key: 'deposit_due', hint: '' },
      { key: 'balance_due', hint: '14 days before arrival' },
    ],
  },
  {
    group: 'Deadlines',
    items: [
      { key: 'cancellation_date', hint: '30 days before arrival' },
      { key: 'headcount_due', hint: '' },
      { key: 'coi_due', hint: '21 days before arrival' },
    ],
  },
  {
    group: 'You',
    items: [
      { key: 'camp_name', hint: '' },
      { key: 'camp_address', hint: '' },
      { key: 'today', hint: "the date it's sent" },
    ],
  },
];

/**
 * Where a camp writes the agreement it sends every group.
 *
 * One template, marked up once. Each booking gets this text with its own details filled in, and
 * somebody reviews those values before it goes -- so the camp is never in the position of having
 * sent a contract it has not read.
 */
export function AgreementTemplateEditor({ campId, editable }: { campId: string; editable: boolean }) {
  const current = useCampStore((s) => s.currentCamp);
  const save = useCampStore((s) => s.setAgreementTemplateBody);

  const [body, setBody] = useState(current?.agreementTemplateBody ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);

  /** Tokens the camp has typed that nothing will fill. A live check, not a surprise at send. */
  const known = new Set(TOKENS.flatMap((g) => g.items.map((i) => i.key)));
  const unknown = [...new Set(
    (body.match(/\{\{([a-z_]+)\}\}/g) ?? []).map((t) => t.slice(2, -2)),
  )].filter((t) => !known.has(t));

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      await save(campId, body.trim() || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
    } finally {
      setSaving(false);
    }
  }

  function insert(token: string) {
    setBody((b) => `${b}{{${token}}}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
          Your retreat agreement
        </p>
        <button
          onClick={() => setShowTokens((v) => !v)}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-forest hover:text-forest-mid"
        >
          <Info className="h-3.5 w-3.5" />
          {showTokens ? 'Hide' : 'What can be filled in automatically'}
        </button>
      </div>

      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
        Write it once. Anywhere a detail changes by group, put a marker like{' '}
        <code className="rounded bg-cream-dark px-1 py-px font-mono text-[11px]">{'{{group_name}}'}</code>{' '}
        and each booking gets its own filled in. You review every value before it sends.
      </p>

      {showTokens && (
        <div className="mt-2.5 rounded-card border border-border bg-cream px-3.5 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TOKENS.map((g) => (
              <div key={g.group}>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-faint">{g.group}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {g.items.map((i) => (
                    <button
                      key={i.key}
                      disabled={!editable}
                      onClick={() => insert(i.key)}
                      title={i.hint ? `e.g. ${i.hint}` : `Insert {{${i.key}}}`}
                      className="rounded-btn border border-border bg-white px-1.5 py-0.5 font-mono
                                 text-[11px] text-ink transition-colors hover:border-sage disabled:opacity-50"
                    >
                      {i.key}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-ink-faint">
            Click one to add it at the end, or type it anywhere yourself.
          </p>
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!editable}
        rows={16}
        placeholder="Paste your facility use agreement here, then mark the parts that change by group."
        className="mt-2 w-full resize-y rounded-btn border border-border bg-white px-3 py-2
                   font-mono text-[12.5px] leading-relaxed text-ink focus:border-sage focus:outline-none
                   disabled:opacity-60"
      />

      {unknown.length > 0 && (
        <p className="mt-1.5 text-[11.5px] text-amber-text">
          Nothing fills {unknown.map((t) => `{{${t}}}`).join(', ')} — it will appear in the
          agreement exactly like that. Remove it, or pick one from the list above.
        </p>
      )}

      {error && <p className="mt-1.5 text-[11.5px] text-red">{error}</p>}

      {editable && (
        <div className="mt-2 flex items-center gap-2.5">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save agreement'}
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-green-muted-text">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}
