import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useIssuesStore } from '@/store/issuesStore';

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
        <Outlet />
      </div>
      <SyncIndicator />
    </div>
  );
}
