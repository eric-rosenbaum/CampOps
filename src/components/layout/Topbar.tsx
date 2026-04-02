import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { SEED_USERS } from '@/lib/seedData';
import { ChevronDown } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions }: Props) {
  const { currentUserId, setCurrentUser } = useUIStore();
  const currentUser = SEED_USERS.find((u) => u.id === currentUserId) ?? SEED_USERS[0];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(id: string) {
    setCurrentUser(id);
    setOpen(false);
  }

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
        {/* User switcher */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-btn border border-border hover:border-forest/30 transition-colors cursor-pointer"
          >
            <div className="w-6 h-6 rounded-full bg-forest text-cream text-[10px] font-semibold flex items-center justify-center">
              {currentUser.initials}
            </div>
            <span className="text-[12px] font-medium text-forest/70">{currentUser.name}</span>
            <ChevronDown className={`w-3 h-3 text-forest/40 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-card shadow-lg py-1 w-52 z-10">
              {SEED_USERS.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelect(user.id)}
                  className={`w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 hover:bg-cream transition-colors cursor-pointer ${
                    user.id === currentUserId ? 'text-forest font-medium' : 'text-forest/70'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-forest text-cream text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                    {user.initials}
                  </div>
                  <div>
                    <p className="text-[12px] font-medium leading-tight">{user.name}</p>
                    <p className="text-[10px] text-forest/45 capitalize">{user.role.replace('_', ' ')}</p>
                  </div>
                  {user.id === currentUserId && (
                    <span className="ml-auto text-sage text-[10px]">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
