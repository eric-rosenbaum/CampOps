import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { Plus, X, Pencil, Calendar, Sun, Copy, Check, Upload, CornerDownRight, ChevronDown, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useLocationStore } from '@/store/locationStore';
import { ImplementationDropzone, ImplementationFilesTab } from '@/components/settings/ImplementationFiles';
import { usePoolStore, POOL_TYPE_LABELS } from '@/store/poolStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { AddEditPoolModal } from '@/components/pool/AddEditPoolModal';
import { Modal } from '@/components/shared/Modal';
import type { Season, CampLocation } from '@/lib/types';
import { Link } from 'react-router-dom';

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = 'profile' | 'season' | 'locations' | 'pools' | 'files';

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile',   label: 'Profile' },
  { id: 'season',    label: 'Season' },
  { id: 'locations', label: 'Locations' },
  { id: 'pools',     label: 'Pools & Waterfront' },
  { id: 'files',     label: 'Setup Files' },
];

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls = 'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
// Same as inputCls but without w-full — use when the field's width is controlled by flex (side-by-side rows),
// since a baked-in w-full beats flex-1/w-40 in Tailwind's stylesheet order and collapses the layout.
const fieldCls = 'text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
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
  { key: 'building',   label: 'Building Systems',     desc: 'Electrical & plumbing infrastructure by room' },
  // NOTE: camp.modules uses short keys; StaffGroupModules uses long ones
  // ('building_systems'). Inconsistent, but load-bearing — match, don't refactor.
  { key: 'commissary', label: 'Commissary',           desc: 'Inventory, recipes, menu planning' },
  { key: 'retreats',   label: 'Retreat Manager',      desc: 'External group rentals, guest portal, invoicing' },
];

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { currentCamp, updateCamp } = useCampStore();
  const { role } = useAuth();
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {role === 'admin' && currentCamp?.slug && (() => {
        const reportUrl = `${window.location.origin}/report/${currentCamp.slug}`;
        function copyUrl() {
          void navigator.clipboard.writeText(reportUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
        return (
          <div className={cardCls}>
            <h2 className="text-[13px] font-semibold text-forest mb-1">Public issue report link</h2>
            <p className="text-[12px] text-forest/40 mb-3">
              Share this link so anyone — campers, parents, staff — can report an issue without an account. Reports appear in Issues &amp; Repairs with a Public badge.
            </p>
            <div className="flex items-center gap-2 bg-cream border border-border rounded-btn px-3 py-2">
              <Link
                to={`/report/${currentCamp.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-[12px] text-forest/70 font-mono truncate hover:text-forest transition-colors"
              >
                {reportUrl}
              </Link>
              <button
                type="button"
                onClick={copyUrl}
                className="flex items-center gap-1 text-[11px] font-medium text-forest/50 hover:text-forest transition-colors flex-shrink-0 px-1.5 py-0.5 rounded hover:bg-stone-100"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-sage" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="text-center py-4 sm:py-6">
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

// Locations overview: read-only rows that open a detail editor modal.
function LocBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'sage' | 'blue' | 'muted' }) {
  const cls = tone === 'sage' ? 'bg-sage-pale text-forest' : tone === 'blue' ? 'bg-blue-bg text-blue-text'
    : tone === 'muted' ? 'bg-cream-dark text-forest/45' : 'bg-cream-dark text-forest/60';
  return <span className={`inline-flex px-1.5 py-0.5 rounded-tag text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{children}</span>;
}

/** Read-only overview row. Click to open the detail editor; children render indented below. */
function LocationRow({ loc, depth, onOpen }: { loc: CampLocation; depth: number; onOpen: (l: CampLocation) => void }) {
  const { childrenOf, categories } = useLocationStore();
  const kids = childrenOf(loc.id);
  const isRoom = loc.parentId != null;
  const catName = categories.find(c => c.id === loc.categoryId)?.name;

  return (
    <>
      <button
        type="button"
        onClick={() => onOpen(loc)}
        className="w-full flex items-center gap-2 py-2 pr-1 text-left rounded-btn hover:bg-cream-dark/30 transition-colors"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        {depth > 0 && <CornerDownRight className="w-3.5 h-3.5 text-forest/25 flex-shrink-0" />}
        <span className={`text-[13px] font-medium truncate ${loc.isActive ? 'text-forest' : 'text-forest/40 line-through'}`}>
          {loc.name || 'Untitled location'}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {loc.isDorm && <LocBadge>Dorm</LocBadge>}
          {isRoom && loc.bedCapacity != null && <LocBadge>{loc.bedCapacity} beds</LocBadge>}
          {loc.retreatAvailable && <LocBadge tone="sage">Retreat</LocBadge>}
          {loc.accessible && <LocBadge tone="blue">ADA</LocBadge>}
          {!loc.isActive && <LocBadge tone="muted">Blocked</LocBadge>}
          {depth === 0 && catName && <span className="text-[11px] text-forest/35">{catName}</span>}
        </span>
        <Pencil className="w-3.5 h-3.5 text-forest/25 flex-shrink-0" />
      </button>
      {kids.map(k => <LocationRow key={k.id} loc={k} depth={depth + 1} onOpen={onOpen} />)}
    </>
  );
}

/** Detail editor for one location. Buildings carry dorm/category; rooms carry beds. Save/Cancel. */
function LocationDetailModal({ loc, onClose, onOpen }: { loc: CampLocation; onClose: () => void; onOpen: (l: CampLocation) => void }) {
  const { categories, updateLocation, deleteLocation, addLocation, childrenOf } = useLocationStore();
  const isRoom = loc.parentId != null;
  const kids = childrenOf(loc.id);
  // A room can only be offered to retreats if its building is. Guard the toggle + save.
  const parent = useLocationStore((s) => (loc.parentId ? s.locations.find((l) => l.id === loc.parentId) ?? null : null));
  const parentAvailable = !!parent?.retreatAvailable;

  const [name, setName] = useState(loc.name);
  const [categoryId, setCategoryId] = useState(loc.categoryId ?? '');
  const [isDorm, setIsDorm] = useState(loc.isDorm);
  const [retreatAvailable, setRetreatAvailable] = useState(loc.retreatAvailable);
  const [accessible, setAccessible] = useState(loc.accessible);
  const [isActive, setIsActive] = useState(loc.isActive);
  const [beds, setBeds] = useState(loc.bedCapacity != null ? String(loc.bedCapacity) : '');
  const [notes, setNotes] = useState(loc.notes ?? '');

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
    });
    onClose();
  }
  function remove() {
    if (confirm(`Delete "${loc.name || 'this location'}"${kids.length ? ' and its sub-locations' : ''}? This can't be undone.`)) {
      deleteLocation(loc.id);
      onClose();
    }
  }
  function addRoom() {
    const r = addLocation({ name: 'New room', parentId: loc.id });
    onOpen(r); // switch the editor to the new room
  }

  const sortedCats = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const toggle = (on: boolean) => `inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-pill border transition-colors ${on ? 'bg-sage text-white border-sage' : 'bg-white text-forest/50 border-border hover:border-forest/30'}`;

  return (
    <Modal title={isRoom ? 'Edit room' : 'Edit location'} onClose={onClose} width="460px">
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-forest/70 mb-1">Name</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. Birch Cabin, Room 2" />
        </div>

        {!isRoom && (
          <>
            <div>
              <label className="block text-[12px] font-medium text-forest/70 mb-1">Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputCls}>
                <option value="">Uncategorized</option>
                {sortedCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setIsDorm(v => !v)} className={toggle(isDorm)}>{isDorm && <Check className="w-3 h-3" />} Dorm / sleeping quarters</button>
              {isDorm && <button type="button" onClick={() => setRetreatAvailable(v => !v)} className={toggle(retreatAvailable)}>{retreatAvailable && <Check className="w-3 h-3" />} Available to retreats</button>}
            </div>
            {isDorm && <p className="text-[11px] text-forest/45 -mt-1.5">Beds live on this building's rooms — add rooms below and set their beds.</p>}
          </>
        )}

        {isRoom && (
          <>
            <div>
              <label className="block text-[12px] font-medium text-forest/70 mb-1">Beds</label>
              <input type="number" min={0} value={beds} onChange={e => setBeds(e.target.value)} className={`${inputCls} w-28`} placeholder="0" />
            </div>
            <div>
              <button type="button" disabled={!parentAvailable} onClick={() => setRetreatAvailable(v => !v)}
                className={`${toggle(parentAvailable && retreatAvailable)} ${!parentAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}>
                {parentAvailable && retreatAvailable && <Check className="w-3 h-3" />} Available to retreats
              </button>
              {!parentAvailable && (
                <p className="text-[11px] text-forest/45 mt-1">Mark <span className="font-medium">{parent?.name ?? 'the building'}</span> available to retreats first.</p>
              )}
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAccessible(v => !v)} className={toggle(accessible)}>{accessible && <Check className="w-3 h-3" />} Accessible / ADA</button>
          <button type="button" onClick={() => setIsActive(v => !v)} className={toggle(isActive)}>{isActive ? <><Check className="w-3 h-3" /> Active</> : 'Blocked / inactive'}</button>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-forest/70 mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="optional" />
        </div>

        {!isRoom && (
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[12px] font-semibold text-forest/60">Rooms / sub-locations</p>
              <button type="button" onClick={addRoom} className="inline-flex items-center gap-1 text-[12px] font-medium text-forest/60 hover:text-forest"><Plus className="w-3.5 h-3.5" /> Add room</button>
            </div>
            {kids.length === 0 ? (
              <p className="text-[11px] text-forest/40 italic">No rooms yet.</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {kids.map(k => (
                  <button key={k.id} type="button" onClick={() => onOpen(k)} className="w-full flex items-center gap-2 py-1.5 text-left text-[12px] text-forest hover:text-sage">
                    <CornerDownRight className="w-3.5 h-3.5 text-forest/25" />
                    <span className={k.isActive ? '' : 'text-forest/40 line-through'}>{k.name}</span>
                    {k.bedCapacity != null && <span className="text-forest/40">· {k.bedCapacity} beds</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={save} className="flex-1 bg-forest text-cream text-[13px] font-medium py-2 rounded-btn hover:bg-forest/90 transition-colors">Save changes</button>
          <button onClick={remove} className="text-[13px] text-red hover:bg-red-bg px-3 py-2 rounded-btn transition-colors">Delete</button>
          <button onClick={onClose} className="text-[13px] text-forest/50 hover:text-forest px-3 py-2 rounded-btn transition-colors">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

interface ParsedRow { name: string; category: string; parent: string; isDorm: boolean; beds: number | null; accessible: boolean; }

function truthy(v: unknown) { return /^(y|yes|true|1|x|dorm|accessible)$/i.test(String(v ?? '').trim()); }

function LocationsTab() {
  const { topLevel, categories, addLocation, addCategory, deleteCategory } = useLocationStore();
  const locations = useLocationStore(s => s.locations);

  const [newTop, setNewTop] = useState('');
  const [newTopCat, setNewTopCat] = useState('');
  const [newCat, setNewCat] = useState('');
  const [showCats, setShowCats] = useState(false);
  const [detailLoc, setDetailLoc] = useState<CampLocation | null>(null);

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
  if (uncategorized.length) groups.push({ key: '_none', label: 'Uncategorized', catId: null, items: uncategorized });

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
        if (!raw.length) { alert('That file had no rows.'); return; }
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
        if (!rows.length) { alert('No usable rows (a "name" column is required).'); return; }
        setPreview({ rows, fileName: file.name });
        setSummary(null);
      } catch {
        alert('Could not read that file. Use a .csv or .xlsx file.');
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
    const resolveCat = (t: string) => (t ? catMap.get(t.toLowerCase()) ?? null : null);

    // Pass 1 — top-levels (no parent).
    const topRows = preview.rows.filter(r => !r.parent).map(r => ({
      name: r.name, categoryId: resolveCat(r.category), isDorm: r.isDorm,
      bedCapacity: r.beds, accessible: r.accessible,
    }));
    store.bulkAdd(topRows);

    // Build a name → id map of all current top-levels (existing + just-added).
    const topByName = new Map<string, string>();
    useLocationStore.getState().topLevel().forEach(l => topByName.set(l.name.toLowerCase(), l.id));

    // Pass 2 — children (resolve parent by name; unmatched parents become top-level).
    const childRows = preview.rows.filter(r => r.parent).map(r => ({
      name: r.name, parentId: topByName.get(r.parent.toLowerCase()) ?? null,
      categoryId: resolveCat(r.category), isDorm: r.isDorm,
      bedCapacity: r.beds, accessible: r.accessible,
    }));
    useLocationStore.getState().bulkAdd(childRows);

    const dorms = preview.rows.filter(r => r.isDorm).length;
    setSummary(`Imported ${preview.rows.length} location${preview.rows.length !== 1 ? 's' : ''}${dorms ? ` (${dorms} dorm${dorms !== 1 ? 's' : ''})` : ''}.`);
    setPreview(null);
  }

  return (
    <div className="p-7 max-w-3xl space-y-5">
      {detailLoc && <LocationDetailModal key={detailLoc.id} loc={detailLoc} onClose={() => setDetailLoc(null)} onOpen={setDetailLoc} />}
      {/* Locations tree */}
      <div className={cardCls}>
        <h2 className="text-[13px] font-semibold text-forest mb-1">Camp locations</h2>
        <p className="text-[12px] text-forest/40 mb-4">
          The unified place inventory — used across the app to tag issues, tasks, assets, dorms, and retreats.
        </p>

        {/* Two import paths: hand off to our team, or DIY spreadsheet import */}
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          {/* (a) Drop a file for our team — same hand-off channel as the Setup Files tab */}
          <ImplementationDropzone
            category="locations"
            title="Send us your list"
            blurb="Drop your spreadsheet (any format) and our team will set up your locations for you."
          />

          {/* (b) DIY spreadsheet import */}
          <div className="rounded-xl border border-stone-200 px-4 py-5 text-center bg-white flex flex-col items-center gap-1.5">
            <Upload className="w-5 h-5 text-forest/35" />
            <p className="text-[12px] font-semibold text-forest">Upload it yourself</p>
            <p className="text-[11px] text-forest/45 leading-snug">Format a CSV or spreadsheet and import it directly.</p>
            <div className="flex items-center gap-3 mt-1.5">
              <button onClick={() => fileRef.current?.click()} className="text-[12px] font-medium text-forest border border-stone-300 hover:border-forest/40 px-3 py-1.5 rounded-btn transition-colors">Choose file</button>
              <button onClick={() => setShowInstructions(v => !v)} className="text-[12px] text-forest/50 hover:text-forest inline-flex items-center gap-1">
                {showInstructions ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Formatting guide
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
          </div>
        </div>

        {/* Collapsible DIY formatting instructions */}
        {showInstructions && (
          <div className="mb-4 text-[12px] text-forest/55 bg-cream/60 border border-border rounded-btn px-3.5 py-2.5 leading-relaxed">
            <span className="font-semibold text-forest/70">Spreadsheet format</span> — one row per location. Column headers are matched loosely (case-insensitive):
            <ul className="mt-1.5 space-y-0.5 list-disc pl-4">
              <li><span className="font-medium text-forest/70">name</span> <span className="text-forest/40">(required)</span> — the location's name, e.g. “Birch Cabin”.</li>
              <li><span className="font-medium text-forest/70">category</span> — e.g. Housing, Waterfront, Dining. Created automatically if it's new.</li>
              <li><span className="font-medium text-forest/70">parent</span> — the exact name of another location to nest under (list parents above their children).</li>
              <li><span className="font-medium text-forest/70">dorm</span> — yes / true / x to mark a sleeping quarters.</li>
              <li><span className="font-medium text-forest/70">beds</span> — number of beds (dorms).</li>
              <li><span className="font-medium text-forest/70">accessible</span> — yes / true if ADA-accessible.</li>
            </ul>
            <p className="mt-1.5 text-forest/40">Example row: <code className="bg-white border border-border rounded px-1">Birch Cabin, Housing, , yes, 12, yes</code></p>
          </div>
        )}

        {/* Import preview */}
        {preview && (
          <div className="mb-4 p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
            <p className="text-[12px] font-medium text-forest">
              {preview.fileName} — {preview.rows.length} row{preview.rows.length !== 1 ? 's' : ''} ready
            </p>
            <div className="max-h-32 overflow-y-auto text-[12px] text-forest/60 space-y-0.5">
              {preview.rows.slice(0, 8).map((r, i) => (
                <div key={i} className="flex gap-2">
                  {r.parent && <CornerDownRight className="w-3.5 h-3.5 text-forest/25" />}
                  <span className="text-forest">{r.name}</span>
                  {r.category && <span className="text-forest/40">· {r.category}</span>}
                  {r.isDorm && <span className="text-sage">· dorm{r.beds ? ` (${r.beds})` : ''}</span>}
                </div>
              ))}
              {preview.rows.length > 8 && <p className="text-forest/30 italic">…and {preview.rows.length - 8} more</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={runImport} className="bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-btn">Import {preview.rows.length}</button>
              <button onClick={() => setPreview(null)} className="text-[12px] text-forest/50 hover:text-forest px-3 py-1.5">Cancel</button>
            </div>
          </div>
        )}
        {summary && (
          <div className="mb-4 flex items-center gap-2 text-[12px] text-sage bg-sage-pale/50 border border-sage/20 rounded-btn px-3 py-2">
            <Check className="w-3.5 h-3.5" /> {summary}
          </div>
        )}

        {locations.length === 0 && !preview && (
          <p className="text-[13px] text-forest/30 italic mb-4">No locations yet — add areas below or import a spreadsheet.</p>
        )}

        {/* Grouped tree */}
        <div className="space-y-4">
          {groups.filter(g => g.items.length > 0).map(g => (
            <div key={g.key}>
              <div className="flex items-center justify-between mb-0.5 pb-1 border-b border-stone-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/45">{g.label}</p>
                {g.catId && (
                  <button
                    onClick={() => setDetailLoc(addLocation({ name: 'New location', categoryId: g.catId }))}
                    className="text-[11px] text-forest/40 hover:text-forest transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add
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
            placeholder="e.g. Waterfront, Dining Hall, Bunk Row A"
          />
          <select value={newTopCat} onChange={e => setNewTopCat(e.target.value)} className={`${fieldCls} w-40 flex-shrink-0`}>
            <option value="">Uncategorized</option>
            {sortedCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={addTop}
            disabled={!newTop.trim()}
            className="flex items-center gap-1.5 bg-forest text-cream text-[13px] font-medium px-4 py-2 rounded-btn hover:bg-forest/90 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Category management */}
      <div className={cardCls}>
        <button onClick={() => setShowCats(v => !v)} className="flex items-center gap-1.5 text-[13px] font-semibold text-forest w-full">
          {showCats ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Categories
          <span className="text-[11px] font-normal text-forest/40 ml-1">({sortedCats.length})</span>
        </button>

        {showCats && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2 mb-4">
              {sortedCats.map(c => (
                <div key={c.id} className="flex items-center gap-1.5 bg-cream border border-border rounded-full px-3 py-1">
                  <span className="text-[12px] font-medium text-forest">{c.name}</span>
                  {c.isPreset ? (
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-forest/30">preset</span>
                  ) : (
                    <button
                      onClick={() => { if (confirm(`Delete category "${c.name}"? Locations in it become Uncategorized.`)) deleteCategory(c.id); }}
                      className="text-forest/30 hover:text-red transition-colors"
                      title={`Delete ${c.name}`}
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
                placeholder="Add a custom category…"
              />
              <button
                onClick={() => { if (newCat.trim()) { addCategory(newCat.trim()); setNewCat(''); } }}
                disabled={!newCat.trim()}
                className="flex items-center gap-1.5 bg-forest text-cream text-[13px] font-medium px-4 py-2 rounded-btn hover:bg-forest/90 transition-colors disabled:opacity-40 flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add
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
      <div className="px-4 sm:px-7 pt-7 pb-0 border-b border-border bg-white flex-shrink-0 overflow-x-auto">
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
        {activeTab === 'files'     && <ImplementationFilesTab />}
      </div>
    </div>
  );
}
