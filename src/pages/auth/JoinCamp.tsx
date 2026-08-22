import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TreePine, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCampStore } from '@/store/campStore';
import { useAuthStore, OTP_MIN_LENGTH, OTP_MAX_LENGTH } from '@/store/authStore';

type CodeInfo = { valid: boolean; reason?: string; campName?: string; role?: string; groupName?: string };
type Step = 'code' | 'identity' | 'otp' | 'joining';

// Join codes are word-shaped (CEDAR-4821); older camps still hold 6-character hex ones.
// The server normalises case and punctuation before matching, so the client only needs a
// loose length check — and must NOT truncate, which is what broke word codes.
const MIN_JOIN_CODE_LENGTH = 6;

function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
}

function codeProblem(reason?: string): string {
  if (reason === 'expired') return 'This join link has expired. Ask your camp administrator for a new one.';
  if (reason === 'used_up') return 'This join link has been used the maximum number of times.';
  if (reason === 'camp_unavailable') return 'This camp isn’t accepting new staff right now.';
  return 'That join code isn’t valid. Check it and try again.';
}

/**
 * The staff lane: join a camp with a code and an emailed sign-in code. No password.
 *
 * One emailed code creates the account, proves the email is real, and signs the person in —
 * which is why this flow has no separate "confirm your email" step. Leaders who are invited
 * individually still set a password over in AcceptInvite; this is deliberately the simpler
 * path for seasonal staff who will mostly live in the phone app.
 */
export function JoinCamp() {
  const { joinWithCode } = useCampStore();
  const { user, sendEmailOtp, verifyEmailOtp } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [code, setCode] = useState(() => searchParams.get('code')?.toUpperCase().trim() ?? '');
  const [info, setInfo] = useState<CodeInfo | null>(null);
  const [step, setStep] = useState<Step>('code');
  const [checkingCode, setCheckingCode] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Seconds until a new code can be requested. Supabase allows one OTP per 60s.
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const autoChecked = useRef(false);

  async function checkCode(raw: string) {
    setCheckingCode(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('join_code_info', { p_code: raw });
    setCheckingCode(false);
    if (rpcError) { setError('Could not check that code. Please try again.'); return; }
    const d = (data ?? {}) as { valid?: boolean; reason?: string; camp_name?: string; role?: string; group_name?: string };
    if (!d.valid) { setInfo({ valid: false, reason: d.reason }); setError(codeProblem(d.reason)); return; }
    setCode(raw);
    setInfo({ valid: true, campName: d.camp_name, role: d.role, groupName: d.group_name ?? undefined });
    setStep('identity');
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await sendEmailOtp(email, name);
    setBusy(false);
    if (err) { setError(err); return; }
    setStep('otp');
    setCooldown(60);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await verifyEmailOtp(email, otp);
    if (err) { setError(err); setBusy(false); return; }
    await finishJoin();
  }

  async function finishJoin() {
    setStep('joining');
    const result = await joinWithCode(code);
    if ('error' in result) {
      setError(result.error);
      setStep('identity');
      setBusy(false);
      return;
    }
    navigate('/welcome', { replace: true });
  }

  async function handleResend() {
    setError(null);
    const err = await sendEmailOtp(email, name);
    if (err) { setError(err); return; }
    setCooldown(60);
  }

  // Declared after the handlers so the effects can reference them without a
  // use-before-declaration warning.

  // A code in the URL is checked once on arrival so the camp name can be shown up front.
  useEffect(() => {
    const fromUrl = searchParams.get('code');
    if (!fromUrl || autoChecked.current) return;
    autoChecked.current = true;
    void checkCode(fromUrl.toUpperCase().trim());
  }, [searchParams]);

  // Someone already signed in (e.g. adding a second camp) skips straight to joining.
  useEffect(() => {
    if (user && info?.valid && step === 'identity') void finishJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, info, step]);

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center">
            <TreePine className="w-4 h-4 text-cream" />
          </div>
          <span className="text-xl font-semibold text-forest">CampCommand</span>
        </div>

        <div className="bg-white rounded-xl border border-border shadow-sm p-8">
          {step === 'joining' && (
            <div className="text-center py-4">
              <div className="w-8 h-8 border-2 border-forest border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[14px] font-medium text-forest mb-1">Joining {info?.campName ?? 'camp'}…</p>
              <p className="text-[12px] text-ink-faint">Just a moment</p>
            </div>
          )}

          {/* Step 1 — the code itself. Also the manual path for someone told the code verbally. */}
          {step === 'code' && (
            <>
              <h1 className="text-[17px] font-semibold text-forest mb-1">Join your camp</h1>
              <p className="text-[12px] text-ink-soft mb-6">
                Enter the code from your camp administrator, like CEDAR-4821.
              </p>
              {error && <ErrorNote>{error}</ErrorNote>}
              <form
                onSubmit={(e) => { e.preventDefault(); void checkCode(normaliseCode(code)); }}
                className="space-y-3"
              >
                <input
                  value={code}
                  onChange={(e) => setCode(normaliseCode(e.target.value))}
                  autoFocus
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="CEDAR-4821"
                  className="w-full px-3 py-3 rounded-lg border border-border text-center text-[19px] font-mono font-semibold tracking-[0.12em] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                />
                <button
                  type="submit"
                  disabled={code.trim().length < MIN_JOIN_CODE_LENGTH || checkingCode}
                  className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
                >
                  {checkingCode ? 'Checking…' : 'Continue'}
                </button>
              </form>
            </>
          )}

          {/* Step 2 — who they are. The camp is named so they know they're in the right place. */}
          {step === 'identity' && info?.valid && (
            <>
              <h1 className="text-[17px] font-semibold text-forest mb-1">Join {info.campName}</h1>
              <p className="text-[12px] text-ink-soft mb-6">
                {info.groupName ? `You'll join as ${info.groupName}. ` : ''}
                We'll email you a code to sign in — no password needed.
              </p>
              {error && <ErrorNote>{error}</ErrorNote>}
              <form onSubmit={handleSendCode} className="space-y-3">
                <Field label="Your name">
                  <input
                    type="text" required autoFocus value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className={inputClass}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    className={inputClass}
                  />
                </Field>
                <button
                  type="submit"
                  disabled={busy || !name.trim() || !email.trim()}
                  className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50 mt-1"
                >
                  {busy ? 'Sending…' : 'Email me a code'}
                </button>
              </form>
            </>
          )}

          {/* Step 3 — the code from their inbox. Signs in and verifies the address at once. */}
          {step === 'otp' && (
            <>
              <button
                onClick={() => { setStep('identity'); setOtp(''); setError(null); }}
                className="inline-flex items-center gap-1.5 text-[12px] text-ink-faint hover:text-forest mb-4 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <h1 className="text-[17px] font-semibold text-forest mb-1">Enter your code</h1>
              <p className="text-[12px] text-ink-soft mb-6">
                We sent a sign-in code to <span className="font-medium text-forest">{email}</span>.
              </p>
              {error && <ErrorNote>{error}</ErrorNote>}
              <form onSubmit={handleVerify} className="space-y-3">
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH))}
                  autoFocus
                  inputMode="numeric"
                  // Lets iOS/Android offer the code straight from the notification.
                  autoComplete="one-time-code"
                  className="w-full px-3 py-3 rounded-lg border border-border text-center text-[22px] font-mono font-semibold tracking-[0.35em] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                />
                <button
                  type="submit"
                  disabled={busy || otp.length < OTP_MIN_LENGTH}
                  className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
                >
                  {busy ? 'Verifying…' : 'Join camp'}
                </button>
              </form>
              <button
                onClick={handleResend}
                disabled={cooldown > 0}
                className="w-full text-[12px] text-ink-faint hover:text-forest transition-colors pt-3 disabled:hover:text-ink-faint"
              >
                {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-border text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-ink mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
      {children}
    </p>
  );
}
