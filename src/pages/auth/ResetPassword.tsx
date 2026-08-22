import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TreePine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type Phase = 'checking' | 'ready' | 'invalid' | 'done';

export function ResetPassword() {
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The email link carries a recovery token that supabase-js parses from the URL and turns
  // into a session (onAuthStateChange 'PASSWORD_RECOVERY'). If no session appears, the link
  // is invalid/expired.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setPhase('ready');
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setPhase('ready');
      else setTimeout(async () => {
        const { data: { session: s2 } } = await supabase.auth.getSession();
        setPhase((p) => (p === 'ready' ? p : s2 ? 'ready' : 'invalid'));
      }, 1500);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    try {
      const err = await updatePassword(password);
      if (err) { setError(err); return; }
      setPhase('done');
      setTimeout(() => navigate('/', { replace: true }), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your password. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-paper p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center"><TreePine className="w-4.5 h-4.5 text-cream" /></div>
          <span className="text-lg font-semibold text-forest">CampCommand</span>
        </div>

        <div className="bg-white rounded-xl border border-border shadow-sm p-8">
          {phase === 'checking' && <p className="text-[13px] text-ink-soft text-center py-4">Verifying your reset link…</p>}

          {phase === 'invalid' && (
            <div className="text-center">
              <h1 className="text-[18px] font-semibold text-forest mb-2">This reset link isn’t valid</h1>
              <p className="text-[13px] text-ink-soft leading-relaxed mb-5">It may have expired or already been used. Request a new one and try again.</p>
              <Link to="/forgot-password" className="text-[13px] font-medium text-forest hover:underline">Request a new link</Link>
            </div>
          )}

          {phase === 'done' && (
            <div className="text-center">
              <h1 className="text-[18px] font-semibold text-forest mb-2">Password updated</h1>
              <p className="text-[13px] text-ink-soft">Signing you in…</p>
            </div>
          )}

          {phase === 'ready' && (
            <>
              <h1 className="text-[18px] font-semibold text-forest mb-1.5">Set a new password</h1>
              <p className="text-[13px] text-ink-soft mb-5">Choose a new password for your account.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-ink mb-1.5">New password</label>
                  <input type="password" required autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40" />
                  <p className="text-[11px] text-ink-faint mt-1">Minimum 8 characters</p>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-ink mb-1.5">Confirm password</label>
                  <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40" />
                </div>
                {error && <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" disabled={saving} className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50 mt-2">
                  {saving ? 'Saving…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
