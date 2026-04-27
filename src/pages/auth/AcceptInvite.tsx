import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { TreePine } from 'lucide-react';
import { useCampStore } from '@/store/campStore';
import { supabase } from '@/lib/supabase';

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { acceptInvitation } = useCampStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    // Check session directly from Supabase to avoid race with auth store initialization
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        sessionStorage.setItem('pendingInviteToken', token);
        navigate(`/signup?invite=${token}`, { replace: true });
        return;
      }
      acceptToken();
    });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acceptToken() {
    if (!token) return;
    const result = await acceptInvitation(token);
    if ('error' in result) {
      setError(result.error);
      setStatus('error');
    } else {
      setStatus('success');
      setTimeout(() => navigate('/', { replace: true }), 1500);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 bg-forest rounded-lg flex items-center justify-center">
            <TreePine className="w-4.5 h-4.5 text-cream" />
          </div>
          <span className="text-xl font-semibold text-forest">CampCommand</span>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8 text-center">
          {status === 'loading' ? (
            <>
              <div className="w-8 h-8 border-2 border-forest border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[14px] font-medium text-forest">Accepting invitation…</p>
            </>
          ) : status === 'success' ? (
            <>
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-green-600 text-lg">✓</span>
              </div>
              <p className="text-[15px] font-semibold text-forest mb-1">Invitation accepted</p>
              <p className="text-[12px] text-forest/50">Redirecting you now…</p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-forest mb-2">Couldn't accept invitation</p>
              <p className="text-[12px] text-forest/60 mb-5 leading-relaxed">{error}</p>
              <Link to="/" className="text-[13px] font-medium text-forest hover:underline">
                Go to dashboard
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
