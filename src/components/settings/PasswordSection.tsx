import { useState, useEffect } from 'react';
import { KeyRound, Check } from 'lucide-react';
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
    if (next.length < MIN_LENGTH) { setError(`Password must be at least ${MIN_LENGTH} characters.`); return; }
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    if (hasPassword && next === current) { setError('That’s already your password. Choose a different one.'); return; }

    setSaving(true);
    const err = hasPassword ? await changePassword(current, next) : await updatePassword(next);
    setSaving(false);
    if (err) { setError(err); return; }

    setCurrent(''); setNext(''); setConfirm('');
    setHasPassword(true);
    setDone(true);
  }

  const heading = hasPassword === false ? 'Set a password' : 'Password';
  const blurb = hasPassword === false
    ? 'You sign in with an emailed code. Set a password to sign in with one instead — the emailed code keeps working either way.'
    : 'Change the password you use to sign in.';

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
        <LoadingBlock size="sm" label="Loading" className="py-6" />
      ) : done ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-btn border border-border bg-cream/40">
          <Check className="w-4 h-4 text-green-muted-text flex-shrink-0" />
          <span className="text-[13px] font-medium text-forest flex-1">Your password has been updated.</span>
          <button
            onClick={() => setDone(false)}
            className="text-[12.5px] font-medium text-forest hover:underline"
          >
            Change it again
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
          {hasPassword && (
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1.5">Current password</label>
              <input
                type="password" required autoComplete="current-password" value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="w-full px-3 py-2 text-[13px] rounded-btn border border-border focus:outline-none focus:border-sage"
              />
            </div>
          )}
          <div>
            <label className="block text-[12px] font-medium text-ink mb-1.5">New password</label>
            <input
              type="password" required autoComplete="new-password" value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full px-3 py-2 text-[13px] rounded-btn border border-border focus:outline-none focus:border-sage"
            />
            <p className="text-[11.5px] text-ink-faint mt-1">At least {MIN_LENGTH} characters.</p>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-ink mb-1.5">Confirm new password</label>
            <input
              type="password" required autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 text-[13px] rounded-btn border border-border focus:outline-none focus:border-sage"
            />
          </div>

          {error && <p className="text-[12.5px] text-red-text">{error}</p>}

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : hasPassword ? 'Update password' : 'Set password'}
          </Button>
        </form>
      )}
    </section>
  );
}
