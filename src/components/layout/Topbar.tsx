import { useAuth } from '@/lib/auth';

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions }: Props) {
  const { currentUser } = useAuth();

  return (
    <div className="bg-white border-b border-border px-4 sm:px-7 py-3 sm:py-4 flex items-center justify-between gap-3 flex-shrink-0">
      <div className="min-w-0">
        <h1 className="text-[16px] sm:text-[18px] font-semibold text-forest leading-tight truncate">{title}</h1>
        {subtitle && (
          <p className="text-[12px] text-forest/50 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {actions}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-forest text-cream text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
            {currentUser.initials}
          </div>
          {/* The name is redundant next to the avatar once space is tight. */}
          <span className="hidden md:inline text-[12px] font-medium text-forest/70">{currentUser.name}</span>
        </div>
      </div>
    </div>
  );
}
