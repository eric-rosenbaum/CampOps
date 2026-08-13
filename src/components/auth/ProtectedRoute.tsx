import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';

const SUPPORT_EMAIL = 'prakash@campcommand.app';

// Sign out and return to the marketing site. Lets someone who signed in with the wrong email
// (and got blocked) start over with a different account.
async function signOutToMarketing() {
  // `finally`: leaving must happen even if the sign-out itself failed, or the button
  // reads as broken. authStore.signOut has already cleared this device either way.
  try {
    await useAuthStore.getState().signOut();
  } finally {
    window.location.href = window.location.hostname.startsWith('app.') ? 'https://campcommand.app' : '/';
  }
}

function SignOutRetry({ label = 'Sign out and try a different account' }: { label?: string }) {
  return (
    <button onClick={signOutToMarketing} className="mt-4 text-[13px] font-medium text-forest/50 hover:text-forest underline transition-colors">
      {label}
    </button>
  );
}

// Requires authentication. Redirects to /login if not signed in.
export function ProtectedRoute() {
  const { session, isLoading: authLoading } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !session) {
      const url = window.location.pathname + window.location.search;
      if (url !== '/' && url !== '/login' && url !== '/signup') {
        sessionStorage.setItem('redirectAfterLogin', url);
      }
      navigate('/login', { replace: true });
    }
  }, [authLoading, session, navigate]);

  if (authLoading) return <AppLoadingScreen />;
  if (!session) return null;
  return <Outlet />;
}

// Requires a selected camp. Platform admins with no camp go to the admin console;
// other users with no camp see a "not set up" screen. Blocks suspended/expired camps.
export function CampRoute() {
  const { currentCamp, camps, isLoading, isPlatformAdmin } = useCampStore();
  const { session } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || !session || currentCamp) return;
    if (isPlatformAdmin) navigate('/admin', { replace: true });
    else if (camps.length === 0) navigate('/no-access', { replace: true });
  }, [isLoading, session, currentCamp, camps.length, isPlatformAdmin, navigate]);

  if (isLoading || !currentCamp) return <AppLoadingScreen />;
  if (!isPlatformAdmin && currentCamp.status !== 'active') {
    return <CampBlockedScreen status={currentCamp.status} />;
  }
  return <Outlet />;
}

// Requires founder super-admin. Redirects others to /home (or /login if signed out).
export function PlatformAdminRoute() {
  const { isPlatformAdmin, isLoading } = useCampStore();
  const { session, isLoading: authLoading } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !session) { navigate('/login', { replace: true }); return; }
    if (!authLoading && !isLoading && session && !isPlatformAdmin) navigate('/home', { replace: true });
  }, [authLoading, isLoading, session, isPlatformAdmin, navigate]);

  if (authLoading || isLoading) return <AppLoadingScreen />;
  if (!session || !isPlatformAdmin) return null;
  return <Outlet />;
}

function CampBlockedScreen({ status }: { status: string }) {
  const trial = status === 'trial_expired';
  return (
    <div className="fixed inset-0 bg-cream flex items-center justify-center p-4 sm:p-6 z-50">
      <div className="max-w-md text-center">
        <h1 className="text-[22px] font-bold text-forest mb-3">
          {trial ? 'Your demo has ended' : 'Your account is paused'}
        </h1>
        <p className="text-[14px] text-forest/60 leading-relaxed mb-6">
          {trial
            ? 'Your 30-day CampCommand demo is over. To set up a real account and pick up where you left off, get in touch and we’ll get you started.'
            : 'This account is currently paused. Please reach out and we’ll get you back up and running.'}
        </p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center justify-center px-5 py-3 rounded-btn bg-sage text-forest text-[15px] font-semibold hover:bg-sage-light transition-colors">
          Email {SUPPORT_EMAIL}
        </a>
        <div><SignOutRetry /></div>
      </div>
    </div>
  );
}

export function NoCampAccess() {
  return (
    <div className="fixed inset-0 bg-cream flex items-center justify-center p-4 sm:p-6 z-50">
      <div className="max-w-md text-center">
        <h1 className="text-[22px] font-bold text-forest mb-3">Your account isn’t set up yet</h1>
        <p className="text-[14px] text-forest/60 leading-relaxed mb-6">
          You’re signed in, but you don’t have access to a camp yet. If you signed in with the wrong
          email, sign out and try again with the address your invite was sent to.
        </p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center justify-center px-5 py-3 rounded-btn bg-sage text-forest text-[15px] font-semibold hover:bg-sage-light transition-colors">
          Email {SUPPORT_EMAIL}
        </a>
        <div><SignOutRetry label="Sign out and use a different email" /></div>
      </div>
    </div>
  );
}

function AppLoadingScreen() {
  return (
    <div className="fixed inset-0 bg-stone-50 flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-forest border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-forest/50 font-medium">Loading…</p>
      </div>
    </div>
  );
}
