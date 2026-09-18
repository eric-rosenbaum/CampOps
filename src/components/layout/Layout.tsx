import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Clock, Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useIssuesStore } from '@/store/issuesStore';
import { useCampStore } from '@/store/campStore';
import { useUIStore } from '@/store/uiStore';
import { CampCommandMark } from '@/components/shared/CampCommandMark';
import { UnsavedChangesBanner } from '@/components/shared/UnsavedChangesBanner';
import { useDemoBrief } from '@/lib/useDemoBrief';
import { useLang } from '@/lib/language';
import { Trans, useTranslation } from 'react-i18next';

// Shown when a founder is viewing a camp they don't belong to, or when a trial is counting down.
function StatusBanners() {
  const { t } = useTranslation('shell');
  const { impersonating, currentCamp, exitImpersonation } = useCampStore();
  const navigate = useNavigate();
  const hasGuide = !!useDemoBrief(currentCamp?.id, currentCamp?.accountType === 'trial' || currentCamp?.accountType === 'demo');
  const trialDays = currentCamp?.accountType === 'trial' && currentCamp.trialEndsAt
    ? Math.ceil((new Date(currentCamp.trialEndsAt).getTime() - new Date().getTime()) / 86400000) : null;

  if (impersonating) {
    return (
      <div className="flex items-center justify-center gap-3 bg-forest text-cream text-[12px] font-medium px-4 py-1.5 flex-shrink-0">
        <span>
          <Trans
            t={t}
            i18nKey="banner.impersonating"
            values={{ camp: currentCamp?.name ?? '' }}
            components={{ b: <span className="font-semibold" /> }}
          />
        </span>
        <button onClick={() => { exitImpersonation(); navigate('/admin'); }} className="inline-flex items-center gap-1 underline hover:text-sage-light">
          <LogOut className="w-3 h-3 rtl:-scale-x-100" /> {t('banner.exitToAdmin')}
        </button>
      </div>
    );
  }
  if (trialDays != null) {
    return (
      <div className="flex items-center justify-center gap-2 bg-amber-bg text-amber-text text-[12px] font-medium px-4 py-1.5 flex-shrink-0">
        <Clock className="w-3.5 h-3.5" />
        {trialDays >= 0 ? t('banner.demoDaysLeft', { count: trialDays }) : t('banner.demoEnded')}
        {trialDays >= 0 && hasGuide && (
          <button onClick={() => navigate('/demo-guide')} className="underline font-semibold hover:text-forest ms-1">
            {t('banner.openGuide')}
          </button>
        )}
      </div>
    );
  }
  return null;
}

function SyncIndicator() {
  const { t } = useTranslation('shell');
  const pendingCount = useIssuesStore((s) => Object.keys(s.pendingIssues).length);
  if (pendingCount === 0) return null;
  return (
    <div className="fixed bottom-4 end-4 z-50 flex items-center gap-2 rounded-full bg-forest/90 px-3 py-1.5 shadow-lg">
      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      <span className="text-[11px] font-medium text-cream">{t('sync.saving')}</span>
    </div>
  );
}

/**
 * The phone-only header. The sidebar is off-canvas below `lg`, so this is what gives a
 * thumb a way back to navigation. And it keeps the camp's name on screen, which the
 * sidebar footer would otherwise be the only place to see.
 */
function MobileHeader({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation('shell');
  const { currentCamp } = useCampStore();
  return (
    <div className="lg:hidden flex items-center gap-3 bg-forest px-3 py-2.5 flex-shrink-0">
      <button
        onClick={onMenu}
        aria-label={t('mobile.openNav')}
        className="p-2 -m-1 rounded-btn text-cream/80 hover:text-cream hover:bg-white/10 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2 min-w-0">
        <CampCommandMark size={24} compact decorative className="flex-shrink-0" />
        <span className="font-display text-[14px] font-bold text-side-strong truncate">
          {currentCamp?.name ?? 'CampCommand'}
        </span>
      </div>
    </div>
  );
}

export function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const lang = useLang();

  // `[` toggles the rail, matching the reference. Ignored while typing so it can't fire from
  // inside a search box or a note field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      toggleSidebar();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} collapsed={sidebarCollapsed} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <StatusBanners />
        <MobileHeader onMenu={() => setNavOpen(true)} />
        {/* Keyed by language: a switch remounts the page so module-level label maps and
            memoised strings are all re-read. The sidebar and the data loaders stay mounted. */}
        <Outlet key={lang} />
      </div>
      <SyncIndicator />
      <UnsavedChangesBanner />
    </div>
  );
}
