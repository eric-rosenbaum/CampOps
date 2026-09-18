import { useState } from 'react';
import { Trans } from 'react-i18next';
import { useScreenTranslation } from '@/components/i18n/untranslated';
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
// `group` and `hint` are read through t() at render. The token keys themselves are what the
// camp writes into its stored agreement, so they are never translated.
const TOKENS: { group: TokenGroup; items: { key: string; hint: boolean }[] }[] = [
  {
    group: 'group',
    items: [
      { key: 'group_name', hint: true },
      { key: 'coordinator_name', hint: true },
      { key: 'coordinator_email', hint: false },
      { key: 'coordinator_phone', hint: false },
      { key: 'headcount', hint: true },
    ],
  },
  {
    group: 'stay',
    items: [
      { key: 'arrival_date', hint: true },
      { key: 'arrival_time', hint: true },
      { key: 'departure_date', hint: false },
      { key: 'departure_time', hint: true },
      { key: 'nights', hint: true },
    ],
  },
  {
    group: 'money',
    items: [
      { key: 'rate', hint: true },
      { key: 'total', hint: true },
      { key: 'deposit', hint: true },
      { key: 'deposit_due', hint: false },
      { key: 'balance_due', hint: true },
    ],
  },
  {
    group: 'deadlines',
    items: [
      { key: 'cancellation_date', hint: true },
      { key: 'headcount_due', hint: false },
      { key: 'coi_due', hint: true },
    ],
  },
  {
    group: 'you',
    items: [
      { key: 'camp_name', hint: false },
      { key: 'camp_address', hint: false },
      { key: 'today', hint: true },
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
type TokenGroup = 'group' | 'stay' | 'money' | 'deadlines' | 'you';
/** The tokens whose `hint` is true, i.e. that have an example under agreement.hints. */
type HintKey =
  | 'group_name' | 'coordinator_name' | 'headcount' | 'arrival_date' | 'arrival_time' | 'departure_time'
  | 'nights' | 'rate' | 'total' | 'deposit' | 'balance_due' | 'cancellation_date' | 'coi_due' | 'today';

export function AgreementTemplateEditor({ campId, editable }: { campId: string; editable: boolean }) {
  // Screen-aware: this editor is also reachable from Retreats, which is not translated yet.
  const { t } = useScreenTranslation('campInfo');
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
    (body.match(/\{\{([a-z_]+)\}\}/g) ?? []).map((m) => m.slice(2, -2)),
  )].filter((k) => !known.has(k));

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      await save(campId, body.trim() || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('agreement.saveFailed'));
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
          {t('agreement.title')}
        </p>
        <button
          onClick={() => setShowTokens((v) => !v)}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-forest hover:text-forest-mid"
        >
          <Info className="h-3.5 w-3.5" />
          {showTokens ? t('agreement.hide') : t('agreement.showTokens')}
        </button>
      </div>

      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
        <Trans
          t={t} i18nKey="agreement.intro" values={{ marker: '{{group_name}}' }}
          components={{ code: <code dir="ltr" className="rounded bg-cream-dark px-1 py-px font-mono text-[11px]" /> }}
        />
      </p>

      {showTokens && (
        <div className="mt-2.5 rounded-card border border-border bg-cream px-3.5 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TOKENS.map((g) => (
              <div key={g.group}>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-faint">{t(`agreement.groups.${g.group}`)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {g.items.map((i) => (
                    <button
                      key={i.key}
                      disabled={!editable}
                      onClick={() => insert(i.key)}
                      title={i.hint
                        ? t('agreement.example', { hint: t(`agreement.hints.${i.key as HintKey}`) })
                        : t('agreement.insert', { token: `{{${i.key}}}` })}
                      dir="ltr"
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
            {t('agreement.clickHint')}
          </p>
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!editable}
        rows={16}
        placeholder={t('agreement.placeholder')}
        className="mt-2 w-full resize-y rounded-btn border border-border bg-white px-3 py-2
                   font-mono text-[12.5px] leading-relaxed text-ink focus:border-sage focus:outline-none
                   disabled:opacity-60"
      />

      {unknown.length > 0 && (
        <p className="mt-1.5 text-[11.5px] text-amber-text">
          {t('agreement.unknown', { tokens: unknown.map((k) => `{{${k}}}`).join(', ') })}
        </p>
      )}

      {error && <p className="mt-1.5 text-[11.5px] text-red">{error}</p>}

      {editable && (
        <div className="mt-2 flex items-center gap-2.5">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? t('savingEllipsis') : t('agreement.save')}
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-green-muted-text">
              <Check className="h-3.5 w-3.5" /> {t('saved')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
