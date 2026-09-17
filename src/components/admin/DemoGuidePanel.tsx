import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Database, ExternalLink } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { loadDemoBrief, saveDemoBrief, seedDemoData } from '@/lib/demoGuideDb';
import { invalidateDemoBrief } from '@/lib/useDemoBrief';
import { SEEDABLE, SPOTLIGHTS, SPOTLIGHT_BY_KEY, type BriefSpotlight, type DemoBrief, type SpotlightKey } from '@/lib/demoSpotlights';

const INPUT = 'w-full text-[13px] bg-white border border-border rounded-btn px-2.5 py-1.5 focus:outline-none focus:border-sage';
const LABEL = 'block text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint mb-1';

/** Every template, in the brief's order first, then the rest switched off. */
function allSpotlights(stored: BriefSpotlight[]): BriefSpotlight[] {
  const seen = new Set(stored.map((s) => s.key));
  return [
    ...stored.filter((s) => SPOTLIGHT_BY_KEY[s.key]),
    ...SPOTLIGHTS.filter((t) => !seen.has(t.key)).map((t) => ({ key: t.key, enabled: false, summary: null })),
  ];
}

/**
 * The founder's editor for a demo's guide. Lives in the admin console rather than inside the
 * demo, because the prospect is an admin of their demo camp and must not be able to rewrite the
 * page that says what we built for them.
 */
export function DemoGuidePanel({ campId, onOpenGuide }: { campId: string; onOpenGuide: () => void }) {
  const [brief, setBrief] = useState<DemoBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState<SpotlightKey | null>(null);

  useEffect(() => {
    let alive = true;
    loadDemoBrief(campId)
      .then((b) => {
        if (!alive) return;
        setBrief(b ?? { campId, prospectName: null, headline: null, intro: null, spotlights: [], founderName: null, founderEmail: null });
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : 'Could not load'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [campId]);

  if (loading) return <p className="text-[12px] text-ink-soft">Loading the guide…</p>;
  if (!brief) return <p className="text-[12px] text-red">{err}</p>;

  const spots = allSpotlights(brief.spotlights);
  const set = (patch: Partial<DemoBrief>) => { setBrief({ ...brief, ...patch }); setSaved(false); };
  const setSpot = (i: number, patch: Partial<BriefSpotlight>) =>
    set({ spotlights: spots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= spots.length) return;
    const next = [...spots];
    [next[i], next[j]] = [next[j], next[i]];
    set({ spotlights: next });
  };

  async function save() {
    if (!brief) return;
    setSaving(true); setErr(null);
    try {
      await saveDemoBrief({ ...brief, spotlights: spots });
      invalidateDemoBrief(campId);
      setSaved(true);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); }
    finally { setSaving(false); }
  }

  async function seed(key: SpotlightKey) {
    if (!window.confirm(`Reset the ${SPOTLIGHT_BY_KEY[key].title.toLowerCase()} sample data in this demo camp? Anything a visitor added there stays; the sample rows are restored.`)) return;
    setSeeding(key); setSeedMsg(null);
    try {
      await seedDemoData(campId, [key]);
      setSeedMsg(`${SPOTLIGHT_BY_KEY[key].title}: sample data restored.`);
    } catch (e) { setSeedMsg(e instanceof Error ? e.message : 'Seeding failed'); }
    finally { setSeeding(null); }
  }

  return (
    <div className="max-w-4xl space-y-4" data-testid="demo-guide-panel">
      <p className="text-[11px] text-ink-faint">
        The page this demo opens on: the camp’s name, the features below with a short checklist each, and your contact details. Leave a field blank to use the default.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className={LABEL}>Heading</label><input className={INPUT} value={brief.headline ?? ''} onChange={(e) => set({ headline: e.target.value })} placeholder="Uses the camp’s name, e.g. Camp Ramah Canada Demo" /></div>
        <div><label className={LABEL}>Your name</label><input className={INPUT} value={brief.founderName ?? ''} onChange={(e) => set({ founderName: e.target.value })} placeholder="Eric Rosenbaum" /></div>
        <div><label className={LABEL}>Your email</label><input type="email" className={INPUT} value={brief.founderEmail ?? ''} onChange={(e) => set({ founderEmail: e.target.value })} placeholder="eric@campcommand.app" /></div>
      </div>

      <div className="space-y-2">
        <p className={LABEL}>Spotlights (in order)</p>
        {spots.map((s, i) => {
          const t = SPOTLIGHT_BY_KEY[s.key];
          return (
            <div key={s.key} className={`rounded-card border px-3 py-2.5 ${s.enabled ? 'bg-white border-border' : 'bg-cream-dark/30 border-cream-dark'}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={s.enabled} onChange={(e) => setSpot(i, { enabled: e.target.checked })} aria-label={`Show ${t.title}`} />
                <span className="text-[13px] font-semibold text-forest flex-1">{t.title}</span>
                <span className="text-[10.5px] text-ink-faint hidden sm:inline">needs: {t.modules.join(', ')}</span>
                <button type="button" onClick={() => move(i, -1)} className="p-1 text-ink-faint hover:text-forest" aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} className="p-1 text-ink-faint hover:text-forest" aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                {SEEDABLE.includes(s.key) && (
                  <Button size="sm" variant="ghost" disabled={seeding !== null} onClick={() => seed(s.key)}>
                    <Database className="w-3.5 h-3.5" /> {seeding === s.key ? 'Seeding…' : 'Reset sample data'}
                  </Button>
                )}
              </div>
              {s.enabled && (
                <div className="mt-2">
                  <label className={LABEL}>How it works</label>
                  <textarea rows={3} className={INPUT} value={s.summary ?? ''} onChange={(e) => setSpot(i, { summary: e.target.value })} placeholder={t.summary} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {seedMsg && <p className="text-[12px] text-ink-soft">{seedMsg}</p>}
      {err && <p className="text-[12px] text-red">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={saving} onClick={save}>
          {saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : saving ? 'Saving…' : 'Save guide'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpenGuide}><ExternalLink className="w-3.5 h-3.5" /> Open the guide as admin</Button>
      </div>
    </div>
  );
}
