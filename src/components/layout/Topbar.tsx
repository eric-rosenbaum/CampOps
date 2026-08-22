import { useAuth } from '@/lib/auth';
import { useUIStore } from '@/store/uiStore';

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /**
   * Drop the bottom rule when the page continues the header itself — a stat band or a toolbar
   * directly below — so the whole block reads as one sheet rather than stacked strips.
   */
  flush?: boolean;
}

/**
 * The rail toggle. Its icon is the panel glyph from the style reference: the filled bar
 * shrinks and fades as the sidebar collapses, so the control shows the state it is about to
 * leave rather than needing a label.
 */
function RailToggle() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  return (
    <button
      onClick={toggle}
      aria-expanded={!collapsed}
      title={`${collapsed ? 'Show' : 'Hide'} sidebar  [`}
      className="hidden lg:grid h-[30px] w-[30px] flex-none place-items-center rounded-btn border
                 border-transparent text-ink-soft transition-colors hover:border-border
                 hover:bg-cream hover:text-forest"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
        <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect
          x="4.9" y="6.3" width="5.2" height="11.4" rx="1.6"
          fill="currentColor"
          className={`origin-left transition-all duration-300 ${collapsed ? 'opacity-40 scale-x-[0.55]' : 'opacity-90'}`}
        />
      </svg>
      <span className="sr-only">{collapsed ? 'Show sidebar' : 'Hide sidebar'}</span>
    </button>
  );
}

export function Topbar({ title, subtitle, actions, flush = false }: Props) {
  const { currentUser } = useAuth();

  return (
    <div className={`bg-paper-raised px-4 sm:px-7 pt-4 pb-3 sm:pt-5 sm:pb-3.5 flex items-center gap-3 flex-shrink-0 ${flush ? '' : 'border-b border-border'}`}>
      <RailToggle />
      <div className="min-w-0">
        <h1 className="font-display text-[20px] sm:text-[27px] font-bold tracking-[-0.015em] text-forest leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="font-display italic text-[12px] sm:text-[13.5px] text-ink-soft mt-0.5 truncate">
            {subtitle}
          </p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {actions}
        <div className="flex items-center gap-2">
          <div className="grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full bg-sage text-[11px] font-bold text-paper-raised">
            {currentUser.initials}
          </div>
          {/* The name is redundant next to the avatar once space is tight. */}
          <span className="hidden md:inline text-[12px] font-medium text-ink-soft">{currentUser.name}</span>
        </div>
      </div>
    </div>
  );
}
