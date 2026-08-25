import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useCampStore } from '@/store/campStore';
import { CampCommandMark } from '@/components/shared/CampCommandMark';
import { CampLoader } from '@/components/shared/ModuleLoading';

// Frictionless demo entry. The shareable link (app.campcommand.app/try/:token) drops anyone -
// no email, no password, straight into ONE demo camp via an anonymous session. Multiple people
// on the same link share that one isolated environment. Non-demo camps can never be reached here.
export function TryDemo() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    (async () => {
      // Reuse an existing session if there is one; otherwise mint an anonymous one.
      let session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        const { data, error: sErr } = await supabase.auth.signInAnonymously();
        if (sErr || !data.session) {
          setError('We couldn’t start your demo session. Please try the link again in a moment.');
          return;
        }
        session = data.session;
      }

      const { data: result, error: jErr } = await supabase.rpc('join_demo_with_token', { p_token: token });
      if (jErr) { setError(jErr.message); return; }
      const r = (result ?? {}) as { error?: string; camp_id?: string };
      if (r.error) { setError(r.error); return; }

      // Load this (anonymous) user's camps (they're a member of exactly this demo) then open it.
      await useCampStore.getState().loadMyCamps();
      if (r.camp_id) await useCampStore.getState().selectCamp(r.camp_id);
      navigate('/home', { replace: true });
    })();
  }, [token, navigate]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-paper p-4 sm:p-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <CampCommandMark size={36} decorative />
          <span className="text-lg font-semibold text-forest">CampCommand</span>
        </div>
        <div className="bg-white rounded-xl border border-border shadow-sm p-8">
          {error ? (
            <>
              <h1 className="text-[18px] font-semibold text-forest mb-2">Can’t open this demo</h1>
              <p className="text-[13px] text-ink-soft leading-relaxed">{error}</p>
            </>
          ) : (
            <>
              <CampLoader size="sm" className="mb-4" />
              <p className="text-[14px] font-medium text-forest">Opening your demo…</p>
              <p className="text-[12px] text-ink-faint mt-1">No sign-in needed.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
