import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, ChevronRight, TreePine, Waves, ClipboardList,
  ShieldCheck, Truck, MapPin, X, Plus, Users, Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCampStore } from '@/store/campStore';
import { usePoolStore } from '@/store/poolStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAssetStore } from '@/store/assetStore';
import { generateId } from '@/lib/utils';
import type { PoolType, SafetyItemType, SafetyFrequency, AssetCategory } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepKey = 'locations' | 'pool' | 'checklists' | 'safety' | 'assets' | 'team';

const STEP_META: Record<StepKey, { icon: React.ElementType; label: string }> = {
  locations:  { icon: MapPin,        label: 'Camp Locations' },
  pool:       { icon: Waves,         label: 'Pool & Waterfront' },
  checklists: { icon: ClipboardList, label: 'Pre/Post Checklists' },
  safety:     { icon: ShieldCheck,   label: 'Safety & Compliance' },
  assets:     { icon: Truck,         label: 'Assets & Vehicles' },
  team:       { icon: Users,         label: 'Invite Your Team' },
};

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SkipButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 border border-stone-200 text-forest/50 font-medium text-[13px] py-2.5 rounded-lg hover:bg-stone-50 hover:text-forest/70 transition-colors"
    >
      Skip for now
    </button>
  );
}

function PrimaryButton({ onClick, disabled, children }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/40 mb-2">{children}</p>;
}

function InputRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-forest/70 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20';
const selectCls = 'w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20';

// ─── STEP: Locations ─────────────────────────────────────────────────────────

const COMMON_LOCATIONS = [
  'Waterfront', 'Dining Hall', 'Main Lodge', 'Health Center / Infirmary',
  'Kitchen', 'Athletic Fields', 'Maintenance / Shop', 'Arts & Crafts',
  'Theater / Performance', 'Challenge Course / Ropes', 'Archery Range',
  'Camp Store', 'Laundry', 'Staff Housing', 'Parking / Roads',
];

// ─── Spreadsheet column picker ────────────────────────────────────────────────

interface SheetPickerProps {
  columns: string[];
  nameCol: string;
  sizeCol: string;
  onNameCol: (c: string) => void;
  onSizeCol: (c: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function SheetPicker({ columns, nameCol, sizeCol, onNameCol, onSizeCol, onConfirm, onCancel }: SheetPickerProps) {
  return (
    <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
      <p className="text-[12px] font-medium text-forest">Match spreadsheet columns</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-forest/50 mb-1">Cabin / location name <span className="text-red-500">*</span></label>
          <select value={nameCol} onChange={e => onNameCol(e.target.value)} className={selectCls}>
            <option value="">— select —</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-forest/50 mb-1">Size / capacity <span className="text-forest/30">(optional)</span></label>
          <select value={sizeCol} onChange={e => onSizeCol(e.target.value)} className={selectCls}>
            <option value="">— none —</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={!nameCol} className="bg-forest text-cream text-[12px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-40">Import</button>
        <button onClick={onCancel} className="text-[12px] text-forest/50 hover:text-forest px-3 py-1.5">Cancel</button>
      </div>
    </div>
  );
}

// ─── STEP: Locations ─────────────────────────────────────────────────────────

function LocationsStep({ campType, onDone }: { campType: string | null; onDone: (locs: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(['Waterfront', 'Dining Hall', 'Main Lodge', 'Health Center / Infirmary', 'Kitchen', 'Athletic Fields', 'Maintenance / Shop'])
  );
  const [custom, setCustom] = useState('');
  const [extras, setExtras] = useState<string[]>([]);

  // Cabin individual entry
  const [cabinInput, setCabinInput] = useState('');
  const [showCabinSection, setShowCabinSection] = useState(false);

  // Spreadsheet import
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheetColumns, setSheetColumns] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<Record<string, string>[]>([]);
  const [nameCol, setNameCol] = useState('');
  const [sizeCol, setSizeCol] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  function toggle(loc: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc); else next.add(loc);
      return next;
    });
  }

  function addCustom() {
    const val = custom.trim();
    if (!val || selected.has(val) || extras.includes(val)) return;
    setExtras(prev => [...prev, val]);
    setSelected(prev => new Set(prev).add(val));
    setCustom('');
  }

  function addCabin() {
    const val = cabinInput.trim();
    if (!val || selected.has(val) || extras.includes(val)) return;
    setExtras(prev => [...prev, val]);
    setSelected(prev => new Set(prev).add(val));
    setCabinInput('');
  }

  function removeExtra(loc: string) {
    setExtras(prev => prev.filter(e => e !== loc));
    setSelected(prev => { const next = new Set(prev); next.delete(loc); return next; });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        if (!rows.length) return;
        const cols = Object.keys(rows[0]);
        setSheetColumns(cols);
        setSheetRows(rows);
        // Auto-detect columns
        const guessName = cols.find(c => /name|cabin|bunk|location/i.test(c)) ?? cols[0] ?? '';
        const guessSize = cols.find(c => /size|capacity|beds|bunks/i.test(c)) ?? '';
        setNameCol(guessName);
        setSizeCol(guessSize);
        setShowPicker(true);
      } catch {
        alert('Could not read file. Please use a .csv or .xlsx file.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  function importFromSheet() {
    const names = sheetRows
      .map(r => {
        const name = String(r[nameCol] ?? '').trim();
        const size = sizeCol ? String(r[sizeCol] ?? '').trim() : '';
        return size ? `${name} (${size})` : name;
      })
      .filter(Boolean);

    const newNames = names.filter(n => !selected.has(n) && !extras.includes(n));
    setExtras(prev => [...prev, ...newNames]);
    setSelected(prev => {
      const next = new Set(prev);
      newNames.forEach(n => next.add(n));
      return next;
    });
    setShowPicker(false);
    setSheetRows([]);
    setSheetColumns([]);
  }

  const cabinExtras = extras.filter(e => selected.has(e));

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-forest/70 leading-relaxed">
        Choose the areas at your camp. These will appear when staff log issues or create tasks — use names your whole team will recognize. <span className="text-forest/50">Major areas work better than specific rooms.</span>
      </p>

      <div>
        <SectionLabel>Common areas</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5">
          {COMMON_LOCATIONS.map(loc => (
            <button
              key={loc}
              onClick={() => toggle(loc)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-[13px] transition-colors ${
                selected.has(loc)
                  ? 'border-forest/40 bg-forest/5 text-forest font-medium'
                  : 'border-stone-200 text-forest/60 hover:border-stone-300'
              }`}
            >
              <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                selected.has(loc) ? 'bg-forest border-forest' : 'border-stone-300'
              }`}>
                {selected.has(loc) && <Check className="w-2.5 h-2.5 text-cream" />}
              </div>
              {loc}
            </button>
          ))}
        </div>
      </div>

      {/* Cabins / individual + spreadsheet */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>
            {campType === 'Overnight Camp' ? 'Cabins / Bunks' : 'Cabins / Group Areas'}
          </SectionLabel>
          {!showCabinSection && (
            <button onClick={() => setShowCabinSection(true)} className="text-[12px] text-forest/50 hover:text-forest transition-colors">
              + Add cabins
            </button>
          )}
        </div>

        {showCabinSection && (
          <div className="space-y-3">
            {/* Individual entry */}
            <div className="flex gap-2">
              <input
                value={cabinInput}
                onChange={e => setCabinInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCabin()}
                className={inputCls}
                placeholder={campType === 'Overnight Camp' ? 'e.g. Birch Cabin, Cabin 7…' : 'e.g. Group Area A…'}
                autoFocus
              />
              <button onClick={addCabin} disabled={!cabinInput.trim()} className="bg-forest text-cream text-[13px] font-medium px-4 rounded-lg disabled:opacity-40 flex-shrink-0">
                Add
              </button>
            </div>

            {/* Spreadsheet upload */}
            <div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-[12px] text-forest/50 border border-dashed border-stone-300 px-3 py-2 rounded-lg hover:border-forest/40 hover:text-forest transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Import from spreadsheet (.csv or .xlsx)
              </button>
            </div>

            {showPicker && (
              <SheetPicker
                columns={sheetColumns}
                nameCol={nameCol}
                sizeCol={sizeCol}
                onNameCol={setNameCol}
                onSizeCol={setSizeCol}
                onConfirm={importFromSheet}
                onCancel={() => { setShowPicker(false); setSheetRows([]); setSheetColumns([]); }}
              />
            )}
          </div>
        )}

        {/* Added cabins list */}
        {cabinExtras.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {cabinExtras.map(loc => (
              <div key={loc} className="flex items-center justify-between text-[13px] text-forest bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                <span>{loc}</span>
                <button onClick={() => removeExtra(loc)} className="text-forest/30 hover:text-red-500 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom locations */}
      <div>
        <SectionLabel>Add more locations</SectionLabel>
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom()}
            className={inputCls}
            placeholder="e.g. Boat House, Climbing Wall, Horse Barn…"
          />
          <button onClick={addCustom} disabled={!custom.trim()} className="bg-forest text-cream text-[13px] font-medium px-4 rounded-lg disabled:opacity-40">Add</button>
        </div>
        {extras.filter(e => !cabinExtras.includes(e) && selected.has(e)).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {extras.filter(e => !cabinExtras.includes(e) && selected.has(e)).map(loc => (
              <span key={loc} className="inline-flex items-center gap-1 text-[12px] bg-forest/10 text-forest px-2.5 py-1 rounded-full">
                {loc}
                <button onClick={() => removeExtra(loc)} className="text-forest/40 hover:text-forest"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <PrimaryButton onClick={() => onDone([...selected])} disabled={selected.size === 0}>
          Save {selected.size} location{selected.size !== 1 ? 's' : ''} →
        </PrimaryButton>
      </div>
    </div>
  );
}

// ─── STEP: Pool ───────────────────────────────────────────────────────────────

interface PoolEntry { id: string; name: string; type: PoolType; }
interface GuardEntry { name: string; cert: string; certExpiry: string; }

const RESCUE_EQUIPMENT = [
  'Shepherd\'s crook / reaching pole', 'Ring buoy with rope', 'Rescue tube',
  'Backboard / spinal board', 'AED (Automated External Defibrillator)',
  'First aid kit', 'Safety throw bag', 'Emergency phone / radio',
];

function PoolStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { addPool, addEquipment } = usePoolStore();
  const { addStaff, addCert } = useSafetyStore();

  // Multiple pools
  const [pools, setPools] = useState<PoolEntry[]>([]);
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolType, setNewPoolType] = useState<PoolType>('pool');

  const [checkedEquip, setCheckedEquip] = useState<Set<string>>(new Set());
  const [customEquip, setCustomEquip] = useState('');
  const [extraEquip, setExtraEquip] = useState<string[]>([]);

  const [guards, setGuards] = useState<GuardEntry[]>([{ name: '', cert: 'lifeguard', certExpiry: '' }]);
  const [saving, setSaving] = useState(false);

  function addPoolEntry() {
    const name = newPoolName.trim();
    if (!name) return;
    setPools(prev => [...prev, { id: generateId(), name, type: newPoolType }]);
    setNewPoolName('');
    setNewPoolType('pool');
  }

  function removePool(id: string) {
    setPools(prev => prev.filter(p => p.id !== id));
  }

  function toggleEquip(e: string) {
    setCheckedEquip(prev => { const n = new Set(prev); n.has(e) ? n.delete(e) : n.add(e); return n; });
  }

  function addCustomEquip() {
    const v = customEquip.trim();
    if (!v) return;
    setExtraEquip(prev => [...prev, v]);
    setCheckedEquip(prev => new Set(prev).add(v));
    setCustomEquip('');
  }

  function updateGuard(i: number, field: keyof GuardEntry, val: string) {
    setGuards(prev => prev.map((g, idx) => idx === i ? { ...g, [field]: val } : g));
  }

  function handleSave() {
    setSaving(true);
    const now = new Date().toISOString();

    // Add all pools
    pools.forEach((p, idx) => {
      addPool({ id: p.id, name: p.name, type: p.type, isActive: true, notes: null, sortOrder: idx + 1, createdAt: now, updatedAt: now });
    });

    // Add equipment against the first pool (if any)
    const primaryPoolId = pools[0]?.id;
    if (primaryPoolId) {
      [...checkedEquip].forEach(name => {
        addEquipment({
          id: generateId(), poolId: primaryPoolId, name, type: 'safety', status: 'ok',
          statusDetail: '', lastServiced: null, nextServiceDue: null,
          vendor: null, specs: null, createdAt: now, updatedAt: now,
        });
      });
    }

    // Add lifeguards + certs
    guards.filter(g => g.name.trim()).forEach(g => {
      const staffId = generateId();
      addStaff({ id: staffId, name: g.name.trim(), title: 'Lifeguard', isActive: true, createdAt: now, updatedAt: now });
      if (g.cert) {
        addCert({
          id: generateId(), staffId, certType: g.cert as never,
          certName: g.cert === 'lifeguard' ? 'Lifeguard Certification' : g.cert === 'wsi' ? 'Water Safety Instructor' : g.cert === 'cpr_aed' ? 'CPR/AED' : 'First Aid',
          issuedDate: null, expiryDate: g.certExpiry || null, provider: null, notes: null, createdAt: now, updatedAt: now,
        });
      }
    });

    setSaving(false);
    onDone();
  }

  return (
    <div className="space-y-6">
      {/* Pools list */}
      <div>
        <SectionLabel>Pool / waterfront locations</SectionLabel>
        <p className="text-[12px] text-forest/50 mb-3">Add each pool, lake, or waterfront area your camp uses.</p>

        {pools.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {pools.map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                <span className="text-[13px] font-medium text-forest flex-1">{p.name}</span>
                <span className="text-[11px] text-forest/40 capitalize">
                  {p.type === 'pool' ? 'Swimming pool' : p.type === 'waterfront' ? 'Waterfront / lake' : 'Other'}
                </span>
                <button onClick={() => removePool(p.id)} className="text-stone-300 hover:text-red-500 transition-colors ml-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newPoolName}
              onChange={e => setNewPoolName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPoolEntry()}
              className={inputCls}
              placeholder={pools.length === 0 ? 'e.g. Main Pool' : 'Add another location…'}
            />
            <select value={newPoolType} onChange={e => setNewPoolType(e.target.value as PoolType)} className={selectCls}>
              <option value="pool">Swimming pool</option>
              <option value="waterfront">Waterfront / lake</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button onClick={addPoolEntry} disabled={!newPoolName.trim()} className="bg-forest text-cream text-[13px] font-medium px-4 py-2 rounded-lg disabled:opacity-40">
            Add location
          </button>
        </div>
      </div>

      {/* Equipment */}
      <div>
        <SectionLabel>Rescue equipment on hand</SectionLabel>
        <p className="text-[12px] text-forest/50 mb-2">Check off what's available at your waterfront.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[...RESCUE_EQUIPMENT, ...extraEquip].map(e => (
            <button key={e} onClick={() => toggleEquip(e)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-[12px] transition-colors ${
                checkedEquip.has(e) ? 'border-forest/40 bg-forest/5 text-forest' : 'border-stone-200 text-forest/60 hover:border-stone-300'
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border ${checkedEquip.has(e) ? 'bg-forest border-forest' : 'border-stone-300'}`}>
                {checkedEquip.has(e) && <Check className="w-2 h-2 text-cream" />}
              </div>
              {e}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input value={customEquip} onChange={e => setCustomEquip(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomEquip()} className={inputCls} placeholder="Other equipment…" />
          <button onClick={addCustomEquip} disabled={!customEquip.trim()} className="bg-forest/10 text-forest text-[12px] font-medium px-3 rounded-lg disabled:opacity-40">Add</button>
        </div>
      </div>

      {/* Lifeguards */}
      <div>
        <SectionLabel>Lifeguards & certifications</SectionLabel>
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_160px_160px_32px] gap-2 mb-1 px-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-forest/40">Name</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-forest/40">Certification</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-forest/40">Cert expires</span>
          <span />
        </div>
        <div className="space-y-2">
          {guards.map((g, i) => (
            <div key={i} className="grid grid-cols-[1fr_160px_160px_32px] gap-2 items-center">
              <input value={g.name} onChange={e => updateGuard(i, 'name', e.target.value)} className={inputCls} placeholder="Full name" />
              <select value={g.cert} onChange={e => updateGuard(i, 'cert', e.target.value)} className={selectCls}>
                <option value="lifeguard">Lifeguard</option>
                <option value="wsi">WSI</option>
                <option value="cpr_aed">CPR/AED</option>
                <option value="first_aid">First Aid</option>
              </select>
              <input type="date" value={g.certExpiry} onChange={e => updateGuard(i, 'certExpiry', e.target.value)} className={inputCls} />
              <button onClick={() => setGuards(prev => prev.filter((_, idx) => idx !== i))} className="flex items-center justify-center text-stone-300 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button onClick={() => setGuards(prev => [...prev, { name: '', cert: 'lifeguard', certExpiry: '' }])}
            className="inline-flex items-center gap-1.5 text-[12px] text-forest/50 hover:text-forest border border-dashed border-stone-300 px-3 py-2 rounded-lg hover:border-forest/40 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add lifeguard
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <PrimaryButton onClick={handleSave} disabled={pools.length === 0 || saving}>
          {saving ? 'Saving…' : 'Save & continue'}
        </PrimaryButton>
        <SkipButton onClick={onSkip} />
      </div>
    </div>
  );
}

// ─── STEP: Checklists ─────────────────────────────────────────────────────────

function ChecklistsStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { setSeason } = useChecklistStore();
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');

  function handleSave() {
    setSeason({ id: generateId(), name: name.trim() || `${new Date(opening).getFullYear()} Season`, openingDate: opening, closingDate: closing, acaInspectionDate: null });
    onDone();
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-forest/70 leading-relaxed">
        Your opening and closing dates are used to calculate task due dates on pre/post-camp checklists.
      </p>
      <InputRow label={<>Season name <span className="text-forest/30 font-normal">(optional)</span></>}>
        <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. Summer 2026" />
      </InputRow>
      <div className="grid grid-cols-2 gap-3">
        <InputRow label="Opening date"><input type="date" value={opening} onChange={e => setOpening(e.target.value)} className={inputCls} /></InputRow>
        <InputRow label="Closing date"><input type="date" value={closing} onChange={e => setClosing(e.target.value)} className={inputCls} /></InputRow>
      </div>
      <div className="flex gap-3">
        <PrimaryButton onClick={handleSave} disabled={!opening || !closing || closing < opening}>Save dates</PrimaryButton>
        <SkipButton onClick={onSkip} />
      </div>
    </div>
  );
}

// ─── STEP: Safety ─────────────────────────────────────────────────────────────

interface FireEquipEntry { type: 'extinguisher' | 'co_alarm'; location: string; expiry: string; }
interface DrillEntry { type: string; scheduledDate: string; lead: string; notes: string; }

const DRILL_TYPES = [
  { value: 'fire_evacuation', label: 'Fire Evacuation' },
  { value: 'nighttime_cabin', label: 'Nighttime Cabin Check' },
  { value: 'missing_swimmer', label: 'Missing Swimmer' },
  { value: 'severe_weather', label: 'Severe Weather / Tornado' },
  { value: 'medical_emergency', label: 'Medical Emergency' },
  { value: 'active_shooter', label: 'Active Shooter / Lockdown' },
  { value: 'missing_camper', label: 'Missing Camper' },
  { value: 'other', label: 'Other' },
];

const DEFAULT_SAFETY_LOCATIONS = ['Dining Hall', 'Main Lodge', 'Kitchen', 'Health Center / Infirmary', 'Waterfront', 'Athletic Fields', 'Maintenance / Shop'];

function SafetyStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { addItem, addDrill } = useSafetyStore();
  const campLocations = useCampStore(s => s.currentCamp?.locations ?? DEFAULT_SAFETY_LOCATIONS);

  const [fireEquip, setFireEquip] = useState<FireEquipEntry[]>([{ type: 'extinguisher', location: '', expiry: '' }]);
  const [hoodDate, setHoodDate] = useState('');
  const [drills, setDrills] = useState<DrillEntry[]>([{ type: 'fire_evacuation', scheduledDate: '', lead: '', notes: '' }]);
  const [saving, setSaving] = useState(false);

  function updateFireEquip(i: number, field: keyof FireEquipEntry, val: string) {
    setFireEquip(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  }

  function updateDrill(i: number, field: keyof DrillEntry, val: string) {
    setDrills(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));
  }

  async function handleSave() {
    setSaving(true);
    const now = new Date().toISOString();

    fireEquip.filter(e => e.location.trim()).forEach(e => {
      const freq: SafetyFrequency = 'annually';
      const type: SafetyItemType = e.type;
      addItem({
        id: generateId(),
        name: e.type === 'extinguisher' ? `Fire Extinguisher — ${e.location}` : `CO₂ Alarm — ${e.location}`,
        category: 'fire', type, location: e.location,
        unitCount: 1, frequency: freq, frequencyDays: 365,
        lastInspected: null, nextDue: e.expiry || null,
        vendor: null, notes: null, metadata: {}, createdAt: now, updatedAt: now,
      });
    });

    if (hoodDate) {
      addItem({
        id: generateId(), name: 'Kitchen Hood / Exhaust Fan', category: 'kitchen', type: 'hood_fan',
        location: 'Kitchen', unitCount: 1, frequency: 'quarterly', frequencyDays: 90,
        lastInspected: hoodDate, nextDue: null,
        vendor: null, notes: null, metadata: {}, createdAt: now, updatedAt: now,
      });
    }

    drills.filter(d => d.scheduledDate && d.lead.trim()).forEach(d => {
      addDrill({
        id: generateId(),
        drillType: d.type as never,
        drillName: null, status: 'scheduled',
        scheduledDate: d.scheduledDate, completedDate: null,
        lead: d.lead, participantCount: null,
        responseTime: null, allAccounted: null,
        notes: d.notes || null, createdAt: now, updatedAt: now,
      });
    });

    await new Promise(r => setTimeout(r, 150));
    setSaving(false);
    onDone();
  }

  return (
    <div className="space-y-6">
      {/* Fire equipment */}
      <div>
        <SectionLabel>Fire extinguishers & CO₂ alarms</SectionLabel>
        <div className="space-y-2">
          {fireEquip.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
              <select value={e.type} onChange={ev => updateFireEquip(i, 'type', ev.target.value)} className={selectCls}>
                <option value="extinguisher">Extinguisher</option>
                <option value="co_alarm">CO₂ Alarm</option>
              </select>
              <select value={e.location} onChange={ev => updateFireEquip(i, 'location', ev.target.value)} className={selectCls}>
                <option value="">Select location…</option>
                {campLocations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <div>
                <label className="block text-[10px] text-forest/40 mb-0.5">Expiry / next service</label>
                <input type="date" value={e.expiry} onChange={ev => updateFireEquip(i, 'expiry', ev.target.value)} className={inputCls + ' w-36'} />
              </div>
              <button onClick={() => setFireEquip(prev => prev.filter((_, idx) => idx !== i))} className="text-stone-400 hover:text-red-500 px-1 self-end pb-2"><X className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => setFireEquip(prev => [...prev, { type: 'extinguisher', location: '', expiry: '' }])}
            className="inline-flex items-center gap-1.5 text-[12px] text-forest/50 hover:text-forest border border-dashed border-stone-300 px-3 py-2 rounded-lg hover:border-forest/40 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add item
          </button>
        </div>
      </div>

      {/* Kitchen */}
      <div>
        <SectionLabel>Kitchen</SectionLabel>
        <InputRow label="Last hood/exhaust fan cleaning">
          <input type="date" value={hoodDate} onChange={e => setHoodDate(e.target.value)} className={inputCls + ' max-w-xs'} />
        </InputRow>
      </div>

      {/* Drills */}
      <div>
        <SectionLabel>Drills & training</SectionLabel>
        <div className="space-y-2">
          {drills.map((d, i) => (
            <div key={i} className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-end">
              <select value={d.type} onChange={e => updateDrill(i, 'type', e.target.value)} className={selectCls + ' w-44'}>
                {DRILL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input type="date" value={d.scheduledDate} onChange={e => updateDrill(i, 'scheduledDate', e.target.value)} className={inputCls + ' w-36'} />
              <input value={d.lead} onChange={e => updateDrill(i, 'lead', e.target.value)} className={inputCls} placeholder="Lead / responsible person" />
              <button onClick={() => setDrills(prev => prev.filter((_, idx) => idx !== i))} className="text-stone-400 hover:text-red-500 px-1 pb-0.5"><X className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => setDrills(prev => [...prev, { type: 'fire_evacuation', scheduledDate: '', lead: '', notes: '' }])}
            className="inline-flex items-center gap-1.5 text-[12px] text-forest/50 hover:text-forest border border-dashed border-stone-300 px-3 py-2 rounded-lg hover:border-forest/40 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add drill
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <PrimaryButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save & continue'}</PrimaryButton>
        <SkipButton onClick={onSkip} />
      </div>
    </div>
  );
}

// ─── STEP: Assets ─────────────────────────────────────────────────────────────

interface AssetEntry { name: string; category: AssetCategory; make: string; year: string; notes: string; }

const ASSET_CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'golf_cart', label: 'Golf Cart / Utility Vehicle' },
  { value: 'watercraft', label: 'Watercraft / Boat' },
  { value: 'large_equipment', label: 'Large Equipment' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'other', label: 'Other' },
];

function AssetsStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { addAsset } = useAssetStore();
  const [assets, setAssets] = useState<AssetEntry[]>([{ name: '', category: 'vehicle', make: '', year: '', notes: '' }]);
  const [saving, setSaving] = useState(false);

  function updateAsset(i: number, field: keyof AssetEntry, val: string) {
    setAssets(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a));
  }

  async function handleSave() {
    setSaving(true);
    const now = new Date().toISOString();
    assets.filter(a => a.name.trim()).forEach(a => {
      addAsset({
        id: generateId(), name: a.name.trim(), category: a.category, subtype: '',
        make: a.make || null, model: null, year: a.year ? parseInt(a.year) : null,
        serialNumber: null, licensePlate: null, registrationExpiry: null,
        storageLocation: '', status: 'available',
        currentOdometer: null, currentHours: null,
        tracksOdometer: a.category === 'vehicle', tracksHours: false,
        notes: a.notes || null, isActive: true,
        hullId: null, uscgRegistration: null, uscgRegistrationExpiry: null,
        capacity: null, motorType: null, hasLifejackets: null, lifejacketCount: null,
        createdAt: now, updatedAt: now,
      });
    });
    await new Promise(r => setTimeout(r, 150));
    setSaving(false);
    onDone();
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-forest/70 leading-relaxed">
        Add your camp's vehicles and major equipment. You can add maintenance schedules and track checkouts after setup.
      </p>

      <div className="space-y-3">
        {assets.map((a, i) => (
          <div key={i} className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-forest/50">Asset {i + 1}</span>
              {assets.length > 1 && (
                <button onClick={() => setAssets(prev => prev.filter((_, idx) => idx !== i))} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <InputRow label="Name / description">
                <input value={a.name} onChange={e => updateAsset(i, 'name', e.target.value)} className={inputCls} placeholder="e.g. Camp Van, Kubota Mower" />
              </InputRow>
              <InputRow label="Category">
                <select value={a.category} onChange={e => updateAsset(i, 'category', e.target.value)} className={selectCls}>
                  {ASSET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </InputRow>
              <InputRow label="Make / brand (optional)">
                <input value={a.make} onChange={e => updateAsset(i, 'make', e.target.value)} className={inputCls} placeholder="e.g. Ford, Honda" />
              </InputRow>
              <InputRow label="Year (optional)">
                <input type="number" value={a.year} onChange={e => updateAsset(i, 'year', e.target.value)} className={inputCls} placeholder="2019" />
              </InputRow>
            </div>
            <InputRow label="Notes (optional)">
              <input value={a.notes} onChange={e => updateAsset(i, 'notes', e.target.value)} className={inputCls} placeholder="Any relevant details…" />
            </InputRow>
          </div>
        ))}
        <button onClick={() => setAssets(prev => [...prev, { name: '', category: 'vehicle', make: '', year: '', notes: '' }])}
          className="inline-flex items-center gap-1.5 text-[13px] text-forest/50 hover:text-forest border border-dashed border-stone-300 px-4 py-2.5 rounded-lg hover:border-forest/40 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add another asset
        </button>
      </div>

      <div className="flex gap-3">
        <PrimaryButton onClick={handleSave} disabled={!assets.some(a => a.name.trim()) || saving}>
          {saving ? 'Saving…' : 'Save & continue'}
        </PrimaryButton>
        <SkipButton onClick={onSkip} />
      </div>
    </div>
  );
}

// ─── STEP: Team ───────────────────────────────────────────────────────────────

function TeamStep({ onDone }: { onDone: () => void }) {
  const { currentCamp, inviteMember } = useCampStore();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('admin');
  const [invites, setInvites] = useState<{ email: string; role: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendInvite() {
    if (!email.trim() || !currentCamp) return;
    setSending(true);
    setError(null);
    try {
      await inviteMember(currentCamp.id, email.trim(), role, null);
      setInvites(prev => [...prev, { email: email.trim(), role }]);
      setEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send invite');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-forest/70 leading-relaxed">
        Invite your key operators — directors, maintenance leads, waterfront staff. They'll get a link to create their account and join your camp.
      </p>
      <p className="text-[12px] text-forest/50 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5">
        💡 <strong>Tip:</strong> For staff who only need to appear in certification records (lifeguards, counselors), add them later in the Safety or other modules — they don't need app accounts.
      </p>

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendInvite()}
          className={inputCls}
          placeholder="colleague@example.com"
        />
        <select value={role} onChange={e => setRole(e.target.value as 'admin' | 'staff')} className={selectCls + ' w-28'}>
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
        </select>
        <button onClick={sendInvite} disabled={!email.trim() || sending} className="bg-forest text-cream text-[13px] font-medium px-4 rounded-lg disabled:opacity-40 flex-shrink-0">
          {sending ? '…' : 'Invite'}
        </button>
      </div>

      {error && <p className="text-[12px] text-red-600">{error}</p>}

      {invites.length > 0 && (
        <div className="space-y-1.5">
          {invites.map((inv, i) => (
            <div key={i} className="flex items-center gap-2 text-[13px] text-forest/70">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span>{inv.email}</span>
              <span className="text-forest/30 capitalize">· {inv.role}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <PrimaryButton onClick={onDone}>
          {invites.length > 0 ? 'Done — go to dashboard' : 'Skip — go to dashboard'}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Onboarding() {
  const { currentCamp, updateCamp } = useCampStore();
  const navigate = useNavigate();

  const modules = currentCamp?.modules ?? {};
  const campType = currentCamp?.campType ?? null;

  const steps: StepKey[] = [
    'locations',
    ...((['pool', 'checklists', 'safety', 'assets'] as StepKey[]).filter(k => modules[k])),
    'team',
  ];

  const [currentIdx, setCurrentIdx] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<StepKey>>(new Set());

  function goTo(idx: number) {
    setCurrentIdx(idx);
  }

  function advance(key: StepKey, markDone = true) {
    if (markDone) setCompletedSteps(prev => new Set(prev).add(key));
    const idx = steps.indexOf(key);
    if (idx + 1 < steps.length) {
      setCurrentIdx(idx + 1);
    } else {
      navigate('/', { replace: true });
    }
  }

  function handleLocationsDone(locs: string[]) {
    if (currentCamp) {
      updateCamp(currentCamp.id, { locations: locs }).catch(e => console.error('Failed to save locations:', e));
    }
    advance('locations');
  }

  if (!currentCamp) { navigate('/', { replace: true }); return null; }

  return (
    <div className="min-h-screen w-full flex">
      {/* Left sidebar */}
      <div className="hidden lg:flex w-[260px] shrink-0 bg-forest flex-col p-8">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center">
            <TreePine className="w-4.5 h-4.5 text-cream" />
          </div>
          <span className="text-base font-semibold text-cream">CampCommand</span>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-widest text-cream/30 mb-3">Setup</p>
        <div className="space-y-0.5">
          {steps.map((key, idx) => {
            const meta = STEP_META[key];
            const done = completedSteps.has(key);
            const active = idx === currentIdx;
            const Icon = meta.icon;
            return (
              <button
                key={key}
                onClick={() => goTo(idx)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors text-left ${
                  active ? 'bg-white/15' : 'hover:bg-white/8'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-white/25' : active ? 'bg-white/15' : 'bg-transparent'}`}>
                  {done ? <Check className="w-3 h-3 text-cream" /> : <span className="text-[10px] font-bold text-cream/50">{idx + 1}</span>}
                </div>
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-cream' : 'text-cream/40'}`} />
                <span className={`text-[12px] font-medium ${active ? 'text-cream' : 'text-cream/40'}`}>{meta.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-auto">
          <button onClick={() => navigate('/', { replace: true })} className="text-[11px] text-cream/30 hover:text-cream/60 transition-colors">
            Skip setup →
          </button>
        </div>
      </div>

      {/* Right content */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start bg-stone-50 p-6 sm:p-10">
        <div className="lg:hidden flex items-center justify-between w-full max-w-2xl mb-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-forest rounded-lg flex items-center justify-center"><TreePine className="w-3.5 h-3.5 text-cream" /></div>
            <span className="text-sm font-semibold text-forest">CampCommand</span>
          </div>
          <button onClick={() => navigate('/', { replace: true })} className="text-[12px] text-forest/40 hover:text-forest">Skip →</button>
        </div>

        <div className="w-full max-w-2xl">
          {/* Progress bar */}
          <div className="flex gap-1 mb-8">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-1 flex-1 rounded-full transition-colors ${i < currentIdx ? 'bg-forest' : i === currentIdx ? 'bg-forest/50' : 'bg-stone-200'}`}
              />
            ))}
          </div>

          {/* All steps rendered — hidden when not active so state is preserved */}
          {steps.map((key, idx) => {
            const active = idx === currentIdx;
            const Icon = STEP_META[key].icon;
            return (
              <div key={key} className={active ? '' : 'hidden'}>
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-forest/8 rounded-xl flex items-center justify-center">
                      <Icon className="w-5 h-5 text-forest/60" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/40">Step {idx + 1} of {steps.length}</p>
                      <h2 className="text-[17px] font-semibold text-forest">{STEP_META[key].label}</h2>
                    </div>
                  </div>

                  {key === 'locations' && <LocationsStep campType={campType} onDone={handleLocationsDone} />}
                  {key === 'pool' && <PoolStep onDone={() => advance('pool')} onSkip={() => advance('pool', false)} />}
                  {key === 'checklists' && <ChecklistsStep onDone={() => advance('checklists')} onSkip={() => advance('checklists', false)} />}
                  {key === 'safety' && <SafetyStep onDone={() => advance('safety')} onSkip={() => advance('safety', false)} />}
                  {key === 'assets' && <AssetsStep onDone={() => advance('assets')} onSkip={() => advance('assets', false)} />}
                  {key === 'team' && <TeamStep onDone={() => navigate('/', { replace: true })} />}
                </div>

                {active && idx + 1 < steps.length && (
                  <p className="text-center text-[12px] text-forest/35 mt-4 flex items-center justify-center gap-1">
                    Next: {STEP_META[steps[idx + 1]].label}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
