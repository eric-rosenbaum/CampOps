// A description written once and pointed at as many rooms as it fits.
//
// A coordinator picking between "Cabin 1" and "Cabin 7" had a name and a bed count and nothing
// else, and the camp had no way to say that one is a heated lodge room and the other is a
// screened summer cabin. Twenty identical cabins should not mean pasting the same paragraph
// twenty times: edit the saved description and every room using it changes.
//
// Lives in Camp Info > Locations, beside the rooms it describes -- it used to sit inside a
// modal buried in one retreat, where a camp setting up its site would never find it.
import { useState } from 'react';
import { useScreenTranslation } from '@/components/i18n/untranslated';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { supabase } from '@/lib/supabase';
import { useCampStore } from '@/store/campStore';
import { generateId } from '@/lib/utils';
import type { CabinType } from '@/lib/types';
import { useCabinTypes } from './useCabinTypes';

const inputClass = 'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-[12px] font-medium text-ink mb-1';


export function SavedDescriptions({ canManage }: { canManage: boolean }) {
  // Screen-aware: Retreats, which is not translated yet, can open this too.
  const { t } = useScreenTranslation('campInfo');
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const [types, refresh] = useCabinTypes();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!campId || !name.trim()) return;
    setBusy(true); setError(null);
    const { error: err } = await supabase.from('camp_cabin_types').insert({
      id: generateId(), camp_id: campId, name: name.trim(), description: description.trim(),
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setName(''); setDescription(''); setAdding(false); refresh();
  }

  async function save(ct: CabinType, patch: Partial<CabinType>) {
    await supabase.from('camp_cabin_types')
      .update({ name: patch.name ?? ct.name, description: patch.description ?? ct.description,
                updated_at: new Date().toISOString() })
      .eq('id', ct.id);
    refresh();
  }

  async function remove(ct: CabinType) {
    // Cabins pointing at it are set back to no type by the FK, not deleted.
    await supabase.from('camp_cabin_types').delete().eq('id', ct.id);
    refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-[13px] font-semibold text-forest">{t('descriptions.title')}</h3>
        {canManage && !adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> {t('descriptions.addOne')}
          </Button>
        )}
      </div>
      <p className="text-[12px] text-ink-soft mb-3">
        {t('descriptions.intro')}
      </p>

      {adding && (
        <div className="rounded-card border border-border bg-cream-dark/40 px-3.5 py-3 mb-3 space-y-2.5">
          <div>
            <label className={labelClass}>{t('locations.name')}</label>
            <input
              autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('descriptions.namePlaceholder')} className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('descriptions.whatToKnow')}</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder={t('descriptions.placeholder')}
              className={`${inputClass} resize-y`}
            />
          </div>
          {error && <p className="text-[11.5px] text-red">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void create()} disabled={busy || !name.trim()}>{t('descriptions.add')}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setError(null); }}>{t('descriptions.cancel')}</Button>
          </div>
        </div>
      )}

      {types.length === 0 && !adding ? (
        <p className="text-[12.5px] text-ink-faint">
          {t('descriptions.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {types.map((ct) => (
            <li key={ct.id} className="rounded-card border border-border bg-white px-3.5 py-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    defaultValue={ct.name} disabled={!canManage}
                    onBlur={(e) => { if (e.target.value.trim() !== ct.name) void save(ct, { name: e.target.value.trim() }); }}
                    className="w-full text-[13px] font-semibold text-forest bg-transparent focus:outline-none"
                  />
                  <textarea
                    defaultValue={ct.description} disabled={!canManage} rows={2}
                    onBlur={(e) => { if (e.target.value !== ct.description) void save(ct, { description: e.target.value }); }}
                    placeholder={t('descriptions.whatToKnow')}
                    className={`${inputClass} resize-y text-[12.5px]`}
                  />
                </div>
                {canManage && (
                  <button
                    type="button" onClick={() => void remove(ct)}
                    title={t('descriptions.delete')}
                    aria-label={t('descriptions.delete')}
                    className="p-1.5 text-ink-faint hover:text-red flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
