import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';
import { FullScreenLoading } from '@/components/shared/ModuleLoading';
import { APP_HOST, MARKETING_ORIGIN } from '@/lib/env';
import { useTranslation } from 'react-i18next';

const SUPPORT_EMAIL = 'prakash@campcommand.app';

// Sign out and return to the marketing site. Lets someone who signed in with the wrong email
// (and got blocked) start over with a different account.
async function signOutToMarketing() {
  // `finally`: leaving must happen even if the sign-out itself failed, or the button
  // reads as broken. authStore.signOut has already cleared this device either way.
  try {
    await useAuthStore.getState().signOut();
  } finally {
    // Compared against the configured app host rather than a "app." prefix test: the staging
    // product lives on app-staging.<domain>, which fails that test and used to send staging
    // sign-outs to the production marketing site.
    window.location.href = window.location.hostname === APP_HOST ? MARKETING_ORIGIN : '/';
  }
}

function SignOutRetry({ label }: { label?: string }) {
  const { t } = useTranslation('shell');
  return (
    <button onClick={signOutToMarketing} className="mt-4 text-[13px] font-medium text-ink-soft hover:text-forest underline transition-colors">
      {label ?? t('access.signOutRetry')}
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
  const { t } = useTranslation('shell');
  const trial = status === 'trial_expired';
  return (
    <div className="fixed inset-0 bg-cream flex items-center justify-center p-4 sm:p-6 z-50">
      <div className="max-w-md text-center">
        <h1 className="text-[22px] font-bold text-forest mb-3">
          {trial ? t('access.demoEndedTitle') : t('access.pausedTitle')}
        </h1>
        <p className="text-[14px] text-ink-soft leading-relaxed mb-6">
          {trial ? t('access.demoEndedBody') : t('access.pausedBody')}
        </p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center justify-center px-5 py-3 rounded-btn bg-sage text-forest text-[15px] font-semibold hover:bg-sage-light transition-colors">
          {t('access.email', { email: SUPPORT_EMAIL })}
        </a>
        <div><SignOutRetry /></div>
      </div>
    </div>
  );
}

export function NoCampAccess() {
  const { t } = useTranslation('shell');
  return (
    <div className="fixed inset-0 bg-cream flex items-center justify-center p-4 sm:p-6 z-50">
      <div className="max-w-md text-center">
        <h1 className="text-[22px] font-bold text-forest mb-3">{t('access.noCampTitle')}</h1>
        <p className="text-[14px] text-ink-soft leading-relaxed mb-6">
          {t('access.noCampBody')}
        </p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center justify-center px-5 py-3 rounded-btn bg-sage text-forest text-[15px] font-semibold hover:bg-sage-light transition-colors">
          {t('access.email', { email: SUPPORT_EMAIL })}
        </a>
        <div><SignOutRetry label={t('access.signOutDifferentEmail')} /></div>
      </div>
    </div>
  );
}

function AppLoadingScreen() {
  const { t } = useTranslation('shell');
  return <FullScreenLoading label={t('loading.appLabel')} sublabel={t('loading.appSublabel')} />;
}
