import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder }: Props) {
  const { t } = useTranslation('shell');
  return (
    <div className="relative w-full sm:w-auto">
      <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-ink-soft" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('search.placeholder')}
        className="w-full sm:w-52 rounded-btn border border-border bg-white py-[7px] ps-8 pe-3 text-[13px]
                   text-ink placeholder:text-ink-faint focus:border-sage focus:outline-none"
      />
    </div>
  );
}
