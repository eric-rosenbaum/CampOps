import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TreePine } from 'lucide-react';
import { useCampStore } from '@/store/campStore';
import { useAuthStore } from '@/store/authStore';

type AuthMode = 'choose' | 'signup' | 'signin';

export function JoinCamp() {
  const { joinWithCode } = useCampStore();
  const { user, signIn, signUp } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [code] = useState(() => searchParams.get('code')?.toUpperCase() ?? '');
  const [mode, setMode] = useState<AuthMode>('choose');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // If the user is already logged in when they land, join immediately.
  useEffect(() => {
    if (user && code) {
      void attemptJoin();
    }
  }, [user]);

  async function attemptJoin() {
    if (!code) { setError('No join code found in this link.'); return; }
    setJoining(true);
    setError(null);
    const result = await joinWithCode(code);
    setJoining(false);
    if ('error' in result) { setError(result.error); return; }
    navigate('/', { replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const err = await signUp(email, password, name);
    if (err) { setError(err); setSubmitting(false); return; }
    // Auth state change triggers the useEffect above to call attemptJoin.
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const err = await signIn(email, password);
    if (err) { setError(err); setSubmitting(false); return; }
    // Auth state change triggers the useEffect above to call attemptJoin.
  }

  const campName = null; // Could fetch from code preview in future

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center">
            <TreePine className="w-4 h-4 text-cream" />
          </div>
          <span className="text-xl font-semibold text-forest">CampCommand</span>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8">

          {/* Joining spinner (already authenticated) */}
          {joining && (
            <div className="text-center py-4">
              <p className="text-[14px] font-medium text-forest mb-1">Joining camp…</p>
              <p className="text-[12px] text-forest/40">Just a moment</p>
            </div>
          )}

          {/* Not joining yet — show auth options */}
          {!joining && (
            <>
              <h1 className="text-[17px] font-semibold text-forest mb-1">
                {mode === 'signin' ? 'Sign in to join' : 'Join your camp'}
              </h1>
              <p className="text-[12px] text-forest/50 mb-6">
                {mode === 'choose'
                  ? `You've been invited to join a camp on CampCommand.`
                  : mode === 'signup'
                  ? 'Create a free account to get started.'
                  : 'Welcome back — sign in to continue.'}
              </p>

              {error && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
                  {error}
                </p>
              )}

              {mode === 'choose' && (
                <div className="space-y-3">
                  <button
                    onClick={() => setMode('signup')}
                    className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors"
                  >
                    Create an account
                  </button>
                  <button
                    onClick={() => setMode('signin')}
                    className="w-full bg-white text-forest font-medium text-[13px] py-2.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
                  >
                    I already have an account
                  </button>
                </div>
              )}

              {mode === 'signup' && (
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-forest/70 mb-1.5">Full name</label>
                    <input
                      type="text" required autoFocus value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-forest/70 mb-1.5">Email</label>
                    <input
                      type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-forest/70 mb-1.5">Password</label>
                    <input
                      type="password" required minLength={6} value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50 mt-1"
                  >
                    {submitting ? 'Creating account…' : 'Create account & join'}
                  </button>
                  <button type="button" onClick={() => { setMode('choose'); setError(null); }}
                    className="w-full text-[12px] text-forest/40 hover:text-forest transition-colors pt-1">
                    Back
                  </button>
                </form>
              )}

              {mode === 'signin' && (
                <form onSubmit={handleSignIn} className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-forest/70 mb-1.5">Email</label>
                    <input
                      type="email" required autoFocus value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-forest/70 mb-1.5">Password</label>
                    <input
                      type="password" required value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50 mt-1"
                  >
                    {submitting ? 'Signing in…' : 'Sign in & join'}
                  </button>
                  <button type="button" onClick={() => { setMode('choose'); setError(null); }}
                    className="w-full text-[12px] text-forest/40 hover:text-forest transition-colors pt-1">
                    Back
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
