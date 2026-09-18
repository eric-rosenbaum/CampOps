import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  /**
   * Actions that stay put while the body scrolls.
   *
   * A real footer outside the scrollport rather than a `sticky` row inside one: sticky sits at
   * the bottom of the scroll area, which is the padding edge, so the container's bottom padding
   * scrolls content through the strip underneath it and the bar looks like it is floating over a
   * half-drawn page.
   */
  footer?: React.ReactNode;
}

export function Modal({ title, onClose, children, width = '440px', footer }: Props) {
  const { t } = useTranslation();
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-modal shadow-xl flex flex-col max-h-[90vh]"
        style={{ width }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold text-forest">{title}</h2>
          <button
            onClick={onClose}
            aria-label={t('actions.close')}
            className="text-ink-faint hover:text-forest transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer && (
          <div className="flex-shrink-0 rounded-b-modal border-t border-border bg-white px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
