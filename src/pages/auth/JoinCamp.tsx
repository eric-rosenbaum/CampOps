import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TreePine, ArrowLeft } from 'lucide-react';
import { useCampStore } from '@/store/campStore';

export function JoinCamp() {
  const { joinWithCode } = useCampStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(() => searchParams.get('code')?.toUpperCase() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await joinWithCode(code.trim().toUpperCase());
    setLoading(false);
    if ('error' in result) { setError(result.error); return; }
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Link to="/setup" className="inline-flex items-center gap-1.5 text-[12px] text-forest/50 hover:text-forest mb-6 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to setup
        </Link>

        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center">
            <TreePine className="w-4.5 h-4.5 text-cream" />
          </div>
          <span className="text-xl font-semibold text-forest">CampCommand</span>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8">
          <h1 className="text-[17px] font-semibold text-forest mb-1">Join a camp</h1>
          <p className="text-[12px] text-forest/50 mb-6">
            Enter the join code provided by your camp administrator.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-forest/70 mb-1.5">
                Join code
              </label>
              <input
                type="text"
                required
                autoFocus={!code}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={10}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[14px] font-mono text-forest tracking-widest placeholder:text-forest/30 placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
              />
            </div>

            {error && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || code.trim().length < 4}
              className="w-full bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Joining…' : 'Join camp'}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-forest/50 mt-5">
          Setting up a new camp?{' '}
          <Link to="/setup" className="text-forest font-medium hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
