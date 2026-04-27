import { useAuth } from '@/lib/auth';

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions }: Props) {
  const { currentUser } = useAuth();

  return (
    <div className="bg-white border-b border-border px-7 py-4 flex items-center justify-between flex-shrink-0">
      <div>
        <h1 className="text-[18px] font-semibold text-forest leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-[12px] text-forest/50 mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-forest text-cream text-[11px] font-semibold flex items-center justify-center">
            {currentUser.initials}
          </div>
          <span className="text-[12px] font-medium text-forest/70">{currentUser.name}</span>
        </div>
      </div>
    </div>
  );
}
