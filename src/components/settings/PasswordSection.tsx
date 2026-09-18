import { useState, useEffect } from 'react';
import { KeyRound, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authErrorMessage } from '@/pages/auth/authErrors';
import { Button } from '@/components/shared/Button';
import { useAuthStore } from '@/store/authStore';
import { LoadingBlock } from '@/components/shared/ModuleLoading';

const MIN_LENGTH = 8;

/**
 * Change (or first-time set) your own password. Everyone manages their own and only their
 * own — there is deliberately no path for an admin to change someone else's.
 *
 * Two shapes, because not every account has a password to confirm: a normal signup does, but
 * an OTP/magic-link signup has never had one. `has_usable_password()` tells us which, and the
 * "set" variant drops the current-password field rather than asking for something that
 * doesn't exist.
 */
export function PasswordSection() {
  const { t } = useTranslation('account');
  const { t: ta } = useTranslation('auth');
  const hasUsablePassword = useAuthStore((s) => s.hasUsablePassword);
  const changePassword = useAuthStore((s) => s.changePassword);
  const updatePassword = useAuthStore((s) => s.updatePassword);

  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    hasUsablePassword().then((v) => { if (alive) setHasPassword(v); });
    return () => { alive = false; };
  }, [hasUsablePassword]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) { setError(t('password.tooShort', { min: MIN_LENGTH })); return; }
    if (next !== confirm) { setError(t('password.mismatch')); return; }
    if (hasPassword && next === current) { setError(t('password.same')); return; }

    setSaving(true);
    const err = hasPassword ? await changePassword(current, next) : await updatePassword(next);
    setSaving(false);
    if (err) { setError(authErrorMessage(ta, err)); return; }

    setCurrent(''); setNext(''); setConfirm('');
    setHasPassword(true);
    setDone(true);
  }

  const heading = hasPassword === false ? t('password.setTitle') : t('password.title');
  const blurb = hasPassword === false ? t('password.setBlurb') : t('password.changeBlurb');

  return (
    <section className="bg-white rounded-card border border-border p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-sage-pale flex items-center justify-center flex-shrink-0">
          <KeyRound className="w-4.5 h-4.5 text-forest" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-forest">{heading}</h2>
          <p className="text-[13px] text-ink-soft mt-0.5">{blurb}</p>
        </div>
      </div>

      {hasPassword === null ? (
        <LoadingBlock size="sm" label={t('loading')} className="py-6" />
      ) : done ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-btn border border-border bg-cream/40">
          <Check className="w-4 h-4 text-green-muted-text flex-shrink-0" />
          <span className="text-[13px] font-medium text-forest flex-1">{t('password.updated')}</span>
          <button
            onClick={() => setDone(false)}
            className="text-[12.5px] font-medium text-forest hover:underline"
          >
            {t('password.changeAgain')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
          {hasPassword && (
            <div>
              <label htmlFor="pw-current" className="block text-[12px] font-medium text-ink mb-1.5">{t('password.current')}</label>
              <input
                id="pw-current" dir="ltr"
                type="password" required autoComplete="current-password" value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="w-full px-3 py-2 text-[13px] rounded-btn border border-border focus:outline-none focus:border-sage"
              />
            </div>
          )}
          <div>
            <label htmlFor="pw-new" className="block text-[12px] font-medium text-ink mb-1.5">{t('password.new')}</label>
            <input
              id="pw-new" dir="ltr"
              type="password" required autoComplete="new-password" value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full px-3 py-2 text-[13px] rounded-btn border border-border focus:outline-none focus:border-sage"
            />
            <p className="text-[11.5px] text-ink-faint mt-1">{t('password.minLength', { min: MIN_LENGTH })}</p>
          </div>
          <div>
            <label htmlFor="pw-confirm" className="block text-[12px] font-medium text-ink mb-1.5">{t('password.confirm')}</label>
            <input
              id="pw-confirm" dir="ltr"
              type="password" required autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 text-[13px] rounded-btn border border-border focus:outline-none focus:border-sage"
            />
          </div>

          {error && <p className="text-[12.5px] text-red-text">{error}</p>}

          <Button type="submit" disabled={saving}>
            {saving ? t('saving') : hasPassword ? t('password.update') : t('password.set')}
          </Button>
        </form>
      )}
    </section>
  );
}
