import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Clock } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useIssuesStore } from '@/store/issuesStore';
import { useCampStore } from '@/store/campStore';

// Shown when a founder is viewing a camp they don't belong to, or when a trial is counting down.
function StatusBanners() {
  const { impersonating, currentCamp, exitImpersonation } = useCampStore();
  const navigate = useNavigate();
  const trialDays = currentCamp?.accountType === 'trial' && currentCamp.trialEndsAt
    ? Math.ceil((new Date(currentCamp.trialEndsAt).getTime() - new Date().getTime()) / 86400000) : null;

  if (impersonating) {
    return (
      <div className="flex items-center justify-center gap-3 bg-forest text-cream text-[12px] font-medium px-4 py-1.5 flex-shrink-0">
        <span>Viewing <span className="font-semibold">{currentCamp?.name}</span> as CampCommand admin</span>
        <button onClick={() => { exitImpersonation(); navigate('/admin'); }} className="inline-flex items-center gap-1 underline hover:text-sage-light">
          <LogOut className="w-3 h-3" /> Exit to admin
        </button>
      </div>
    );
  }
  if (trialDays != null) {
    return (
      <div className="flex items-center justify-center gap-2 bg-amber-bg text-amber-text text-[12px] font-medium px-4 py-1.5 flex-shrink-0">
        <Clock className="w-3.5 h-3.5" />
        {trialDays >= 0 ? `Trial — ${trialDays} day${trialDays === 1 ? '' : 's'} left` : 'Trial ended'}
      </div>
    );
  }
  return null;
}

function SyncIndicator() {
  const pendingCount = useIssuesStore((s) => Object.keys(s.pendingIssues).length);
  if (pendingCount === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-forest/90 px-3 py-1.5 shadow-lg">
      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      <span className="text-[11px] font-medium text-cream">Saving…</span>
    </div>
  );
}

export function Layout() {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <StatusBanners />
        <Outlet />
      </div>
      <SyncIndicator />
    </div>
  );
}
