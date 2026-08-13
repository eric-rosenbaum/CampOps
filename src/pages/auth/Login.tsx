import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { TreePine } from 'lucide-react';
import { useAuthStore, OTP_MIN_LENGTH, OTP_MAX_LENGTH } from '@/store/authStore';

interface CodeSignInProps {
  email: string;
  setEmail: (v: string) => void;
  otp: string;
  setOtp: (v: string) => void;
  otpSent: boolean;
  loading: boolean;
  error: string | null;
  onSend: (e: React.FormEvent) => void;
  onVerify: (e: React.FormEvent) => void;
  onBack: () => void;
}

/** Passwordless sign-in for staff who joined with a code and never set a password. */
function CodeSignIn(p: CodeSignInProps) {
  const input =
    'w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20';
  return (
    <>
      {!p.otpSent ? (
        <form onSubmit={p.onSend} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-forest/70 mb-1.5">Email address</label>
            <input
              type="email" required autoFocus autoComplete="email" inputMode="email"
              value={p.email} onChange={(e) => p.setEmail(e.target.value)} className={input}
            />
          </div>
          {p.error && <ErrorBox>{p.error}</ErrorBox>}
          <button
            type="submit" disabled={p.loading || !p.email.trim()}
            className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50 mt-2"
          >
            {p.loading ? 'Sending…' : 'Email me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={p.onVerify} className="space-y-4">
          <p className="text-[12px] text-forest/55 leading-relaxed">
            We sent a sign-in code to <span className="font-medium text-forest">{p.email}</span>.
          </p>
          <input
            value={p.otp}
            onChange={(e) => p.setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH))}
            autoFocus inputMode="numeric" autoComplete="one-time-code"
            className="w-full px-3 py-3 rounded-lg border border-stone-200 text-center text-[22px] font-mono font-semibold tracking-[0.35em] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
          />
          {p.error && <ErrorBox>{p.error}</ErrorBox>}
          <button
            type="submit" disabled={p.loading || p.otp.length < OTP_MIN_LENGTH}
            className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
          >
            {p.loading ? 'Verifying…' : 'Sign in'}
          </button>
        </form>
      )}
      <button onClick={p.onBack} className="w-full text-[12px] text-forest/40 hover:text-forest transition-colors pt-4">
        Use a password instead
      </button>
    </>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
      {children}
    </p>
  );
}

export function Login() {
  const signIn = useAuthStore((s) => s.signIn);
  const sendEmailOtp = useAuthStore((s) => s.sendEmailOtp);
  const verifyEmailOtp = useAuthStore((s) => s.verifyEmailOtp);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Staff who joined with a code have no password at all, so the code lane has to be
  // reachable from the front door too — not only from the join link.
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  function goAfterAuth() {
    const redirect = sessionStorage.getItem('redirectAfterLogin');
    sessionStorage.removeItem('redirectAfterLogin');
    navigate(redirect || '/', { replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) { setError(err); return; }
    goAfterAuth();
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // No account is created here: someone signing in must already exist.
    const err = await sendEmailOtp(email);
    setLoading(false);
    if (err) { setError(err); return; }
    setOtpSent(true);
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await verifyEmailOtp(email, otp);
    setLoading(false);
    if (err) { setError(err); return; }
    goAfterAuth();
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
            Camp operations, simplified.
          </h2>
          <p className="text-[14px] text-cream/60 leading-relaxed">
            Manage issues, safety, pools, and more — all in one place for your entire staff.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-cream/30">
          <span>Built for camp operators.</span>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-cream/60 transition-colors">Privacy</a>
          <a href="/security" target="_blank" rel="noopener noreferrer" className="hover:text-cream/60 transition-colors">Security</a>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-stone-50 p-6 sm:p-10">
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-7 h-7 bg-forest rounded-lg flex items-center justify-center">
            <TreePine className="w-4 h-4 text-cream" />
          </div>
          <span className="text-base font-semibold text-forest">CampCommand</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8">
            <h1 className="text-[18px] font-semibold text-forest mb-6">Sign in</h1>

            {mode === 'code' ? (
              <CodeSignIn
                email={email}
                setEmail={setEmail}
                otp={otp}
                setOtp={setOtp}
                otpSent={otpSent}
                loading={loading}
                error={error}
                onSend={handleSendCode}
                onVerify={handleVerifyCode}
                onBack={() => { setMode('password'); setOtpSent(false); setOtp(''); setError(null); }}
              />
            ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-forest/70 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-forest/70 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
                />
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
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={() => { setMode('code'); setError(null); }}
                className="text-[12px] font-medium text-forest hover:underline"
              >
                Email me a sign-in code instead
              </button>
              <Link to="/forgot-password" className="text-[12px] text-forest/50 hover:text-forest transition-colors">
                Forgot your password?
              </Link>
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
