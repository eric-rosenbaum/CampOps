import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TreePine } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export function Login() {
  const signIn = useAuthStore((s) => s.signIn);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) { setError(err); return; }
    const redirect = sessionStorage.getItem('redirectAfterLogin');
    sessionStorage.removeItem('redirectAfterLogin');
    navigate(redirect || '/', { replace: true });
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
        <p className="text-[11px] text-cream/30">Built for camp operators.</p>
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
          </div>

          <p className="text-center text-[12px] text-forest/50 mt-5">
            Don't have an account?{' '}
            <Link to="/signup" className="text-forest font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
