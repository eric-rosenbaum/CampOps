import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { Plus, X, Pencil, Calendar, Sun } from 'lucide-react';
import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { usePoolStore, POOL_TYPE_LABELS } from '@/store/poolStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { AddEditPoolModal } from '@/components/pool/AddEditPoolModal';
import type { Season } from '@/lib/types';

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = 'profile' | 'season' | 'locations' | 'pools';

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile',   label: 'Profile' },
  { id: 'season',    label: 'Season' },
  { id: 'locations', label: 'Locations' },
  { id: 'pools',     label: 'Pools & Waterfront' },
];

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls = 'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelCls = 'block text-[12px] font-medium text-forest/60 mb-1';
const cardCls  = 'bg-white border border-stone-200 rounded-xl p-5';

// ── Constants ─────────────────────────────────────────────────────────────────

const CAMP_TYPES = ['Day Camp', 'Overnight Camp'];
const US_STATES  = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];
const MODULE_OPTIONS = [
  { key: 'issues',     label: 'Issues & Repairs',    desc: 'Track and assign maintenance issues' },
  { key: 'checklists', label: 'Pre/Post Checklists',  desc: 'Opening and closing task lists' },
  { key: 'pool',       label: 'Pool & Waterfront',    desc: 'Chemical readings, inspections, equipment' },
  { key: 'safety',     label: 'Safety & Compliance',  desc: 'Fire safety, drills, staff certifications' },
  { key: 'assets',     label: 'Assets & Vehicles',    desc: 'Fleet, equipment, checkouts, service records' },
];

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { currentCamp, updateCamp } = useCampStore();
  const [name, setName]       = useState('');
  const [campType, setCampType] = useState('');
  const [state, setState]     = useState('');
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    if (!currentCamp) return;
    setName(currentCamp.name);
    setCampType(currentCamp.campType ?? '');
    setState(currentCamp.state ?? '');
    setModules(currentCamp.modules ?? {});
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
      <form onSubmit={handleSave} className="space-y-5">
        <div className={cardCls}>
          <h2 className="text-[13px] font-semibold text-forest mb-4">Camp profile</h2>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Camp name</label>
              <input
                type="text" required value={name}
                onChange={e => setName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Camp type</label>
                <select value={campType} onChange={e => setCampType(e.target.value)} className={inputCls}>
                  <option value="">Select type</option>
                  {CAMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>State</label>
                <select value={state} onChange={e => setState(e.target.value)} className={inputCls}>
                  <option value="">Select state</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className={cardCls}>
          <h2 className="text-[13px] font-semibold text-forest mb-1">Modules</h2>
          <p className="text-[11px] text-forest/40 mb-4">Enable only the modules your camp uses</p>
          <div className="space-y-3">
            {MODULE_OPTIONS.map(mod => (
              <div
                key={mod.key}
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setModules(p => ({ ...p, [mod.key]: !p[mod.key] }))}
              >
                <div className={`w-9 h-5 rounded-full flex-shrink-0 flex items-center transition-colors ${modules[mod.key] ? 'bg-forest' : 'bg-stone-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${modules[mod.key] ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-forest">{mod.label}</p>
                  <p className="text-[11px] text-forest/40">{mod.desc}</p>
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
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="text-[12px] text-sage font-medium">✓ Saved</span>}
        </div>
      </form>
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
  const { season, editSeason, activateNewSeason } = useChecklistStore();
  const { currentUser } = useAuth();
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
    if (mode === 'edit') {
      editSeason(s);
    } else {
      activateNewSeason(s, currentUser.name);
    }
    setMode('view');
  }

  function fmt(d: string | null | undefined) {
    if (!d) return '—';
    try { return format(new Date(d + 'T12:00:00'), 'MMM d, yyyy'); } catch { return d; }
  }

  // ── Form (edit / new) ─────────────────────────────────────────────────────

  if (mode !== 'view') {
    return (
      <div className="p-7 max-w-xl">
        <div className={cardCls}>
          <h2 className="text-[14px] font-semibold text-forest mb-4">
            {mode === 'new' ? 'Start new season' : 'Edit season'}
          </h2>

          {mode === 'new' && (
            <div className="bg-amber-bg border border-amber/20 rounded-btn px-3 py-2.5 text-[12px] text-amber-text mb-4">
              Starting a new season will reset all pre/post camp checklist task statuses to <strong>Pending</strong> and recompute due dates.
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className={labelCls}>Season name *</label>
              <input
                {...register('name', { required: 'Required' })}
                className={inputCls}
                placeholder="e.g. Summer 2026"
                autoFocus
              />
              {errors.name && <p className="text-[11px] text-red mt-0.5">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Opening date *</label>
                <input type="date" {...register('openingDate', { required: 'Required' })} className={inputCls} />
                {errors.openingDate && <p className="text-[11px] text-red mt-0.5">{errors.openingDate.message}</p>}
              </div>
              <div>
                <label className={labelCls}>Closing date *</label>
                <input type="date" {...register('closingDate', { required: 'Required' })} className={inputCls} />
                {errors.closingDate && <p className="text-[11px] text-red mt-0.5">{errors.closingDate.message}</p>}
              </div>
            </div>

            <div>
              <label className={labelCls}>ACA inspection date <span className="text-forest/30 font-normal">(optional)</span></label>
              <input type="date" {...register('acaInspectionDate')} className={inputCls} />
              <p className="text-[11px] text-forest/40 mt-1">Used to track your ACA accreditation visit in Safety &amp; Compliance.</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="bg-forest text-cream text-[13px] font-medium px-5 py-2 rounded-lg hover:bg-forest/90 transition-colors"
              >
                {mode === 'new' ? 'Activate new season' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => setMode('view')}
                className="text-[13px] text-forest/50 px-4 py-2 rounded-lg hover:bg-cream transition-colors"
              >
                Cancel
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
                    Active
                  </span>
                </div>
                <p className="text-[13px] text-forest/60 mt-0.5">
                  {fmt(season.openingDate)} → {fmt(season.closingDate)}
                </p>
                {season.acaInspectionDate && (
                  <p className="text-[12px] text-forest/40 mt-1">
                    ACA inspection: {fmt(season.acaInspectionDate)}
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
                Edit season
              </button>
              <button
                onClick={startNew}
                className="flex items-center gap-1.5 text-[13px] text-forest/50 px-4 py-2 rounded-lg hover:bg-cream transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                Start new season
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-forest/25" />
            </div>
            <p className="text-[14px] font-semibold text-forest mb-1">No active season</p>
            <p className="text-[12px] text-forest/40 mb-5 max-w-xs mx-auto">
              Set up your camp season to enable due date tracking on pre/post camp checklist tasks.
            </p>
            <button
              onClick={startNew}
              className="bg-forest text-cream text-[13px] font-medium px-5 py-2 rounded-lg hover:bg-forest/90 transition-colors"
            >
              Set up season
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Locations tab ─────────────────────────────────────────────────────────────

function LocationsTab() {
  const { currentCamp, updateCamp } = useCampStore();
  const [newLoc, setNewLoc] = useState('');

  const locations = currentCamp?.locations ?? [];

  function addLocation() {
    const trimmed = newLoc.trim();
    if (!trimmed || !currentCamp) return;
    if (locations.map(l => l.toLowerCase()).includes(trimmed.toLowerCase())) return;
    updateCamp(currentCamp.id, { locations: [...locations, trimmed] });
    setNewLoc('');
  }

  function removeLocation(loc: string) {
    if (!currentCamp) return;
    updateCamp(currentCamp.id, { locations: locations.filter(l => l !== loc) });
  }

  return (
    <div className="p-7 max-w-xl">
      <div className={cardCls}>
        <h2 className="text-[13px] font-semibold text-forest mb-1">Camp locations</h2>
        <p className="text-[12px] text-forest/40 mb-4">
          Areas and buildings used across the app to tag issues, tasks, and repairs.
        </p>

        {locations.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {locations.map(loc => (
              <div
                key={loc}
                className="flex items-center gap-1.5 bg-cream border border-border rounded-full px-3 py-1"
              >
                <span className="text-[12px] font-medium text-forest">{loc}</span>
                <button
                  onClick={() => removeLocation(loc)}
                  className="text-forest/30 hover:text-red transition-colors ml-0.5 flex-shrink-0"
                  title={`Remove ${loc}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {locations.length === 0 && (
          <p className="text-[13px] text-forest/30 italic mb-4">No locations added yet.</p>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newLoc}
            onChange={e => setNewLoc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLocation(); } }}
            className={`${inputCls} flex-1`}
            placeholder="e.g. Waterfront, Dining Hall, Bunk Row A"
          />
          <button
            onClick={addLocation}
            disabled={!newLoc.trim()}
            className="flex items-center gap-1.5 bg-forest text-cream text-[13px] font-medium px-4 py-2 rounded-btn hover:bg-forest/90 transition-colors disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pools tab ─────────────────────────────────────────────────────────────────

function PoolsTab() {
  const { pools, updatePool } = usePoolStore();
  const { isAddEditPoolModalOpen, openAddEditPoolModal } = useUIStore();

  const sorted = [...pools].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="p-7 max-w-xl">
      <div className={cardCls}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-[13px] font-semibold text-forest">Pools & waterfront</h2>
            <p className="text-[12px] text-forest/40 mt-0.5">Aquatic locations tracked in Pool Management</p>
          </div>
          <button
            onClick={() => openAddEditPoolModal()}
            className="flex items-center gap-1.5 bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-btn hover:bg-forest/90 transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add pool
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-[13px] text-forest/30 italic text-center py-4">No pools or waterfront locations added yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {sorted.map(pool => (
              <div key={pool.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-forest truncate">{pool.name}</p>
                  <p className="text-[11px] text-forest/40">{POOL_TYPE_LABELS[pool.type]}</p>
                </div>
                <button
                  onClick={() =>
                    updatePool({ ...pool, isActive: !pool.isActive, updatedAt: new Date().toISOString() })
                  }
                  className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full transition-colors flex-shrink-0 ${
                    pool.isActive
                      ? 'bg-green-muted-bg text-green-muted-text hover:opacity-70'
                      : 'bg-stone-100 text-forest/40 hover:opacity-70'
                  }`}
                >
                  {pool.isActive ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => openAddEditPoolModal(pool.id)}
                  className="flex items-center gap-1 text-[12px] text-forest/40 hover:text-forest px-2 py-1 rounded hover:bg-cream transition-colors flex-shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
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
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Page header + tab bar */}
      <div className="px-7 pt-7 pb-0 border-b border-border bg-white flex-shrink-0">
        <h1 className="text-[20px] font-bold text-forest">Camp Info</h1>
        <p className="text-[12px] text-forest/40 mt-0.5">
          Manage your camp's profile, season, locations, and pools
        </p>
        <div className="flex mt-5">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-sage text-forest'
                  : 'border-transparent text-forest/40 hover:text-forest'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-stone-50">
        {activeTab === 'profile'   && <ProfileTab />}
        {activeTab === 'season'    && <SeasonTab />}
        {activeTab === 'locations' && <LocationsTab />}
        {activeTab === 'pools'     && <PoolsTab />}
      </div>
    </div>
  );
}
