import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ENDONYM, LANGUAGES, type Lang } from '@/i18n';
import { setLanguage, useLang } from '@/lib/language';

interface Props {
  /** `dark` sits on the forest sidebar; `light` on paper (login, settings). */
  tone?: 'light' | 'dark';
  className?: string;
}

/**
 * Each option is written in its own language and script. A Hebrew speaker looking at an English
 * screen is scanning for "עברית", not for the English word "Hebrew".
 */
export function LanguagePicker({ tone = 'light', className = '' }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const skin = tone === 'dark'
    ? 'bg-white/5 border-white/15 text-cream/85 hover:bg-white/10'
    : 'bg-paper-raised border-border text-ink hover:border-sage';
  return (
    <label className={`relative inline-flex items-center gap-1.5 rounded-btn border px-2 py-1 text-[12px] ${skin} ${className}`}>
      <Languages className="h-3.5 w-3.5 flex-none opacity-80" aria-hidden="true" />
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={lang}
        onChange={(e) => void setLanguage(e.target.value as Lang)}
        className="cursor-pointer bg-transparent pe-1 outline-none [&>option]:text-ink"
        aria-label={t('language.label')}
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l} lang={l}>{ENDONYM[l]}</option>
        ))}
      </select>
    </label>
  );
}
