import { useState, useEffect } from 'react';
import { useCampStore } from '@/store/campStore';

const CAMP_TYPES = ['Day Camp', 'Overnight Camp'];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const MODULE_OPTIONS = [
  { key: 'issues',     label: 'Issues & Repairs',   description: 'Track and assign maintenance issues' },
  { key: 'checklists', label: 'Pre/Post Checklists', description: 'Opening and closing task lists' },
  { key: 'pool',       label: 'Pool & Waterfront',   description: 'Chemical readings, inspections, equipment' },
  { key: 'safety',     label: 'Safety & Compliance', description: 'Fire safety, drills, staff certifications' },
  { key: 'assets',     label: 'Assets & Vehicles',   description: 'Fleet, equipment, checkouts, service records' },
];

export function CampSettings() {
  const { currentCamp, updateCamp } = useCampStore();

  const [name, setName] = useState('');
  const [campType, setCampType] = useState('');
  const [state, setState] = useState('');
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!currentCamp) return;
    setName(currentCamp.name);
    setCampType(currentCamp.campType ?? '');
    setState(currentCamp.state ?? '');
    setModules(currentCamp.modules ?? {});
  }, [currentCamp]);

  function toggleModule(key: string) {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentCamp) return;
    setSaving(true);
    try {
      await updateCamp(currentCamp.id, { name, campType, state, modules });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (!currentCamp) return null;

  return (
    <div className="p-7 max-w-2xl">
      <div className="mb-7">
        <h1 className="text-[20px] font-bold text-forest">Camp Settings</h1>
        <p className="text-[12px] text-forest/50 mt-0.5">Update your camp's profile and active modules</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic info */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-forest mb-4">Profile</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-forest/60 mb-1">Camp name</label>
              <input
                type="text" required value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">Camp type</label>
                <select
                  value={campType}
                  onChange={(e) => setCampType(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                >
                  <option value="">Select type</option>
                  {CAMP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
                >
                  <option value="">Select state</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Modules */}
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-forest mb-1">Modules</h2>
          <p className="text-[11px] text-forest/40 mb-4">Enable only the modules your camp uses</p>
          <div className="space-y-3">
            {MODULE_OPTIONS.map((mod) => (
              <label key={mod.key} className="flex items-center gap-3 cursor-pointer group">
                <div
                  className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${modules[mod.key] ? 'bg-forest' : 'bg-stone-200'}`}
                  onClick={() => toggleModule(mod.key)}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform ${modules[mod.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-forest">{mod.label}</p>
                  <p className="text-[11px] text-forest/40">{mod.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-forest text-cream text-[13px] font-medium px-5 py-2 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="text-[12px] text-green-600 font-medium">Saved</span>}
        </div>
      </form>
    </div>
  );
}
