import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';

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

// Requires a selected camp. Redirects to /setup if user has no camps.
export function CampRoute() {
  const { currentCamp, camps, isLoading } = useCampStore();
  const { session } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && session && camps.length === 0) {
      navigate('/setup', { replace: true });
    }
  }, [isLoading, session, camps.length, navigate]);

  if (isLoading || !currentCamp) return <AppLoadingScreen />;
  return <Outlet />;
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
