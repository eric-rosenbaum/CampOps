import { LanguagePicker } from '@/components/i18n/LanguagePicker';
import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/utils';
import { Plus, X, Pencil, Calendar, Sun, Copy, Check, Upload, CornerDownRight, ChevronDown, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCampStore } from '@/store/campStore';
import { AgreementTemplateEditor } from '@/components/retreats/AgreementTemplateEditor';
import { useChecklistStore } from '@/store/checklistStore';
import { useLocationStore } from '@/store/locationStore';
import { SavedDescriptions } from '@/components/rooming/SavedDescriptions';
import { useCabinTypes } from '@/components/rooming/useCabinTypes';
import { useCampgroundStore } from '@/store/campgroundStore';
import { ImplementationDropzone, ImplementationFilesTab } from '@/components/settings/ImplementationFiles';
import { StaffRosterTab } from '@/pages/settings/StaffRegister';
import { usePoolStore } from '@/store/poolStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { AddEditPoolModal } from '@/components/pool/AddEditPoolModal';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import type { Season, CampLocation } from '@/lib/types';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { PaymentsCard } from '@/components/settings/PaymentsCard';
import { useModules, MODULE_KEYS } from '@/lib/modules';
import { PrintLabelsModal } from '@/components/qr/PrintLabelsModal';

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = 'profile' | 'season' | 'staff' | 'locations' | 'pools' | 'rentals' | 'payments' | 'files';

// Labels are read through t(`tabs.${id}`) at render, so the tab list stays language-free.
const TABS: { id: TabId }[] = [
  { id: 'profile' },
  { id: 'season' },
  // Reference data every module reads -- drills and certifications in Safety, the three named
  // directors on the permit forms, lifeguard cover in Pool Manager. It was its own sidebar entry,
  // which made one consumer look like the owner.
  { id: 'staff' },
  { id: 'locations' },
  { id: 'pools' },
  // Stripe Connect. Sits in camp settings rather than inside Retreats because connecting an
  // account is a thing the camp does once, about itself, not about any one group.
  { id: 'rentals' },
  { id: 'payments' },
  { id: 'files' },
];

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls = 'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
// Same as inputCls but without w-full. Use when the field's width is controlled by flex (side-by-side rows),
// since a baked-in w-full beats flex-1/w-40 in Tailwind's stylesheet order and collapses the layout.
const fieldCls = 'text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelCls = 'block text-[12px] font-medium text-ink-soft mb-1';
const cardCls  = 'bg-white border border-border rounded-xl p-5';

// ── Constants ─────────────────────────────────────────────────────────────────

// The stored value is the English phrase; only the option's label is translated.
const CAMP_TYPES = [
  { value: 'Day Camp', key: 'day' },
  { value: 'Overnight Camp', key: 'overnight' },
] as const;
const US_STATES  = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];
// The module list lives in lib/modules.ts now, next to the rule that reads it, so this screen
// and the sidebar can never disagree about which modules exist or what they are called.
//
// NOTE: camp.modules uses short keys; StaffGroupModules uses long ones ('building_systems').
// Inconsistent, but load-bearing: match, don't refactor.

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { t } = useTranslation(['campInfo', 'common']);
  const { currentCamp, updateCamp } = useCampStore();
  const { role } = useAuth();
  // Only what the platform sells this camp. A module the founder switched off is not rendered
  // here as a disabled row with a padlock -- it is absent, so the camp never learns it exists
  // and never asks why they cannot have it.
  const { allowedModules } = useModules();
  const [name, setName]       = useState('');
  const [campType, setCampType] = useState('');
  const [state, setState]     = useState('');
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    if (!currentCamp) return;
    setName(currentCamp.name);
    setCampType(currentCamp.campType ?? '');
    setState(currentCamp.state ?? '');
    // Absent means on (see lib/modules.ts), so the form is seeded with an explicit answer for
    // every key. Without this a camp that had never saved this screen would see every toggle
    // dark while every module was live, and turning one ON would look like a no-op.
    const stored = currentCamp.modules ?? {};
    setModules(Object.fromEntries(
      MODULE_KEYS.map((k) => [k, stored[k] !== false]),
    ));
  }, [currentCamp]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentCamp) return;
    setSaving(true);
    try {
      await updateCamp(currentCamp.id, { name, campType, state, modules });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (!currentCamp) return null;

  return (
    <div className="p-7 max-w-2xl space-y-5">
      {/* Where people looked for it first. It is the person's setting, not the camp's, so it
          saves on its own the moment it changes rather than waiting for the camp form's Save. */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold text-forest">{t('profile.language.title')}</h2>
            <p className="mt-1 text-[12px] text-ink-soft">{t('profile.language.body')}</p>
          </div>
          <LanguagePicker />
        </div>
      </div>
      <form onSubmit={handleSave} className="space-y-5">
        <div className={cardCls}>
          <h2 className="text-[13px] font-semibold text-forest mb-4">{t('profile.title')}</h2>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>{t('profile.campName')}</label>
              <input
                type="text" required value={name}
                onChange={e => setName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('profile.campType')}</label>
                <select value={campType} onChange={e => setCampType(e.target.value)} className={inputCls}>
                  <option value="">{t('profile.selectType')}</option>
                  {CAMP_TYPES.map(ct => <option key={ct.value} value={ct.value}>{t(`profile.campTypes.${ct.key}`)}</option>)}
                  {/* A value saved before these two existed still shows, as the camp wrote it. */}
                  {campType && !CAMP_TYPES.some(ct => ct.value === campType) && <option value={campType}>{campType}</option>}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('profile.state')}</label>
                <select value={state} onChange={e => setState(e.target.value)} className={inputCls}>
                  <option value="">{t('profile.selectState')}</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className={cardCls}>
          <h2 className="text-[13px] font-semibold text-forest mb-1">{t('profile.modules.title')}</h2>
          <p className="text-[11px] text-ink-faint mb-4">{t('profile.modules.body')}</p>
          <div className="space-y-3">
            {allowedModules.map(mod => (
              <div
                key={mod.key}
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setModules(p => ({ ...p, [mod.key]: !p[mod.key] }))}
              >
                <div className={`w-9 h-5 rounded-full flex-shrink-0 flex items-center transition-colors ${modules[mod.key] ? 'bg-forest' : 'bg-cream-dark'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${modules[mod.key] ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0'}`} />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-forest">{t(`modules.${mod.key}.label`)}</p>
                  <p className="text-[11px] text-ink-faint">{t(`modules.${mod.key}.desc`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit" disabled={saving}
            className="bg-forest text-cream text-[13px] font-medium px-5 py-2 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
          >
            {saving ? t('common:actions.saving') : t('saveChanges')}
          </button>
          {saved && <span className="text-[12px] text-sage font-medium">✓ {t('saved')}</span>}
        </div>
      </form>

      {role === 'admin' && currentCamp?.slug && (() => {
        const reportUrl = `${window.location.origin}/report/${currentCamp.slug}`;
        function copyUrl() {
          void navigator.clipboard.writeText(reportUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
        return (
          <div className={cardCls}>
            <h2 className="text-[13px] font-semibold text-forest mb-1">{t('profile.report.title')}</h2>
            <p className="text-[12px] text-ink-faint mb-3">{t('profile.report.body')}</p>
            <div className="flex items-center gap-2 bg-cream border border-border rounded-btn px-3 py-2">
              <Link
                to={`/report/${currentCamp.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="flex-1 text-[12px] text-ink font-mono truncate hover:text-forest transition-colors"
              >
                {reportUrl}
              </Link>
              <button
                type="button"
                onClick={copyUrl}
                className="flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-forest transition-colors flex-shrink-0 px-1.5 py-0.5 rounded hover:bg-cream-dark"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-sage" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Season tab ────────────────────────────────────────────────────────────────

type SeasonMode = 'view' | 'edit' | 'new';

interface SeasonFormValues {
  name: string;
  openingDate: string;
  closingDate: string;
  acaInspectionDate: string;
}

function SeasonTab() {
  const { t } = useTranslation(['campInfo', 'common']);
  const { season, editSeason } = useChecklistStore();
  const [mode, setMode] = useState<SeasonMode>('view');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SeasonFormValues>();

  function startEdit() {
    reset({
      name:              season?.name ?? '',
      openingDate:       season?.openingDate ?? '',
      closingDate:       season?.closingDate ?? '',
      acaInspectionDate: season?.acaInspectionDate ?? '',
    });
    setMode('edit');
  }

  function startNew() {
    reset({ name: '', openingDate: '', closingDate: '', acaInspectionDate: '' });
    setMode('new');
  }

  function onSubmit(data: SeasonFormValues) {
    const s: Season = {
      id:                mode === 'edit' ? (season?.id ?? crypto.randomUUID()) : crypto.randomUUID(),
      name:              data.name,
      openingDate:       data.openingDate,
      closingDate:       data.closingDate,
      acaInspectionDate: data.acaInspectionDate || null,
    };
    // Editing and starting a new season are the same write now. Starting one used to also
    // reset every Pre/Post Camp task; that module is gone.
    editSeason(s);
    setMode('view');
  }

  function fmt(d: string | null | undefined) {
    if (!d) return '-';
    try { return formatDate(d); } catch { return d; }
  }

  // ── Form (edit / new) ─────────────────────────────────────────────────────

  if (mode !== 'view') {
    return (
      <div className="p-7 max-w-xl">
        <div className={cardCls}>
          <h2 className="text-[14px] font-semibold text-forest mb-4">
            {mode === 'new' ? t('season.startNew') : t('season.edit')}
          </h2>

          {mode === 'new' && (
            <div className="bg-amber-bg border border-amber/20 rounded-btn px-3 py-2.5 text-[12px] text-amber-text mb-4">
              {t('season.newWarning')}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className={labelCls}>{t('season.name')} *</label>
              <input
                {...register('name', { required: t('required') })}
                className={inputCls}
                placeholder={t('season.namePlaceholder')}
                autoFocus
              />
              {errors.name && <p className="text-[11px] text-red mt-0.5">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('season.openingDate')} *</label>
                <input type="date" {...register('openingDate', { required: t('required') })} className={inputCls} />
                {errors.openingDate && <p className="text-[11px] text-red mt-0.5">{errors.openingDate.message}</p>}
              </div>
              <div>
                <label className={labelCls}>{t('season.closingDate')} *</label>
                <input type="date" {...register('closingDate', { required: t('required') })} className={inputCls} />
                {errors.closingDate && <p className="text-[11px] text-red mt-0.5">{errors.closingDate.message}</p>}
              </div>
            </div>

            <div>
              <label className={labelCls}>{t('season.acaDate')} <span className="text-forest/30 font-normal">{t('optional')}</span></label>
              <input type="date" {...register('acaInspectionDate')} className={inputCls} />
              <p className="text-[11px] text-ink-faint mt-1">{t('season.acaHelp')}</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="bg-forest text-cream text-[13px] font-medium px-5 py-2 rounded-lg hover:bg-forest/90 transition-colors"
              >
                {mode === 'new' ? t('season.activate') : t('saveChanges')}
              </button>
              <button
                type="button"
                onClick={() => setMode('view')}
                className="text-[13px] text-ink-soft px-4 py-2 rounded-lg hover:bg-cream transition-colors"
              >
                {t('common:actions.cancel')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ── View mode ─────────────────────────────────────────────────────────────

  return (
    <div className="p-7 max-w-xl">
      <div className={cardCls}>
        {season ? (
          <>
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-amber-bg flex items-center justify-center flex-shrink-0">
                <Sun className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[15px] font-semibold text-forest">{season.name}</h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-green-muted-bg text-green-muted-text rounded-tag uppercase tracking-wide">
                    {t('season.active')}
                  </span>
                </div>
                <p className="text-[13px] text-ink-soft mt-0.5">
                  {t('season.range', { from: fmt(season.openingDate), to: fmt(season.closingDate) })}
                </p>
                {season.acaInspectionDate && (
                  <p className="text-[12px] text-ink-faint mt-1">
                    {t('season.acaOn', { date: fmt(season.acaInspectionDate) })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-border">
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 text-[13px] font-medium text-forest px-4 py-2 rounded-lg border border-border hover:bg-cream transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                {t('season.edit')}
              </button>
              <button
                onClick={startNew}
                className="flex items-center gap-1.5 text-[13px] text-ink-soft px-4 py-2 rounded-lg hover:bg-cream transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                {t('season.startNew')}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-4 sm:py-6">
            <div className="w-12 h-12 rounded-full bg-cream-dark flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-forest/25" />
            </div>
            <p className="text-[14px] font-semibold text-forest mb-1">{t('season.none')}</p>
            <p className="text-[12px] text-ink-faint mb-5 max-w-xs mx-auto">
              {t('season.noneBody')}
            </p>
            <button
              onClick={startNew}
              className="bg-forest text-cream text-[13px] font-medium px-5 py-2 rounded-lg hover:bg-forest/90 transition-colors"
            >
              {t('season.setUp')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Locations tab ─────────────────────────────────────────────────────────────

// Locations overview: read-only rows that open a detail editor modal.
function LocBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'sage' | 'blue' | 'muted' }) {
  const cls = tone === 'sage' ? 'bg-sage-pale text-forest' : tone === 'blue' ? 'bg-blue-bg text-blue-text'
    : tone === 'muted' ? 'bg-cream-dark text-ink-faint' : 'bg-cream-dark text-ink-soft';
  return <span className={`inline-flex px-1.5 py-0.5 rounded-tag text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{children}</span>;
}

/** Read-only overview row. Click to open the detail editor; children render indented below. */
function LocationRow({ loc, depth, onOpen }: { loc: CampLocation; depth: number; onOpen: (l: CampLocation) => void }) {
  const { t } = useTranslation('campInfo');
  const { childrenOf, categories } = useLocationStore();
  const kids = childrenOf(loc.id);
  const isRoom = loc.parentId != null;
  const catName = categories.find(c => c.id === loc.categoryId)?.name;

  return (
    <>
      <button
        type="button"
        onClick={() => onOpen(loc)}
        className="w-full flex items-center gap-2 py-2 pe-1 text-start rounded-btn hover:bg-cream-dark/30 transition-colors"
        style={{ paddingInlineStart: `${depth * 20 + 4}px` }}
      >
        {depth > 0 && <CornerDownRight className="w-3.5 h-3.5 text-forest/25 flex-shrink-0 rtl:-scale-x-100" />}
        <span className={`text-[13px] font-medium truncate ${loc.isActive ? 'text-forest' : 'text-ink-faint line-through'}`}>
          {loc.name || t('locations.untitled')}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {loc.isDorm && <LocBadge>{t('locations.badge.dorm')}</LocBadge>}
          {isRoom && loc.bedCapacity != null && <LocBadge>{t('locations.badge.beds', { count: loc.bedCapacity })}</LocBadge>}
          {loc.retreatAvailable && <LocBadge tone="sage">{t('locations.badge.retreat')}</LocBadge>}
          {loc.accessible && <LocBadge tone="blue">{t('locations.badge.ada')}</LocBadge>}
          {!loc.isActive && <LocBadge tone="muted">{t('locations.badge.blocked')}</LocBadge>}
          {depth === 0 && catName && <span className="text-[11px] text-ink-faint">{catName}</span>}
        </span>
        <Pencil className="w-3.5 h-3.5 text-forest/25 flex-shrink-0" />
      </button>
      {kids.map(k => <LocationRow key={k.id} loc={k} depth={depth + 1} onOpen={onOpen} />)}
    </>
  );
}

/** Detail editor for one location. Buildings carry dorm/category; rooms carry beds. Save/Cancel. */
function LocationDetailModal({ loc, onClose, onOpen }: { loc: CampLocation; onClose: () => void; onOpen: (l: CampLocation) => void }) {
  const { t } = useTranslation(['campInfo', 'common']);
  const { categories, updateLocation, deleteLocation, addLocation, childrenOf } = useLocationStore();
  const isRoom = loc.parentId != null;
  const kids = childrenOf(loc.id);
  // A room can only be offered to retreats if its building is. Guard the toggle + save.
  const parent = useLocationStore((s) => (loc.parentId ? s.locations.find((l) => l.id === loc.parentId) ?? null : null));
  const parentAvailable = !!parent?.retreatAvailable;
  const [cabinTypes] = useCabinTypes();
  const templates = useCampgroundStore((st) => st.templates);

  const [name, setName] = useState(loc.name);
  const [categoryId, setCategoryId] = useState(loc.categoryId ?? '');
  const [isDorm, setIsDorm] = useState(loc.isDorm);
  const [retreatAvailable, setRetreatAvailable] = useState(loc.retreatAvailable);
  const [accessible, setAccessible] = useState(loc.accessible);
  const [isActive, setIsActive] = useState(loc.isActive);
  const [beds, setBeds] = useState(loc.bedCapacity != null ? String(loc.bedCapacity) : '');
  const [notes, setNotes] = useState(loc.notes ?? '');
  const [cabinTypeId, setCabinTypeId] = useState(loc.cabinTypeId ?? '');
  const [checklistTemplateId, setChecklistTemplateId] = useState(loc.checklistTemplateId ?? '');
  const [programSpace, setProgramSpace] = useState(loc.programSpace ?? false);
  const [seats, setSeats] = useState(loc.capacitySeated != null ? String(loc.capacitySeated) : '');

  function save() {
    updateLocation({
      ...loc,
      name: name.trim() || loc.name,
      categoryId: isRoom ? loc.categoryId : (categoryId || null),
      isDorm: isRoom ? loc.isDorm : isDorm,
      retreatAvailable: isRoom ? (parentAvailable && retreatAvailable) : (isDorm ? retreatAvailable : false),
      accessible,
      isActive,
      bedCapacity: isRoom ? (beds === '' ? null : Math.max(0, Math.round(Number(beds) || 0))) : loc.bedCapacity,
      notes: notes.trim() || null,
      cabinTypeId: cabinTypeId || null,
      checklistTemplateId: checklistTemplateId || null,
      programSpace: isDorm ? false : programSpace,
      capacitySeated: !isDorm && programSpace && seats !== ''
        ? Math.max(0, Math.round(Number(seats) || 0)) : (isDorm ? null : loc.capacitySeated),
    });
    onClose();
  }
  function remove() {
    const label = loc.name || t('locations.thisLocation');
    if (confirm(kids.length ? t('locations.confirmDeleteWithChildren', { name: label }) : t('locations.confirmDelete', { name: label }))) {
      deleteLocation(loc.id);
      onClose();
    }
  }
  function addRoom() {
    // Stored as the room's name, so it stays English (trap 18); the camp renames it right away.
    const r = addLocation({ name: 'New room', parentId: loc.id });
    onOpen(r); // switch the editor to the new room
  }

  const sortedCats = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  // Saved descriptions only make sense on a ROOM people sleep in: a camp has twenty identical
  // cabins, not two identical villages. A building offered without rooms is one too -- that is
  // the shape the portal treats as a bookable space.
  const isSleeping = isRoom ? !!parent?.isDorm : (isDorm && kids.length === 0);
  const chosenType = cabinTypes.find((ct) => ct.id === cabinTypeId) ?? null;
  const activeTemplates = templates.filter((tpl) => tpl.isActive);
  const toggle = (on: boolean) => `inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-pill border transition-colors ${on ? 'bg-sage text-white border-sage' : 'bg-white text-ink-soft border-border hover:border-forest/30'}`;

  return (
    <Modal title={isRoom ? t('locations.editRoom') : t('locations.editLocation')} onClose={onClose} width="460px">
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-ink mb-1">{t('locations.name')}</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder={t('locations.namePlaceholder')} />
        </div>

        {!isRoom && (
          <>
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">{t('locations.category')}</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputCls}>
                <option value="">{t('locations.uncategorized')}</option>
                {sortedCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setIsDorm(v => !v)} className={toggle(isDorm)}>{isDorm && <Check className="w-3 h-3" />} {t('locations.dormToggle')}</button>
              {isDorm && <button type="button" onClick={() => setRetreatAvailable(v => !v)} className={toggle(retreatAvailable)}>{retreatAvailable && <Check className="w-3 h-3" />} {t('locations.retreatToggle')}</button>}
            </div>
            {isDorm && <p className="text-[11px] text-ink-faint -mt-1.5">{t('locations.dormHelp')}</p>}
          </>
        )}

        {isRoom && (
          <>
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">{t('locations.beds')}</label>
              <input type="number" min={0} value={beds} onChange={e => setBeds(e.target.value)} className={`${inputCls} w-28`} placeholder="0" />
            </div>
            <div>
              <button type="button" disabled={!parentAvailable} onClick={() => setRetreatAvailable(v => !v)}
                className={`${toggle(parentAvailable && retreatAvailable)} ${!parentAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}>
                {parentAvailable && retreatAvailable && <Check className="w-3 h-3" />} {t('locations.retreatToggle')}
              </button>
              {!parentAvailable && (
                <p className="text-[11px] text-ink-faint mt-1">
                  <Trans
                    t={t} i18nKey="locations.markParentFirst"
                    values={{ name: parent?.name ?? t('locations.theBuilding') }}
                    components={{ b: <span className="font-medium" /> }}
                  />
                </p>
              )}
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAccessible(v => !v)} className={toggle(accessible)}>{accessible && <Check className="w-3 h-3" />} {t('locations.accessibleToggle')}</button>
          <button type="button" onClick={() => setIsActive(v => !v)} className={toggle(isActive)}>{isActive ? <><Check className="w-3 h-3" /> {t('locations.activeToggle')}</> : t('locations.blockedToggle')}</button>
        </div>

        {/* This is `locations.notes`, and it is what the GUEST PORTAL shows a group choosing rooms
            and spaces. It was labelled "Notes — optional", so camps wrote internal reminders into
            a field their customers read. Same column, honest label. */}
        {isSleeping && cabinTypes.length > 0 && (
          <div>
            <label className="block text-[12px] font-medium text-ink mb-1">{t('locations.savedDescription')}</label>
            <select value={cabinTypeId} onChange={e => setCabinTypeId(e.target.value)} className={inputCls}>
              <option value="">{t('locations.savedDescriptionNone')}</option>
              {cabinTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
            </select>
            {chosenType && (
              <p className="mt-1.5 text-[11.5px] text-ink-soft bg-cream border border-border rounded-btn px-2.5 py-2 whitespace-pre-line">
                {chosenType.description || t('locations.savedDescriptionEmpty')}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-[12px] font-medium text-ink mb-1">
            {cabinTypeId ? t('locations.extraLabel') : t('locations.descriptionLabel')}
          </label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className={`${inputCls} resize-y`}
            placeholder={isRoom ? t('locations.roomPlaceholder') : t('locations.buildingPlaceholder')}
          />
          <p className="mt-1 text-[11px] text-ink-soft">
            {cabinTypeId ? t('locations.extraHelp') : t('locations.descriptionHelp')}
          </p>
        </div>

        {/* Meeting spaces had no editor anywhere except a modal buried inside a retreat, so a camp
            could not add one, describe it, or say how many it seats. */}
        {!isDorm && (
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setProgramSpace(v => !v)}
              className={toggle(programSpace)}
            >
              {programSpace && <Check className="w-3 h-3" />} {t('locations.programSpaceToggle')}
            </button>
            {programSpace && (
              <div className="mt-2.5">
                <label className="block text-[12px] font-medium text-ink mb-1">{t('locations.seats')}</label>
                <input
                  type="number" min={0} value={seats}
                  onChange={e => setSeats(e.target.value)}
                  className={`${inputCls} w-28`} placeholder="0"
                />
                <p className="mt-1 text-[11px] text-ink-soft">
                  {t('locations.seatsHelp')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Crew-facing, and kept apart from the description above on purpose: this used to sit in
            the same row a camp used to write what GROUPS read, so an internal checklist choice
            looked like part of the guest copy. */}
        {activeTemplates.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-1.5">
              {t('locations.crewOnly')}
            </p>
            <label className="block text-[12px] font-medium text-ink mb-1">
              {isRoom ? t('locations.turnoverStepsRoom') : t('locations.turnoverStepsLocation')}
            </label>
            <select value={checklistTemplateId} onChange={e => setChecklistTemplateId(e.target.value)} className={inputCls}>
              <option value="">{t('locations.oneStep')}</option>
              {activeTemplates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-ink-soft">
              {t('locations.turnoverHelp')}
            </p>
          </div>
        )}

        {!isRoom && (
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[12px] font-semibold text-ink-soft">{t('locations.rooms')}</p>
              <button type="button" onClick={addRoom} className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-soft hover:text-forest"><Plus className="w-3.5 h-3.5" /> {t('locations.addRoom')}</button>
            </div>
            {kids.length === 0 ? (
              <p className="text-[11px] text-ink-faint italic">{t('locations.noRooms')}</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {kids.map(k => (
                  <button key={k.id} type="button" onClick={() => onOpen(k)} className="w-full flex items-center gap-2 py-1.5 text-start text-[12px] text-forest hover:text-sage">
                    <CornerDownRight className="w-3.5 h-3.5 text-forest/25 rtl:-scale-x-100" />
                    <span className={k.isActive ? '' : 'text-ink-faint line-through'}>{k.name}</span>
                    {k.bedCapacity != null && <span className="text-ink-faint">· {t('locations.badge.beds', { count: k.bedCapacity })}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={save} className="flex-1 bg-forest text-cream text-[13px] font-medium py-2 rounded-btn hover:bg-forest/90 transition-colors">{t('saveChanges')}</button>
          <button onClick={remove} className="text-[13px] text-red hover:bg-red-bg px-3 py-2 rounded-btn transition-colors">{t('common:actions.delete')}</button>
          <button onClick={onClose} className="text-[13px] text-ink-soft hover:text-forest px-3 py-2 rounded-btn transition-colors">{t('common:actions.cancel')}</button>
        </div>
      </div>
    </Modal>
  );
}

const GUIDE_COLUMNS = ['name', 'category', 'parent', 'dorm', 'beds', 'accessible'] as const;

interface ParsedRow { name: string; category: string; parent: string; isDorm: boolean; beds: number | null; accessible: boolean; }

function truthy(v: unknown) { return /^(y|yes|true|1|x|dorm|accessible)$/i.test(String(v ?? '').trim()); }

function LocationsTab() {
  const { t } = useTranslation(['campInfo', 'common']);
  const { topLevel, categories, addLocation, addCategory, deleteCategory } = useLocationStore();
  const locations = useLocationStore(s => s.locations);

  const [newTop, setNewTop] = useState('');
  const [newTopCat, setNewTopCat] = useState('');
  const [newCat, setNewCat] = useState('');
  const [showCats, setShowCats] = useState(false);
  const [detailLoc, setDetailLoc] = useState<CampLocation | null>(null);
  const [printingLabels, setPrintingLabels] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ rows: ParsedRow[]; fileName: string } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  // Two import paths: (a) hand the raw file off to our team, (b) DIY spreadsheet import.
  const [showInstructions, setShowInstructions] = useState(false);

  const sortedCats = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const tops = topLevel();

  // Group top-level locations by category (+ an Uncategorized bucket for the rest).
  const groups: { key: string; label: string; catId: string | null; items: CampLocation[] }[] = [];
  for (const c of sortedCats) {
    groups.push({ key: c.id, label: c.name, catId: c.id, items: tops.filter(l => l.categoryId === c.id) });
  }
  const uncategorized = tops.filter(l => !l.categoryId || !categories.some(c => c.id === l.categoryId));
  if (uncategorized.length) groups.push({ key: '_none', label: t('locations.uncategorized'), catId: null, items: uncategorized });

  function addTop() {
    const n = newTop.trim();
    if (!n) return;
    const l = addLocation({ name: n, categoryId: newTopCat || null });
    setNewTop('');
    setDetailLoc(l); // open the detail editor for the new location
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        if (!raw.length) { alert(t('locations.import.noRows')); return; }
        const cols = Object.keys(raw[0]);
        const find = (re: RegExp) => cols.find(c => re.test(c));
        const nameC = find(/^name$|cabin|bunk|location|area/i) ?? cols[0];
        const catC = find(/categor|type|group/i);
        const parentC = find(/parent/i);
        const dormC = find(/dorm/i);
        const bedsC = find(/bed|capacit|size|sleeps/i);
        const accC = find(/accessible|ada/i);
        const rows: ParsedRow[] = raw.map(r => {
          const bedsVal = bedsC ? parseInt(String(r[bedsC]).replace(/[^0-9]/g, ''), 10) : NaN;
          return {
            name: String(r[nameC] ?? '').trim(),
            category: catC ? String(r[catC] ?? '').trim() : '',
            parent: parentC ? String(r[parentC] ?? '').trim() : '',
            isDorm: dormC ? truthy(r[dormC]) : false,
            beds: Number.isNaN(bedsVal) ? null : bedsVal,
            accessible: accC ? truthy(r[accC]) : false,
          };
        }).filter(r => r.name);
        if (!rows.length) { alert(t('locations.import.noUsableRows')); return; }
        setPreview({ rows, fileName: file.name });
        setSummary(null);
      } catch {
        alert(t('locations.import.unreadable'));
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  function runImport() {
    if (!preview) return;
    const store = useLocationStore.getState();

    // Resolve / create categories referenced by the import.
    const catMap = new Map<string, string>();
    store.categories.forEach(c => catMap.set(c.name.toLowerCase(), c.id));
    for (const r of preview.rows) {
      const key = r.category.toLowerCase();
      if (r.category && !catMap.has(key)) catMap.set(key, store.addCategory(r.category).id);
    }
    const resolveCat = (c: string) => (c ? catMap.get(c.toLowerCase()) ?? null : null);

    // Pass 1, top-levels (no parent).
    const topRows = preview.rows.filter(r => !r.parent).map(r => ({
      name: r.name, categoryId: resolveCat(r.category), isDorm: r.isDorm,
      bedCapacity: r.beds, accessible: r.accessible,
    }));
    store.bulkAdd(topRows);

    // Build a name → id map of all current top-levels (existing + just-added).
    const topByName = new Map<string, string>();
    useLocationStore.getState().topLevel().forEach(l => topByName.set(l.name.toLowerCase(), l.id));

    // Pass 2, children (resolve parent by name; unmatched parents become top-level).
    const childRows = preview.rows.filter(r => r.parent).map(r => ({
      name: r.name, parentId: topByName.get(r.parent.toLowerCase()) ?? null,
      categoryId: resolveCat(r.category), isDorm: r.isDorm,
      bedCapacity: r.beds, accessible: r.accessible,
    }));
    useLocationStore.getState().bulkAdd(childRows);

    const dorms = preview.rows.filter(r => r.isDorm).length;
    setSummary(dorms
      ? t('locations.import.summaryWithDorms', { count: preview.rows.length, dorms })
      : t('locations.import.summary', { count: preview.rows.length }));
    setPreview(null);
  }

  return (
    <div className="p-7 max-w-3xl space-y-5">
      {detailLoc && <LocationDetailModal key={detailLoc.id} loc={detailLoc} onClose={() => setDetailLoc(null)} onOpen={setDetailLoc} />}
      <PrintLabelsModal open={printingLabels} onClose={() => setPrintingLabels(false)} />
      {/* Locations tree */}
      <div className={cardCls}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-[13px] font-semibold text-forest">{t('locations.title')}</h2>
          {/* Putting a code on a door is what turns this list from an inventory into a way for
              anyone standing anywhere on the property to report what they are looking at. */}
          <button
            type="button"
            onClick={() => setPrintingLabels(true)}
            className="text-[12px] font-semibold text-forest hover:text-forest-mid whitespace-nowrap"
          >
            {t('locations.printLabels')}
          </button>
        </div>
        <p className="text-[12px] text-ink-faint mb-4">
          {t('locations.intro')}
        </p>

        {/* Two import paths: hand off to our team, or DIY spreadsheet import */}
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          {/* (a) Drop a file for our team, same hand-off channel as the Setup Files tab */}
          <ImplementationDropzone
            category="locations"
            title={t('locations.import.sendTitle')}
            blurb={t('locations.import.sendBlurb')}
          />

          {/* (b) DIY spreadsheet import */}
          <div className="rounded-xl border border-border px-4 py-5 text-center bg-white flex flex-col items-center gap-1.5">
            <Upload className="w-5 h-5 text-ink-faint" />
            <p className="text-[12px] font-semibold text-forest">{t('locations.import.diyTitle')}</p>
            <p className="text-[11px] text-ink-faint leading-snug">{t('locations.import.diyBlurb')}</p>
            <div className="flex items-center gap-3 mt-1.5">
              <button onClick={() => fileRef.current?.click()} className="text-[12px] font-medium text-forest border border-border hover:border-forest/40 px-3 py-1.5 rounded-btn transition-colors">{t('locations.import.chooseFile')}</button>
              <button onClick={() => setShowInstructions(v => !v)} className="text-[12px] text-ink-soft hover:text-forest inline-flex items-center gap-1">
                {showInstructions ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5 rtl:-scale-x-100" />} {t('locations.import.guide')}
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
          </div>
        </div>

        {/* Collapsible DIY formatting instructions */}
        {showInstructions && (
          <div className="mb-4 text-[12px] text-ink-soft bg-cream/60 border border-border rounded-btn px-3.5 py-2.5 leading-relaxed">
            <Trans t={t} i18nKey="locations.guide.intro" components={{ b: <span className="font-semibold text-ink" /> }} />
            <ul className="mt-1.5 space-y-0.5 list-disc ps-4">
              {/* The column names themselves stay English: they are what the importer matches. */}
              {GUIDE_COLUMNS.map((col) => (
                <li key={col}>
                  <span className="font-medium text-ink" dir="ltr">{col}</span>{' '}
                  {col === 'name' && <span className="text-ink-faint">{t('locations.guide.required')} </span>}
                  {t(`locations.guide.${col}`)}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-ink-faint">{t('locations.guide.example')} <code dir="ltr" className="bg-white border border-border rounded px-1">Birch Cabin, Housing, , yes, 12, yes</code></p>
          </div>
        )}

        {/* Import preview */}
        {preview && (
          <div className="mb-4 p-4 bg-paper border border-border rounded-xl space-y-2">
            <p className="text-[12px] font-medium text-forest">
              <bdi>{preview.fileName}</bdi> · {t('locations.import.rowsReady', { count: preview.rows.length })}
            </p>
            <div className="max-h-32 overflow-y-auto text-[12px] text-ink-soft space-y-0.5">
              {preview.rows.slice(0, 8).map((r, i) => (
                <div key={i} className="flex gap-2">
                  {r.parent && <CornerDownRight className="w-3.5 h-3.5 text-forest/25 rtl:-scale-x-100" />}
                  <span className="text-forest">{r.name}</span>
                  {r.category && <span className="text-ink-faint">· {r.category}</span>}
                  {r.isDorm && <span className="text-sage">· {r.beds ? t('locations.import.dormBeds', { beds: r.beds }) : t('locations.import.dorm')}</span>}
                </div>
              ))}
              {preview.rows.length > 8 && <p className="text-forest/30 italic">{t('locations.import.andMore', { count: preview.rows.length - 8 })}</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={runImport} className="bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-btn">{t('locations.import.run', { count: preview.rows.length })}</button>
              <button onClick={() => setPreview(null)} className="text-[12px] text-ink-soft hover:text-forest px-3 py-1.5">{t('common:actions.cancel')}</button>
            </div>
          </div>
        )}
        {summary && (
          <div className="mb-4 flex items-center gap-2 text-[12px] text-sage bg-sage-pale/50 border border-sage/20 rounded-btn px-3 py-2">
            <Check className="w-3.5 h-3.5" /> {summary}
          </div>
        )}

        {locations.length === 0 && !preview && (
          <p className="text-[13px] text-forest/30 italic mb-4">{t('locations.empty')}</p>
        )}

        {/* Grouped tree */}
        <div className="space-y-4">
          {groups.filter(g => g.items.length > 0).map(g => (
            <div key={g.key}>
              <div className="flex items-center justify-between mb-0.5 pb-1 border-b border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{g.label}</p>
                {g.catId && (
                  <button
                    // Stored as the location's name, so English (trap 18).
                    onClick={() => setDetailLoc(addLocation({ name: 'New location', categoryId: g.catId }))}
                    className="text-[11px] text-ink-faint hover:text-forest transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> {t('common:actions.add')}
                  </button>
                )}
              </div>
              <div className="divide-y divide-stone-100">
                {g.items.map(l => <LocationRow key={l.id} loc={l} depth={0} onOpen={setDetailLoc} />)}
              </div>
            </div>
          ))}
        </div>

        {/* Add top-level location */}
        <div className="flex gap-2 mt-5 pt-4 border-t border-border">
          <input
            value={newTop}
            onChange={e => setNewTop(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTop(); } }}
            className={`${fieldCls} flex-1 min-w-0`}
            placeholder={t('locations.addPlaceholder')}
          />
          <select value={newTopCat} onChange={e => setNewTopCat(e.target.value)} className={`${fieldCls} w-40 flex-shrink-0`}>
            <option value="">{t('locations.uncategorized')}</option>
            {sortedCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={addTop}
            disabled={!newTop.trim()}
            className="flex items-center gap-1.5 bg-forest text-cream text-[13px] font-medium px-4 py-2 rounded-btn hover:bg-forest/90 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> {t('common:actions.add')}
          </button>
        </div>
      </div>

      {/* Descriptions a camp reuses across rooms. Here rather than inside a retreat, because
          what a cabin is like is true of the camp, not of one group's week. */}
      <div className={cardCls}>
        <SavedDescriptions canManage />
      </div>

      {/* Category management */}
      <div className={cardCls}>
        <button onClick={() => setShowCats(v => !v)} className="flex items-center gap-1.5 text-[13px] font-semibold text-forest w-full">
          {showCats ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />}
          {t('locations.categories')}
          <span className="text-[11px] font-normal text-ink-faint ms-1">({sortedCats.length})</span>
        </button>

        {showCats && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2 mb-4">
              {sortedCats.map(c => (
                <div key={c.id} className="flex items-center gap-1.5 bg-cream border border-border rounded-full px-3 py-1">
                  <span className="text-[12px] font-medium text-forest">{c.name}</span>
                  {c.isPreset ? (
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-forest/30">{t('locations.preset')}</span>
                  ) : (
                    <button
                      onClick={() => { if (confirm(t('locations.confirmDeleteCategory', { name: c.name }))) deleteCategory(c.id); }}
                      className="text-forest/30 hover:text-red transition-colors"
                      title={t('locations.deleteCategory', { name: c.name })}
                      aria-label={t('locations.deleteCategory', { name: c.name })}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newCat.trim()) { e.preventDefault(); addCategory(newCat.trim()); setNewCat(''); } }}
                className={`${inputCls} flex-1`}
                placeholder={t('locations.addCategoryPlaceholder')}
              />
              <button
                onClick={() => { if (newCat.trim()) { addCategory(newCat.trim()); setNewCat(''); } }}
                disabled={!newCat.trim()}
                className="flex items-center gap-1.5 bg-forest text-cream text-[13px] font-medium px-4 py-2 rounded-btn hover:bg-forest/90 transition-colors disabled:opacity-40 flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> {t('common:actions.add')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pools tab ─────────────────────────────────────────────────────────────────

function PoolsTab() {
  const { t } = useTranslation(['campInfo', 'common']);
  const { pools, updatePool } = usePoolStore();
  const { isAddEditPoolModalOpen, openAddEditPoolModal } = useUIStore();

  const sorted = [...pools].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="p-7 max-w-xl">
      <div className={cardCls}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-[13px] font-semibold text-forest">{t('pools.title')}</h2>
            <p className="text-[12px] text-ink-faint mt-0.5">{t('pools.intro')}</p>
          </div>
          <button
            onClick={() => openAddEditPoolModal()}
            className="flex items-center gap-1.5 bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-btn hover:bg-forest/90 transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('pools.add')}
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-[13px] text-forest/30 italic text-center py-4">{t('pools.empty')}</p>
        ) : (
          <div className="divide-y divide-border">
            {sorted.map(pool => (
              <div key={pool.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-forest truncate">{pool.name}</p>
                  <p className="text-[11px] text-ink-faint">{t(`pools.types.${pool.type}`)}</p>
                </div>
                <button
                  onClick={() =>
                    updatePool({ ...pool, isActive: !pool.isActive, updatedAt: new Date().toISOString() })
                  }
                  className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full transition-colors flex-shrink-0 ${
                    pool.isActive
                      ? 'bg-green-muted-bg text-green-muted-text hover:opacity-70'
                      : 'bg-cream-dark text-ink-faint hover:opacity-70'
                  }`}
                >
                  {pool.isActive ? t('pools.active') : t('pools.inactive')}
                </button>
                <button
                  onClick={() => openAddEditPoolModal(pool.id)}
                  className="flex items-center gap-1 text-[12px] text-ink-faint hover:text-forest px-2 py-1 rounded hover:bg-cream transition-colors flex-shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                  {t('common:actions.edit')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAddEditPoolModalOpen && <AddEditPoolModal fromSettings />}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CampSettings() {
  // /settings/staff is a real deep link, not a redirect: Compliance sends people here
  // to edit the roster, and they need a URL that lands on the right tab.
  const { t } = useTranslation('campInfo');
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (pathname.endsWith('/staff')) return 'staff';
    const wanted = params.get('tab');
    return TABS.some((tab) => tab.id === wanted) ? wanted as TabId : 'profile';
  });

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Page header + tab bar */}
      <div className="px-4 sm:px-7 pt-7 pb-0 border-b border-border bg-white flex-shrink-0 overflow-x-auto">
        <h1 className="text-[20px] font-bold text-forest">{t('page.title')}</h1>
        <p className="text-[12px] text-ink-faint mt-0.5">
          {t('page.subtitle')}
        </p>
        <div className="flex mt-5">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-[3px] transition-colors -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-sage text-forest'
                  : 'border-transparent text-ink-faint hover:text-forest'
              }`}
            >
              {t(`tabs.${tab.id}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-paper">
        {activeTab === 'profile'   && <ProfileTab />}
        {activeTab === 'season'    && <SeasonTab />}
        {activeTab === 'staff'     && <StaffRosterTab />}
        {activeTab === 'locations' && <LocationsTab />}
        {activeTab === 'pools'     && <PoolsTab />}
        {activeTab === 'rentals'   && <RentalsTab />}
        {activeTab === 'payments'  && (
          <div className="px-4 py-4 sm:px-7 sm:py-6"><PaymentsCard /></div>
        )}
        {activeTab === 'files'     && <ImplementationFilesTab />}
      </div>
    </div>
  );
}

// ─── Rentals ──────────────────────────────────────────────────────────────────

/**
 * The camp's rate card and proposal defaults.
 *
 * These used to live nowhere. Every booking carried its own rate and started empty, so a
 * proposal for a new group quoted "50 people × 3 nights @ $.00/person/night" and totalled zero.
 * A camp charges most groups the same thing; it says so once here, and any booking that needs a
 * different number still overrides it.
 */
function RentalsTab() {
  const { t } = useTranslation(['campInfo', 'common']);
  const { currentCamp, setRentalDefaults } = useCampStore();
  const { can } = useAuth();
  const editable = can('manageRetreats');

  const [model, setModel] = useState(currentCamp?.defaultPricingModel ?? 'per_person_night');
  const [rate, setRate] = useState(
    currentCamp?.defaultRatePerPersonNight != null ? String(currentCamp.defaultRatePerPersonNight) : '');
  const [flat, setFlat] = useState(
    currentCamp?.defaultFlatRate != null ? String(currentCamp.defaultFlatRate) : '');
  const [deposit, setDeposit] = useState(
    currentCamp?.defaultDepositAmount != null ? String(currentCamp.defaultDepositAmount) : '');

  // ── The public inquiry link ──
  const setInquiryToken = useCampStore((st) => st.setInquiryToken);
  const [inquiryToken, setInquiryTokenLocal] = useState(currentCamp?.inquiryToken ?? null);
  const [copiedLink, setCopiedLink] = useState(false);
  const inquiryUrl = inquiryToken ? `${window.location.origin}/inquire/${inquiryToken}` : '';

  async function toggleInquiry(on: boolean) {
    if (!currentCamp) return;
    await setInquiryToken(currentCamp.id, on);
    setInquiryTokenLocal(useCampStore.getState().currentCamp?.inquiryToken ?? null);
  }

  const [days, setDays] = useState(
    currentCamp?.proposalValidDays != null ? String(currentCamp.proposalValidDays) : '30');
  const [chase, setChase] = useState(
    currentCamp?.depositChaseDays != null ? String(currentCamp.depositChaseDays) : '');
  const [saved, setSaved] = useState(false);

  if (!currentCamp) return null;

  async function save() {
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    await setRentalDefaults(currentCamp!.id, {
      defaultPricingModel: model,
      defaultRatePerPersonNight: num(rate),
      defaultFlatRate: num(flat),
      defaultDepositAmount: num(deposit),
      proposalValidDays: days.trim() === '' ? null : Number(days),
      depositChaseDays: num(chase),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const input = 'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-1.5';

  return (
    <div className="px-4 py-4 sm:px-7 sm:py-6 max-w-5xl space-y-5">
      {/* Save leads the page. At the bottom it sat under a full-height agreement editor, so the
          way to find out how to keep a changed rate was to scroll past the contract looking for
          a button -- and the page has no other affordance that says these are unsaved. */}
      {editable && (
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-[12.5px] text-green-muted-text">{t('savedDot')}</span>}
          <Button onClick={save}>{t('common:actions.save')}</Button>
        </div>
      )}

      {/* Rate and defaults are short settings; side by side they read as one row instead of a
          column of narrow cards with half the page empty beside them. The agreement below gets
          the full width, because it is a document rather than a setting. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
      <div className="rounded-card border border-border bg-white p-5">
        <h3 className="font-display text-[15px] font-bold text-forest">{t('rentals.rate.title')}</h3>
        <p className="text-[12.5px] text-ink-soft mt-0.5">
          {t('rentals.rate.body')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <div>
            <label className={label} htmlFor="rt-model">{t('rentals.rate.model')}</label>
            <select
              id="rt-model" className={input} value={model} disabled={!editable}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="per_person_night">{t('rentals.rate.perPersonNight')}</option>
              <option value="per_cabin_night">{t('rentals.rate.perCabinNight')}</option>
              <option value="flat">{t('rentals.rate.flat')}</option>
            </select>
          </div>
          {model === 'per_person_night' ? (
            <div>
              <label className={label} htmlFor="rt-rate">{t('rentals.rate.ratePerPerson')}</label>
              <input
                id="rt-rate" className={input} dir="ltr" inputMode="decimal" placeholder="92"
                value={rate} disabled={!editable} onChange={(e) => setRate(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <label className={label} htmlFor="rt-flat">
                {model === 'per_cabin_night' ? t('rentals.rate.ratePerCabin') : t('rentals.rate.facilityFee')}
              </label>
              <input
                id="rt-flat" className={input} dir="ltr" inputMode="decimal" placeholder="1200"
                value={flat} disabled={!editable} onChange={(e) => setFlat(e.target.value)}
              />
            </div>
          )}
          {/* The deposit had a column, a store field and a save path, and no box anywhere to
              type it in -- so every new agreement quietly proposed whatever number happened to
              be in the database, and no camp could change it. */}
          <div>
            <label className={label} htmlFor="rt-deposit">{t('rentals.rate.deposit')}</label>
            <input
              id="rt-deposit" className={input} inputMode="decimal" placeholder={t('rentals.rate.depositNone')}
              value={deposit} disabled={!editable} onChange={(e) => setDeposit(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-ink-soft">
              {t('rentals.rate.depositHelp')}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-card border border-border bg-white p-5">
        <h3 className="font-display text-[15px] font-bold text-forest">{t('rentals.defaults.title')}</h3>
        <div className="mt-4 space-y-3">
          <div className="max-w-[16rem]">
            <label className={label} htmlFor="rt-days">{t('rentals.defaults.validFor')}</label>
            <div className="flex items-center gap-2">
              <input
                id="rt-days" className={input} inputMode="numeric" placeholder="30"
                value={days} disabled={!editable} onChange={(e) => setDays(e.target.value)}
              />
              <span className="text-[13px] text-ink-soft">{t('rentals.defaults.days')}</span>
            </div>
          </div>
          {/* A cheque that never came does not announce itself: the dates stay held, no money
              lands against them, and somebody notices in the week of arrival. */}
          <div className="max-w-[16rem]">
            <label className={label} htmlFor="rt-chase">{t('rentals.defaults.chaseAfter')}</label>
            <div className="flex items-center gap-2">
              <input
                id="rt-chase" className={input} inputMode="numeric" placeholder={t('rentals.defaults.never')}
                value={chase} disabled={!editable} onChange={(e) => setChase(e.target.value)}
              />
              <span className="text-[13px] text-ink-soft">{t('rentals.defaults.days')}</span>
            </div>
            <p className="text-[11px] text-ink-soft mt-1">
              {t('rentals.defaults.chaseHelp')}
            </p>
          </div>
        </div>

      </div>
      </div>

      {/* ── The front door ──
          Every other way into Retreats assumes a booking already exists. This is the link a
          group uses before there is one: it lands as an inquiry in the pipeline with its fields
          filled in, instead of as an email somebody has to retype. */}
      <div className="rounded-card border border-border bg-white p-5">
        <div>
          <p className={label}>{t('rentals.inquiry.title')}</p>
          {inquiryToken ? (
            <div className="mt-1.5 space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-cream px-3.5 py-2.5">
                <code dir="ltr" className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{inquiryUrl}</code>
                <button
                  onClick={() => { void navigator.clipboard.writeText(inquiryUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }}
                  className="text-[12.5px] font-semibold text-forest hover:text-forest-mid"
                >
                  {copiedLink ? t('copied') : t('copy')}
                </button>
                {editable && (
                  <button
                    onClick={() => { if (confirm(t('rentals.inquiry.confirmOff'))) void toggleInquiry(false); }}
                    className="text-[12.5px] font-semibold text-red hover:opacity-80"
                  >
                    {t('rentals.inquiry.turnOff')}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-ink-soft">
                {t('rentals.inquiry.help')}
              </p>
            </div>
          ) : (
            <div className="mt-1.5">
              <Button size="sm" variant="ghost" disabled={!editable} onClick={() => void toggleInquiry(true)}>
                {t('rentals.inquiry.create')}
              </Button>
              <p className="mt-1 text-[11px] text-ink-soft">
                {t('rentals.inquiry.offHelp')}
              </p>
            </div>
          )}
        </div>

      </div>

      {/* The wording, which is the half that can be filled in per group. The uploaded file
          below stays for camps whose counsel insists on a fixed document. */}
      <div className="rounded-card border border-border bg-white p-5">
        <AgreementTemplateEditor campId={currentCamp?.id ?? ''} editable={editable} />

        {/* The camp-level FILE upload lived here and is gone.
            It copied one document onto every booking and filled in nothing -- same generic text
            for every group, no name, no dates, no price. That is the opposite of a template, and
            keeping it as a "fallback" meant offering camps a path that quietly produced worse
            contracts. Uploading a file for ONE group still exists, on that retreat's Paperwork
            tab, which is the right place for a negotiated one-off or a signed copy coming back. */}
      </div>

    </div>
  );
}
