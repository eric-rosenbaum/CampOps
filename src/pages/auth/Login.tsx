import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { LanguagePicker } from '@/components/i18n/LanguagePicker';
import { authErrorMessage } from './authErrors';
import { CampCommandMark, CC_CREAM, CC_GREEN } from '@/components/shared/CampCommandMark';
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
  const { t } = useTranslation('auth');
  const input =
    'w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20';
  return (
    <>
      {!p.otpSent ? (
        <form onSubmit={p.onSend} className="space-y-4">
          <div>
            <label htmlFor="code-email" className="block text-[12px] font-medium text-ink mb-1.5">{t('fields.email')}</label>
            <input
              id="code-email" dir="ltr"
              type="email" required autoFocus autoComplete="email" inputMode="email"
              value={p.email} onChange={(e) => p.setEmail(e.target.value)} className={input}
            />
          </div>
          {p.error && <ErrorBox>{p.error}</ErrorBox>}
          <button
            type="submit" disabled={p.loading || !p.email.trim()}
            className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50 mt-2"
          >
            {p.loading ? t('status.sending') : t('code.send')}
          </button>
        </form>
      ) : (
        <form onSubmit={p.onVerify} className="space-y-4">
          <p className="text-[12px] text-ink-soft leading-relaxed">
            <Trans t={t} i18nKey="code.sentTo" values={{ email: p.email }} components={{ email: <bdi className="font-medium text-forest" /> }} />
          </p>
          <input
            value={p.otp}
            onChange={(e) => p.setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH))}
            autoFocus inputMode="numeric" autoComplete="one-time-code" dir="ltr"
            aria-label={t('code.codeLabel')}
            className="w-full px-3 py-3 rounded-lg border border-border text-center text-[22px] font-mono font-semibold tracking-[0.35em] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
          />
          {p.error && <ErrorBox>{p.error}</ErrorBox>}
          <button
            type="submit" disabled={p.loading || p.otp.length < OTP_MIN_LENGTH}
            className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
          >
            {p.loading ? t('status.verifying') : t('login.submit')}
          </button>
        </form>
      )}
      <button onClick={p.onBack} className="w-full text-[12px] text-ink-faint hover:text-forest transition-colors pt-4">
        {t('code.usePassword')}
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
  const { t } = useTranslation('auth');
  const signIn = useAuthStore((s) => s.signIn);
  const sendEmailOtp = useAuthStore((s) => s.sendEmailOtp);
  const verifyEmailOtp = useAuthStore((s) => s.verifyEmailOtp);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Staff who joined with a code have no password at all, so the code lane has to be
  // reachable from the front door too, not only from the join link.
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
    if (err) { setError(authErrorMessage(t, err)); return; }
    goAfterAuth();
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // No account is created here: someone signing in must already exist.
    const err = await sendEmailOtp(email);
    setLoading(false);
    if (err) { setError(authErrorMessage(t, err)); return; }
    setOtpSent(true);
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await verifyEmailOtp(email, otp);
    setLoading(false);
    if (err) { setError(authErrorMessage(t, err)); return; }
    goAfterAuth();
  }

  return (
    <div className="min-h-screen w-full flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex w-[420px] shrink-0 bg-forest flex-col justify-between p-10">
        <div className="flex items-center gap-2.5">
          <CampCommandMark size={32} disc={CC_CREAM} ink={CC_GREEN} decorative />
          <span className="text-lg font-semibold text-cream">CampCommand</span>
        </div>
        <div>
          <h2 className="text-[28px] font-bold text-cream leading-snug mb-3">
            {t('brand.tagline')}
          </h2>
          <p className="text-[14px] text-cream/60 leading-relaxed">
            {t('brand.blurb')}
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-cream/30">
          <span>{t('brand.builtFor')}</span>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-cream/60 transition-colors">{t('brand.privacy')}</a>
          <a href="/security" target="_blank" rel="noopener noreferrer" className="hover:text-cream/60 transition-colors">{t('brand.security')}</a>
        </div>
      </div>

      {/* Right form panel */}
      <div className="relative flex-1 flex flex-col items-center justify-center bg-paper p-4 sm:p-6 sm:p-10">
        {/* Before sign-in there is no account to read a language from, so the choice has to be
            reachable right here, before the first word of the form. */}
        <div className="absolute top-4 end-4">
          <LanguagePicker tone="light" />
        </div>
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <CampCommandMark size={30} decorative />
          <span className="text-base font-semibold text-forest">CampCommand</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="bg-white rounded-xl border border-border shadow-sm p-8">
            <h1 className="text-[18px] font-semibold text-forest mb-6">{t('login.title')}</h1>

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
                <label htmlFor="login-email" className="block text-[12px] font-medium text-ink mb-1.5">
                  {t('fields.email')}
                </label>
                <input
                  id="login-email"
                  dir="ltr"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-[12px] font-medium text-ink mb-1.5">
                  {t('fields.password')}
                </label>
                <input
                  id="login-password"
                  dir="ltr"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
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
                {loading ? t('login.submitting') : t('login.submit')}
              </button>
            </form>

            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={() => { setMode('code'); setError(null); }}
                className="text-[12px] font-medium text-forest hover:underline"
              >
                {t('login.useCode')}
              </button>
              <Link to="/forgot-password" className="text-[12px] text-ink-soft hover:text-forest transition-colors">
                {t('login.forgot')}
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
