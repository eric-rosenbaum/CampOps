import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';
import { CampCommandMark } from '@/components/shared/CampCommandMark';

type Info = { email: string; campName: string; role: string };
type Phase = 'loading' | 'invalid' | 'ready' | 'joining' | 'confirm-email' | 'done';

function reasonText(reason: string): string {
  if (reason === 'used') return 'This invitation has already been used. If that wasn’t you, ask for a new one.';
  if (reason === 'expired') return 'This invitation has expired. Ask whoever invited you to send a new link.';
  return 'This invitation link isn’t valid.';
}
function roleLabel(role: string): string {
  return role === 'admin' ? 'an administrator' : role === 'viewer' ? 'a viewer' : 'a team member';
}

// Accept an invitation. The email is LOCKED to what the invite was sent to (read from the token):
// the invitee just sets a password and signs in. Works for the initial customer admin and for any
// team member a camp admin invites, same link, same flow.
export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [invalidMsg, setInvalidMsg] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mode, setMode] = useState<'create' | 'signin'>('create'); // 'signin' if the email already has an account
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptAndGo() {
    setPhase('joining');
    const { data, error: rpcErr } = await supabase.rpc('accept_invitation', { p_token: token });
    if (rpcErr) throw new Error(rpcErr.message);
    const r = (data ?? {}) as { error?: string; camp_id?: string };
    if (r.error) throw new Error(r.error);
    await useCampStore.getState().loadMyCamps();
    setPhase('done');
    setTimeout(() => navigate('/welcome', { replace: true }), 1200);
  }

  // Load the invite's details and lock the email. If already signed in AS the invited person,
  // accept straight away; otherwise show the set-password form.
  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error: e } = await supabase.rpc('invitation_info', { p_token: token });
      const d = (data ?? {}) as { valid?: boolean; reason?: string; email?: string; camp_name?: string; role?: string };
      if (e || !d.valid || !d.email) { setInvalidMsg(reasonText(d.reason ?? 'not_found')); setPhase('invalid'); return; }
      setInfo({ email: d.email, campName: d.camp_name ?? 'your camp', role: d.role ?? 'staff' });

      const session = (await supabase.auth.getSession()).data.session;
      if (session?.user?.email && session.user.email.toLowerCase() === d.email.toLowerCase()) {
        try { await acceptAndGo(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not join.'); setPhase('ready'); }
      } else {
        setPhase('ready');
      }
    })();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!info) return;
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (mode === 'create' && password !== confirm) { setError('Passwords don’t match.'); return; }
    setBusy(true);
    try {
      // If a different account is signed in on this device, drop it so we act as the invited user.
      const cur = (await supabase.auth.getSession()).data.session;
      if (cur?.user?.email && cur.user.email.toLowerCase() !== info.email.toLowerCase()) {
        await supabase.auth.signOut();
      }

      if (mode === 'create') {
        // The confirmation link comes back to this same invite URL, so clicking it in any
        // browser resumes the acceptance (the effect above accepts as soon as the session
        // belongs to the invited address).
        const redirect = `${window.location.origin}/invite/${token}`;
        const { error: err, needsEmailConfirmation } = await useAuthStore
          .getState()
          .signUp(info.email, password, fullName.trim() || info.email.split('@')[0], redirect);
        if (err) {
          if (/already|registered|exists/i.test(err)) {
            setMode('signin');
            setError('An account already exists for this email. Enter its password to sign in and join.');
            setBusy(false);
            return;
          }
          setError(err); setBusy(false); return;
        }
        if (needsEmailConfirmation) {
          setPhase('confirm-email');
          setBusy(false);
          return;
        }
      } else {
        const err = await useAuthStore.getState().signIn(info.email, password);
        if (err) { setError(err); setBusy(false); return; }
      }
      await acceptAndGo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setPhase('ready');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-paper p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <CampCommandMark size={36} decorative />
          <span className="text-lg font-semibold text-forest">CampCommand</span>
        </div>

        <div className="bg-white rounded-xl border border-border shadow-sm p-8">
          {(phase === 'loading' || phase === 'joining') && (
            <div className="text-center py-2">
              <div className="w-8 h-8 border-2 border-forest border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[14px] font-medium text-forest">{phase === 'joining' ? 'Joining…' : 'Loading your invitation…'}</p>
            </div>
          )}

          {phase === 'invalid' && (
            <div className="text-center">
              <h1 className="text-[18px] font-semibold text-forest mb-2">Invitation unavailable</h1>
              <p className="text-[13px] text-ink-soft leading-relaxed mb-5">{invalidMsg}</p>
              <Link to="/login" className="text-[13px] font-medium text-forest hover:underline">Go to sign in</Link>
            </div>
          )}

          {phase === 'done' && (
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"><span className="text-green-600 text-lg">✓</span></div>
              <p className="text-[15px] font-semibold text-forest mb-1">You’re in</p>
              <p className="text-[12px] text-ink-soft">Taking you to {info?.campName}…</p>
            </div>
          )}

          {phase === 'confirm-email' && info && (
            <div className="text-center">
              <div className="w-11 h-11 rounded-full bg-sage-pale flex items-center justify-center mx-auto mb-4">
                <Mail className="w-5 h-5 text-ink" />
              </div>
              <h1 className="text-[17px] font-semibold text-forest mb-2">Confirm your email</h1>
              <p className="text-[13px] text-ink-soft leading-relaxed">
                We’ve sent a link to <span className="font-medium text-forest">{info.email}</span>.
                Open it to finish joining {info.campName}.
              </p>
              <p className="text-[12px] text-ink-faint leading-relaxed mt-4">
                You can close this page. The link works on any device.
              </p>
            </div>
          )}

          {phase === 'ready' && info && (
            <>
              <h1 className="text-[18px] font-semibold text-forest mb-1.5">Join {info.campName}</h1>
              <p className="text-[13px] text-ink-soft mb-5">You’ve been invited as {roleLabel(info.role)}. {mode === 'create' ? 'Set a password to create your account.' : 'Sign in to join.'}</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-ink mb-1.5">Email</label>
                  <div className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-border bg-paper text-[13px] text-ink">
                    <Lock className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />
                    <span className="truncate">{info.email}</span>
                  </div>
                  <p className="text-[11px] text-ink-faint mt-1">This invite is locked to this address.</p>
                </div>
                {mode === 'create' && (
                  <div>
                    <label className="block text-[12px] font-medium text-ink mb-1.5">Your name</label>
                    <input type="text" autoFocus autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40" />
                  </div>
                )}
                <div>
                  <label className="block text-[12px] font-medium text-ink mb-1.5">{mode === 'create' ? 'Create a password' : 'Password'}</label>
                  <input type="password" required autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40" />
                  {mode === 'create' && <p className="text-[11px] text-ink-faint mt-1">Minimum 8 characters</p>}
                </div>
                {mode === 'create' && (
                  <div>
                    <label className="block text-[12px] font-medium text-ink mb-1.5">Confirm password</label>
                    <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40" />
                  </div>
                )}
                {error && <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" disabled={busy} className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50 mt-1">
                  {busy ? 'Setting up…' : mode === 'create' ? 'Create account & join' : 'Sign in & join'}
                </button>
                {mode === 'signin' && (
                  <p className="text-center text-[12px] text-ink-soft">
                    Forgot it? <Link to="/forgot-password" className="text-forest font-medium hover:underline">Reset your password</Link>
                  </p>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
