import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TreePine, ArrowLeft, MailCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export function ForgotPassword() {
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    const err = await requestPasswordReset(email);
    setLoading(false);
    // Show the same confirmation whether or not the email exists (don't leak account existence).
    if (err) { setError(err); return; }
    setSent(true);
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-stone-50 p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center"><TreePine className="w-4.5 h-4.5 text-cream" /></div>
          <span className="text-lg font-semibold text-forest">CampCommand</span>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"><MailCheck className="w-5 h-5 text-green-600" /></div>
              <h1 className="text-[18px] font-semibold text-forest mb-2">Check your email</h1>
              <p className="text-[13px] text-forest/60 leading-relaxed">
                If an account exists for <span className="font-medium text-forest">{email}</span>, we’ve sent a link to reset your password. It may take a minute to arrive.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-[18px] font-semibold text-forest mb-1.5">Reset your password</h1>
              <p className="text-[13px] text-forest/55 mb-5">Enter your email and we’ll send you a reset link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-forest/70 mb-1.5">Email address</label>
                  <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40" />
                </div>
                {error && <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50 mt-2">
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="text-center mt-5">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[12px] text-forest/50 hover:text-forest transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
