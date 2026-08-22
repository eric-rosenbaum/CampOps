import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TreePine, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export function Signup() {
  const signUp = useAuthStore((s) => s.signUp);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Account creation is invite-only: allowed only when arriving from an invitation
  // (/invite/:token → /signup?invite=…), never as a public self-serve signup.
  const inviteToken = params.get('invite') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pendingInviteToken') : null);
  useEffect(() => {
    const q = params.get('invite');
    if (q) sessionStorage.setItem('pendingInviteToken', q);
  }, [params]);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    // This page is only reachable with an invite token (gated below), so send the confirmation
    // link back to that invitation — it survives the user opening their mail on another device.
    const confirmRedirect = inviteToken
      ? `${window.location.origin}/invite/${inviteToken}`
      : undefined;
    const { error: err, needsEmailConfirmation } = await signUp(email, password, fullName, confirmRedirect);
    setLoading(false);
    if (err) { setError(err); return; }
    if (needsEmailConfirmation) { setAwaitingConfirmation(true); return; }

    // Pending invite token takes top priority
    const pendingToken = sessionStorage.getItem('pendingInviteToken');
    if (pendingToken) {
      sessionStorage.removeItem('pendingInviteToken');
      navigate(`/invite/${pendingToken}`, { replace: true });
      return;
    }

    // Redirect to the page they were trying to reach (e.g. /join?code=XXX)
    const redirect = sessionStorage.getItem('redirectAfterLogin');
    if (redirect) {
      sessionStorage.removeItem('redirectAfterLogin');
      navigate(redirect, { replace: true });
      return;
    }

    // No invite context shouldn't reach here (gated below), but never drop into self-serve setup.
    navigate('/no-access', { replace: true });
  }

  // Account created, pending the confirmation click.
  if (awaitingConfirmation) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-paper p-4 sm:p-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center"><TreePine className="w-4.5 h-4.5 text-cream" /></div>
            <span className="text-lg font-semibold text-forest">CampCommand</span>
          </div>
          <div className="bg-white rounded-xl border border-border shadow-sm p-8">
            <h1 className="text-[18px] font-semibold text-forest mb-2">Confirm your email</h1>
            <p className="text-[13px] text-ink-soft leading-relaxed">
              We’ve sent a link to <span className="font-medium text-forest">{email}</span>.
              Open it to finish setting up your account.
            </p>
            <p className="text-[12px] text-ink-faint leading-relaxed mt-4">
              You can close this page. The link works on any device.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Invite-only gate: without an invitation, there's nothing to sign up for.
  if (!inviteToken) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-paper p-4 sm:p-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center"><TreePine className="w-4.5 h-4.5 text-cream" /></div>
            <span className="text-lg font-semibold text-forest">CampCommand</span>
          </div>
          <div className="bg-white rounded-xl border border-border shadow-sm p-8">
            <h1 className="text-[18px] font-semibold text-forest mb-2">Accounts are by invitation</h1>
            <p className="text-[13px] text-ink-soft leading-relaxed mb-5">
              CampCommand is set up for your camp by our team. Book a demo to get started, and we’ll create your account.
            </p>
            <a href="https://www.campcommand.app" className="inline-flex items-center justify-center w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors mb-3">
              Book a demo
            </a>
            <Link to="/login" className="text-[13px] font-medium text-forest hover:underline">Already have an account? Sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex w-[420px] shrink-0 bg-forest flex-col justify-between p-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center">
            <TreePine className="w-4.5 h-4.5 text-cream" />
          </div>
          <span className="text-lg font-semibold text-cream">CampCommand</span>
        </div>
        <div>
          <h2 className="text-[28px] font-bold text-cream leading-snug mb-3">
            Get your camp set up in minutes.
          </h2>
          <p className="text-[14px] text-cream/60 leading-relaxed">
            Create your account and invite your team to start managing operations together.
          </p>
        </div>
        <p className="text-[11px] text-cream/30">Free to get started.</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-paper p-4 sm:p-6 sm:p-10">
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-7 h-7 bg-forest rounded-lg flex items-center justify-center">
            <TreePine className="w-4 h-4 text-cream" />
          </div>
          <span className="text-base font-semibold text-forest">CampCommand</span>
        </div>

        <div className="w-full max-w-sm">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft hover:text-forest mb-6 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>

          <div className="bg-white rounded-xl border border-border shadow-sm p-8">
            <h1 className="text-[18px] font-semibold text-forest mb-6">Create account</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-ink mb-1.5">
                  Full name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
                />
                <p className="text-[11px] text-ink-faint mt-1">Minimum 8 characters</p>
              </div>

              {error && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50 mt-2"
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>

          <p className="text-center text-[12px] text-ink-soft mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-forest font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
