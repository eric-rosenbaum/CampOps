import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Wrench,
  Waves, ShieldCheck, Truck, Building2, UtensilsCrossed, Settings, LogOut, CalendarRange, Lock,
  ClipboardCheck, ShoppingBasket, Car, ReceiptText,
} from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { useDemoBrief } from '@/lib/useDemoBrief';
import { SidebarContours } from '@/components/shared/SidebarContours';
import { CampCommandMark, CC_CREAM, CC_GREEN } from '@/components/shared/CampCommandMark';
import { useAuth } from '@/lib/auth';
import { useModules, type ModuleKey } from '@/lib/modules';
import { useCampStore } from '@/store/campStore';
import { useAuthStore } from '@/store/authStore';
import { APP_HOST, MARKETING_ORIGIN } from '@/lib/env';
import { useTranslation } from 'react-i18next';
import { LanguagePicker } from '@/components/i18n/LanguagePicker';

type LucideIcon = React.ComponentType<{ className?: string }>;

/**
 * The active item is a paper cut-out of the sidebar with an ember edge, rather than a tinted
 * block. It reads as the page you are standing in continuing under the nav.
 */
function navClass(isActive: boolean, collapsed: boolean): string {
  const base = collapsed
    ? 'group relative flex items-center justify-center mx-2 mb-0.5 py-2 rounded-btn transition-colors'
    : 'group relative flex items-center gap-2.5 py-[7px] pe-2 mb-px text-[14px] transition-colors border-s-[3px]';
  if (isActive) {
    return collapsed
      ? `${base} bg-cream text-forest`
      : `${base} bg-cream text-forest border-red font-bold ps-[15px]`;
  }
  return collapsed
    ? `${base} text-side hover:bg-white/[0.07] hover:text-side-strong`
    : `${base} text-side border-transparent ps-[15px] hover:bg-white/[0.07] hover:text-side-strong`;
}

/** Tooltip shown only in rail mode, where the label is hidden. */
function RailTip({ label }: { label: string }) {
  return (
    <span
      className="pointer-events-none absolute start-[calc(100%+10px)] top-1/2 z-20 hidden -translate-y-1/2
                 whitespace-nowrap rounded-md border border-white/15 bg-[#14211B] px-2.5 py-1.5
                 text-[12px] font-semibold text-cream opacity-0 shadow-lg transition-opacity
                 group-hover:opacity-100 lg:block"
    >
      {label}
    </span>
  );
}

/** Keys under `shell:nav.items`. Held as keys, not words, so the nav reads in the current language. */
type NavLabel =
  | 'demoGuide' | 'dashboard' | 'myTasks' | 'campground' | 'compliance' | 'assets' | 'building'
  | 'kitchen' | 'askKitchen' | 'pool' | 'retreats' | 'trips' | 'receipts' | 'campInfo' | 'team'
  | 'securityPrivacy';

type NavSection = 'today' | 'facilities' | 'commissary' | 'aquatics' | 'retreats' | 'logistics' | 'finance';

interface NavItem {
  path: string;
  label: NavLabel;
  icon: LucideIcon;
  end: boolean;
  /**
   * Which module has to be on for this to exist. Omitted for the parts of the app nobody can
   * switch off. This used to be absent entirely, which is why a camp could turn Kitchen
   * Manager off in Camp Info and keep looking at it in the sidebar every day.
   */
  module?: ModuleKey;
}

const demoGuideItem: NavItem = { path: '/demo-guide', label: 'demoGuide', icon: Sparkles, end: true };

const todayItems: NavItem[] = [
  { path: '/home', label: 'dashboard', icon: LayoutDashboard, end: true, module: 'dashboard' },
  { path: '/my-tasks', label: 'myTasks', icon: CheckSquare, end: false, module: 'tasks' },
];

const facilityItems: NavItem[] = [
  // Renamed from "Issues & Repairs" 2026-09-02. Once housekeeping, retreat set-ups, turnovers and
  // routines all land here, "repairs" describes a quarter of the content — and "Campground" is
  // the camp's own word for the physical place. The TABLE is still `issues` and the module key is
  // still `issues_repairs`: the word on the screen is the product, the word in Postgres is
  // plumbing, and renaming a table thirteen surfaces read from buys nothing.
  { path: '/campground', label: 'campground', icon: Wrench, end: false, module: 'issues' },
  // The old Safety module was folded in here: its records are reached from the Requirements tab,
  // grouped by the party that asks for them, and its dialogs open in place. The /safety route
  // still resolves so old links and bookmarks keep working.
  //
  // Named just "Compliance". It absorbed Safety rather than sitting beside it, and a camp opening
  // this looks for the thing the county asks about, not for two words joined by an ampersand.
  { path: '/compliance', label: 'compliance', icon: ClipboardCheck, end: false, module: 'safety' },
  { path: '/assets', label: 'assets', icon: Truck, end: false, module: 'assets' },
  { path: '/building', label: 'building', icon: Building2, end: false, module: 'building' },
];

const commissaryItems: NavItem[] = [
  { path: '/commissary', label: 'kitchen', icon: UtensilsCrossed, end: false, module: 'commissary' },
  // For the people who ASK the kitchen (program leads), who should not have to find a form inside
  // the kitchen's own inventory screens. Named for what it does: as "Food requests" the kitchen
  // opened it looking for the inbox of requests to approve, which lives in Kitchen Manager.
  { path: '/food-requests', label: 'askKitchen', icon: ShoppingBasket, end: false, module: 'commissary' },
];

const aquaticsItems: NavItem[] = [
  { path: '/pool', label: 'pool', icon: Waves, end: false, module: 'pool' },
];

const retreatItems: NavItem[] = [
  { path: '/retreats', label: 'retreats', icon: CalendarRange, end: false, module: 'retreats' },
];

// Town Trips is sold to particular camps (defaultOn: false), so for most camps this section is
// filtered to nothing and disappears.
const logisticsItems: NavItem[] = [
  { path: '/trips', label: 'trips', icon: Car, end: false, module: 'trips' },
];

const financeItems: NavItem[] = [
  { path: '/receipts', label: 'receipts', icon: ReceiptText, end: false, module: 'receipts' },
];

const settingsItems: NavItem[] = [
  { path: '/settings', label: 'campInfo', icon: Settings, end: true },
  { path: '/settings/team', label: 'team', icon: Settings, end: false },
  // The camp's people and their certifications. Reference data read by Safety, Compliance and
  // Pool alike, so it sits with the rest of the camp's settings rather than inside the one
  // module that happened to still have a screen after the safety pages were folded in.
  { path: '/settings/security', label: 'securityPrivacy', icon: ShieldCheck, end: false },
];

interface SidebarProps {
  /** Drawer state below `lg`. Ignored at desktop widths, where the sidebar is always shown. */
  open?: boolean;
  onClose?: () => void;
  /** Rail mode: icons only. Desktop-only. The drawer is always full width on a phone. */
  collapsed?: boolean;
}

export function Sidebar({ open = false, onClose, collapsed = false }: SidebarProps) {
  const { t } = useTranslation(['shell', 'common']);
  const { currentUser, role, roleLabel, canAccessModule } = useAuth();
  const modules = useModules();
  const { currentCamp } = useCampStore();
  const signOut = useAuthStore((s) => s.signOut);

  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      // Redirect in `finally`: leaving the app is the point, so it must happen even if the
      // store's sign-out threw. On the product host "/" is the login page, so sign-outs go to
      // the marketing site; everywhere else (staging, preview, local) "/" is the landing page.
      // Matched against the configured host, so staging returns to staging.
      window.location.href = window.location.hostname === APP_HOST ? MARKETING_ORIGIN : '/';
    }
  }

  const location = useLocation();
  useEffect(() => { onClose?.(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Two independent filters, and the second one is the one that was missing.
  //
  // Who you are: staff see every module the camp has; only a viewer is held out. Crews used to
  // gate this per module, which meant a camp had to decide whether the groundskeeper may open
  // the pool page.
  //
  // What the camp has: the module's own switch — the platform's, folded with the camp's own.
  // A section with nothing left in it disappears rather than sitting there as a heading over
  // empty space.
  const visible = (items: NavItem[]) => (
    canAccessModule() ? items.filter((i) => !i.module || modules.enabled(i.module)) : []
  );

  // A demo camp's first nav item is the guide written for the prospect, so the page they landed
  // on is one click away from anywhere they wander.
  const isDemoCamp = currentCamp?.accountType === 'trial' || currentCamp?.accountType === 'demo';
  const demoBrief = useDemoBrief(currentCamp?.id, isDemoCamp);
  const navSections = [
    // Today's pages follow the camp's switches but not the viewer rule: a viewer still has a
    // dashboard.
    { section: 'today' as NavSection, items: [
      ...(demoBrief ? [demoGuideItem] : []),
      ...todayItems.filter((i) => !i.module || modules.enabled(i.module)),
    ] },
    { section: 'facilities' as NavSection, items: visible(facilityItems) },
    { section: 'commissary' as NavSection, items: visible(commissaryItems) },
    { section: 'aquatics' as NavSection, items: visible(aquaticsItems) },
    { section: 'retreats' as NavSection, items: visible(retreatItems) },
    { section: 'logistics' as NavSection, items: visible(logisticsItems) },
    { section: 'finance' as NavSection, items: visible(financeItems) },
  ].filter((s) => s.items.length > 0);

  return (
    <>
      {/* Tap-to-dismiss scrim. Only exists while the drawer is open below `lg`. */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[1px] lg:hidden"
          aria-hidden="true"
        />
      )}
      {/* No `relative` here. It was added beside `fixed` on 2026-08-22 and, because Tailwind emits
          `relative` after `fixed`, it won: below `lg` the off-canvas drawer stayed in the flex row
          and every page on a phone was pushed 228px right into a sliver of the screen. `fixed` and
          `lg:sticky` are both positioned, which is all the contours layer inside needs. */}
      <aside
        aria-label={t('nav.label')}
        className={`h-screen bg-forest flex flex-col flex-shrink-0 overflow-hidden
          fixed inset-y-0 start-0 z-50 transition-transform duration-200 ease-out
          w-sidebar min-w-sidebar
          ${open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'}
          lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 lg:rtl:translate-x-0
          lg:transition-[width,min-width] lg:duration-300 lg:ease-out
          ${collapsed ? 'lg:w-rail lg:min-w-rail' : ''}`}
      >
      <SidebarContours />
      <div className={`relative pt-5 pb-3.5 ${collapsed ? 'lg:px-0 lg:justify-center px-5' : 'px-5'}`}>
        <div className={`flex items-center gap-2.5 ${collapsed ? 'lg:justify-center' : ''}`}>
          <CampCommandMark size={30} disc={CC_CREAM} ink={CC_GREEN} decorative className="flex-shrink-0" />
          <span className={`font-display text-[17px] font-bold tracking-tight text-side-strong whitespace-nowrap
                            ${collapsed ? 'lg:hidden' : ''}`}>
            CampCommand
          </span>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto overflow-x-hidden">
        {navSections.map((section) => (
          <div key={section.section} className="mb-2">
            {collapsed ? (
              <div className="mx-auto my-1.5 h-px w-6 bg-white/15 lg:block hidden" />
            ) : null}
            <p className={`text-[9.5px] font-bold uppercase tracking-[0.16em] text-side-dim px-[18px] pt-2.5 pb-1
                           ${collapsed ? 'lg:hidden' : ''}`}>
              {t(`nav.sections.${section.section}`)}
            </p>
            {section.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  navClass(isActive, collapsed)
                }
              >
                <item.icon className={`flex-shrink-0 ${collapsed ? 'w-[18px] h-[18px]' : 'w-4 h-4'}`} />
                <span className={collapsed ? 'lg:hidden' : ''}>{t(`nav.items.${item.label}`)}</span>
                {collapsed && <RailTip label={t(`nav.items.${item.label}`)} />}
              </NavLink>
            ))}
          </div>
        ))}

        {role === 'admin' && (
          <div className="mb-2">
            {collapsed ? (
              <div className="mx-auto my-1.5 h-px w-6 bg-white/15 lg:block hidden" />
            ) : null}
            <p className={`text-[9.5px] font-bold uppercase tracking-[0.16em] text-side-dim px-[18px] pt-2.5 pb-1
                           ${collapsed ? 'lg:hidden' : ''}`}>
              {t('nav.sections.settings')}
            </p>
            {settingsItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  navClass(isActive, collapsed)
                }
              >
                <Settings className={`flex-shrink-0 ${collapsed ? 'w-[18px] h-[18px]' : 'w-4 h-4'}`} />
                <span className={collapsed ? 'lg:hidden' : ''}>{t(`nav.items.${item.label}`)}</span>
                {collapsed && <RailTip label={t(`nav.items.${item.label}`)} />}
              </NavLink>
            ))}
          </div>
        )}

      </div>

      <div className={`relative border-t border-white/[0.13] py-4 ${collapsed ? 'lg:px-0 px-5' : 'px-5'}`}>
        <div className={`group relative flex items-center gap-2.5 ${collapsed ? 'lg:justify-center' : ''}`}>
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-forest-mid
                           text-[10.5px] font-bold text-side-strong">
            {currentUser.initials}
          </span>
          <span className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <b className="block truncate font-display text-[13px] font-semibold text-side-strong">
              {currentCamp?.name ?? ''}
            </b>
            <span className="block truncate text-[11px] text-side-dim">{t('nav.userLine', { name: currentUser.name, role: roleLabel })}</span>
          </span>
          {collapsed && <RailTip label={t('nav.railUser', { camp: currentCamp?.name ?? '', name: currentUser.name })} />}
        </div>
        <div className={`flex items-center gap-3 mt-3 ${collapsed ? 'lg:hidden' : ''}`}>
          {role !== 'admin' && (
            <NavLink
              to="/settings/security"
              className="flex items-center gap-1.5 text-[11px] text-side-dim hover:text-side-strong transition-colors"
            >
              <Lock className="w-3 h-3" />
              {t('nav.security')}
            </NavLink>
          )}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-1.5 text-[11px] text-side-dim hover:text-side-strong transition-colors disabled:cursor-wait"
          >
            <LogOut className="w-3 h-3" />
            {signingOut ? t('nav.signingOut') : t('common:actions.signOut')}
          </button>
        </div>
        {/* The language is the person's, so it sits with the person: reachable on a desktop and in
            the phone drawer alike. Hidden in rail mode, where there is no room for a word. */}
        <LanguagePicker tone="dark" className={`mt-3 ${collapsed ? 'lg:hidden' : ''}`} />
      </div>
      </aside>
    </>
  );
}
