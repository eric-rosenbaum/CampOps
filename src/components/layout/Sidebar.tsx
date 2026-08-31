import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Wrench, ClipboardList,
  Waves, ShieldCheck, Truck, Building2, UtensilsCrossed, Settings, LogOut, CalendarRange, Lock,
  ClipboardCheck, Users,
} from 'lucide-react';
import { SidebarContours } from '@/components/shared/SidebarContours';
import { CampCommandMark, CC_CREAM, CC_GREEN } from '@/components/shared/CampCommandMark';
import { useAuth } from '@/lib/auth';
import { useCampStore } from '@/store/campStore';
import { useAuthStore } from '@/store/authStore';
import type { StaffGroupModules } from '@/store/campStore';
import { APP_HOST, MARKETING_ORIGIN } from '@/lib/env';

type LucideIcon = React.ComponentType<{ className?: string }>;

/**
 * The active item is a paper cut-out of the sidebar with an ember edge, rather than a tinted
 * block. It reads as the page you are standing in continuing under the nav.
 */
function navClass(isActive: boolean, collapsed: boolean): string {
  const base = collapsed
    ? 'group relative flex items-center justify-center mx-2 mb-0.5 py-2 rounded-btn transition-colors'
    : 'group relative flex items-center gap-2.5 py-[7px] pr-2 mb-px text-[14px] transition-colors border-l-[3px]';
  if (isActive) {
    return collapsed
      ? `${base} bg-cream text-forest`
      : `${base} bg-cream text-forest border-red font-bold pl-[15px]`;
  }
  return collapsed
    ? `${base} text-side hover:bg-white/[0.07] hover:text-side-strong`
    : `${base} text-side border-transparent pl-[15px] hover:bg-white/[0.07] hover:text-side-strong`;
}

/** Tooltip shown only in rail mode, where the label is hidden. */
function RailTip({ label }: { label: string }) {
  return (
    <span
      className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 hidden -translate-y-1/2
                 whitespace-nowrap rounded-md border border-white/15 bg-[#14211B] px-2.5 py-1.5
                 text-[12px] font-semibold text-cream opacity-0 shadow-lg transition-opacity
                 group-hover:opacity-100 lg:block"
    >
      {label}
    </span>
  );
}

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  end: boolean;
  module?: keyof StaffGroupModules;
}

const todayItems: NavItem[] = [
  { path: '/home', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { path: '/my-tasks', label: 'My Tasks', icon: CheckSquare, end: false },
];

const facilityItems: NavItem[] = [
  { path: '/issues', label: 'Issues & Repairs', icon: Wrench, end: false, module: 'issues_repairs' },
  { path: '/pre-post', label: 'Pre/Post Camp', icon: ClipboardList, end: false, module: 'pre_post' },
  // Safety & Compliance was folded into Permit & Compliance: its records are now reached from
  // "Your records", grouped by the party that asks for them, and its dialogs open in place. The
  // /safety route still resolves so old links and bookmarks keep working.
  { path: '/compliance', label: 'Safety & Compliance', icon: ClipboardCheck, end: false, module: 'safety' },
  { path: '/assets', label: 'Assets & Vehicles', icon: Truck, end: false, module: 'assets' },
  { path: '/building', label: 'Building Systems', icon: Building2, end: false, module: 'building_systems' },
];

const commissaryItems: NavItem[] = [
  { path: '/commissary', label: 'Kitchen Manager', icon: UtensilsCrossed, end: false, module: 'commissary' },
];

const aquaticsItems: NavItem[] = [
  { path: '/pool', label: 'Pool Manager', icon: Waves, end: false, module: 'pool' },
];

const retreatItems: NavItem[] = [
  { path: '/retreats', label: 'Retreat Manager', icon: CalendarRange, end: false, module: 'retreats' },
];

const settingsItems: NavItem[] = [
  { path: '/settings', label: 'Camp Info', icon: Settings, end: true },
  { path: '/settings/team', label: 'Team', icon: Settings, end: false },
  // The camp's people and their certifications. Reference data read by Safety, Compliance and
  // Pool alike, so it sits with the rest of the camp's settings rather than inside the one
  // module that happened to still have a screen after the safety pages were folded in.
  { path: '/settings/staff', label: 'Staff & Certifications', icon: Users, end: false },
  { path: '/settings/security', label: 'Security & Privacy', icon: ShieldCheck, end: false },
];

interface SidebarProps {
  /** Drawer state below `lg`. Ignored at desktop widths, where the sidebar is always shown. */
  open?: boolean;
  onClose?: () => void;
  /** Rail mode: icons only. Desktop-only. The drawer is always full width on a phone. */
  collapsed?: boolean;
}

export function Sidebar({ open = false, onClose, collapsed = false }: SidebarProps) {
  const { currentUser, role, roleLabel, canAccessModule } = useAuth();
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

  // A section only exists if the staff member can reach something inside it, so a kitchen
  // hand does not see an empty "Aquatics" heading.
  const visible = (items: NavItem[]) => items.filter((i) => !i.module || canAccessModule(i.module));

  const navSections = [
    { section: 'Today', items: todayItems },
    { section: 'Facilities', items: visible(facilityItems) },
    { section: 'Commissary', items: visible(commissaryItems) },
    { section: 'Aquatics', items: visible(aquaticsItems) },
    { section: 'Retreats', items: visible(retreatItems) },
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
      <aside
        className={`relative h-screen bg-forest flex flex-col flex-shrink-0 overflow-hidden
          fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out
          w-sidebar min-w-sidebar
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:sticky lg:top-0 lg:z-auto lg:translate-x-0
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
              {section.section}
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
                <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                {collapsed && <RailTip label={item.label} />}
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
              Settings
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
                <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                {collapsed && <RailTip label={item.label} />}
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
            <span className="block truncate text-[11px] text-side-dim">{currentUser.name} · {roleLabel}</span>
          </span>
          {collapsed && <RailTip label={`${currentCamp?.name ?? ''} · ${currentUser.name}`} />}
        </div>
        <div className={`flex items-center gap-3 mt-3 ${collapsed ? 'lg:hidden' : ''}`}>
          {role !== 'admin' && (
            <NavLink
              to="/settings/security"
              className="flex items-center gap-1.5 text-[11px] text-side-dim hover:text-side-strong transition-colors"
            >
              <Lock className="w-3 h-3" />
              Security
            </NavLink>
          )}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-1.5 text-[11px] text-side-dim hover:text-side-strong transition-colors disabled:cursor-wait"
          >
            <LogOut className="w-3 h-3" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}
