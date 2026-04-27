import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TreePine, Check, ArrowLeft, Plus, Users } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';

const CAMP_TYPES = ['Day Camp', 'Overnight Camp'];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const MODULE_OPTIONS = [
  { key: 'issues',     label: 'Issues & Repairs',    description: 'Track and assign maintenance issues' },
  { key: 'checklists', label: 'Pre/Post Checklists',  description: 'Opening and closing task lists' },
  { key: 'pool',       label: 'Pool & Waterfront',    description: 'Chemical logs, equipment, inspections' },
  { key: 'safety',     label: 'Safety & Compliance',  description: 'Fire safety, licensing, inspections' },
  { key: 'assets',     label: 'Assets & Vehicles',    description: 'Fleet, equipment, maintenance records' },
];

const DEFAULT_MODULES: Record<string, boolean> = {
  issues: true,
  checklists: true,
  safety: true,
  pool: false,
  assets: false,
};

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

export function CampSetup() {
  const { createCamp } = useCampStore();
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [campType, setCampType] = useState('Day Camp');
  const [state, setState] = useState('');
  const [modules, setModules] = useState<Record<string, boolean>>(DEFAULT_MODULES);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleModule(key: string) {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleCreate() {
    setError(null);
    setLoading(true);
    try {
      console.log('[CampSetup] calling createCamp', { name, campType, state, modules });
      await createCamp({
        name: name.trim(),
        slug: slugify(name),
        campType,
        state,
        modules,
      });
      console.log('[CampSetup] createCamp resolved, navigating to /onboarding');
      navigate('/onboarding', { replace: true });
    } catch (e) {
      console.error('[CampSetup] createCamp error:', e);
      setError(e instanceof Error ? e.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-[420px] shrink-0 bg-forest flex-col justify-between p-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center">
            <TreePine className="w-4.5 h-4.5 text-cream" />
          </div>
          <span className="text-lg font-semibold text-cream">CampCommand</span>
        </div>
        <div>
          <h2 className="text-[28px] font-bold text-cream leading-snug mb-3">
            Let's get your camp set up.
          </h2>
          <p className="text-[14px] text-cream/60 leading-relaxed">
            CampCommand brings your whole team onto one platform — maintenance, safety, pool logs, and more.
          </p>
        </div>
        <p className="text-[11px] text-cream/30">
          You can invite staff and adjust settings after setup.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-stone-50 p-6 sm:p-10">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-7 h-7 bg-forest rounded-lg flex items-center justify-center">
            <TreePine className="w-4 h-4 text-cream" />
          </div>
          <span className="text-base font-semibold text-forest">CampCommand</span>
        </div>

        <div className="w-full max-w-md">
          <button
            onClick={async () => {
              if (step === 0) { await signOut(); navigate('/login', { replace: true }); }
              else setStep(0);
            }}
            className="inline-flex items-center gap-1.5 text-[12px] text-forest/50 hover:text-forest mb-6 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {step === 0 ? 'Sign out' : 'Back'}
          </button>

          {/* Step indicator — only visible during create camp flow */}
          {step > 0 && (
            <div className="flex items-center gap-2 mb-7">
              {[1, 2].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
                    step > s ? 'bg-forest text-cream' :
                    step === s ? 'bg-forest text-cream' :
                    'bg-stone-200 text-stone-500'
                  }`}>
                    {step > s ? <Check className="w-3 h-3" /> : s}
                  </div>
                  {s < 2 && <div className={`w-8 h-px transition-colors ${step > s ? 'bg-forest' : 'bg-stone-200'}`} />}
                </div>
              ))}
              <span className="ml-2 text-[12px] text-forest/40">
                {step === 1 ? 'Camp info' : 'Choose modules'}
              </span>
            </div>
          )}

          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8">
            {/* Step 0 — choose path */}
            {step === 0 && (
              <>
                <h1 className="text-[18px] font-semibold text-forest mb-1">Welcome to CampCommand</h1>
                <p className="text-[12px] text-forest/50 mb-6">Are you setting up a new camp or joining an existing one?</p>
                <div className="space-y-3">
                  <button
                    onClick={() => setStep(1)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-stone-200 hover:border-forest/40 hover:bg-forest/5 text-left transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-forest/10 flex items-center justify-center flex-shrink-0 group-hover:bg-forest/15 transition-colors">
                      <Plus className="w-5 h-5 text-forest" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-forest">Create a new camp</p>
                      <p className="text-[12px] text-forest/50 mt-0.5">Set up CampCommand for your camp and invite your team</p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/join', { replace: true })}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-stone-200 hover:border-forest/40 hover:bg-forest/5 text-left transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-forest/10 flex items-center justify-center flex-shrink-0 group-hover:bg-forest/15 transition-colors">
                      <Users className="w-5 h-5 text-forest" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-forest">Join an existing camp</p>
                      <p className="text-[12px] text-forest/50 mt-0.5">Enter a join code from your camp administrator</p>
                    </div>
                  </button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h1 className="text-[18px] font-semibold text-forest mb-1">Camp information</h1>
                <p className="text-[12px] text-forest/50 mb-6">Tell us a bit about your camp.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[12px] font-medium text-forest/70 mb-1.5">Camp name</label>
                    <input
                      type="text"
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Pinecrest Summer Camp"
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-forest/70 mb-1.5">Camp type</label>
                    <select
                      value={campType}
                      onChange={(e) => setCampType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
                    >
                      {CAMP_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-forest/70 mb-1.5">State</label>
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] text-forest focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest/40"
                    >
                      <option value="">Select state</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => setStep(2)}
                  disabled={!name.trim() || !state}
                  className="w-full mt-6 bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-40"
                >
                  Continue
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="text-[18px] font-semibold text-forest mb-1">Choose modules</h1>
                <p className="text-[12px] text-forest/50 mb-5">
                  Enable the tools your camp will use. You can change these later in settings.
                </p>

                <div className="space-y-2">
                  {MODULE_OPTIONS.map((mod) => (
                    <button
                      key={mod.key}
                      onClick={() => toggleModule(mod.key)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        modules[mod.key]
                          ? 'border-forest/40 bg-forest/5'
                          : 'border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                        modules[mod.key] ? 'bg-forest border-forest' : 'border-stone-300'
                      }`}>
                        {modules[mod.key] && <Check className="w-2.5 h-2.5 text-cream" />}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-forest">{mod.label}</p>
                        <p className="text-[11px] text-forest/50 mt-0.5">{mod.description}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {error && (
                  <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-4">
                    {error}
                  </p>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 border border-stone-200 text-forest font-medium text-[13px] py-2.5 rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="flex-1 bg-forest text-cream font-medium text-[13px] py-2.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Creating…' : 'Create camp'}
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
