import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Check, Copy, Download, Mail, RotateCcw, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Topbar } from '@/components/layout/Topbar';
import { CampLoader } from '@/components/shared/ModuleLoading';
import { useCampStore } from '@/store/campStore';
import { useAuthStore } from '@/store/authStore';
import { useModules } from '@/lib/modules';
import { SEEDABLE, fillHref, resolveSpotlights, type AutoCheckId, type SpotlightKey, type DemoBrief, type ResolvedSpotlight, type SpotlightStep } from '@/lib/demoSpotlights';
import { buildSampleStatementCsv, resetDemoSampleData, loadDemoBrief, loadGuideContext, loadJoinedAt, runAutoChecks, type GuideContext } from '@/lib/demoGuideDb';

/**
 * The page a prospect lands on when they open their demo link.
 *
 * It exists because a demo that opens on an operations dashboard asks the visitor to find the
 * point themselves. This one says who it was built for, quotes what they told us, and gives
 * each answer as two minutes of steps with a button that opens the exact screen.
 */
export function DemoGuide() {
  const camp = useCampStore((s) => s.currentCamp);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const modules = useModules();
  const [brief, setBrief] = useState<DemoBrief | null | undefined>(undefined);
  const [ctx, setCtx] = useState<GuideContext>({});
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [autoDone, setAutoDone] = useState<Set<AutoCheckId>>(new Set());
  const [manualDone, setManualDone] = useManualTicks(camp?.id ?? null, userId);

  const isDemoCamp = camp?.accountType === 'trial' || camp?.accountType === 'demo';

  useEffect(() => {
    if (!camp || !isDemoCamp) return;
    let alive = true;
    loadDemoBrief(camp.id).then((b) => { if (alive) setBrief(b); }).catch(() => { if (alive) setBrief(null); });
    loadGuideContext(camp.id).then((c) => { if (alive) setCtx(c); });
    if (userId) loadJoinedAt(camp.id, userId).then((j) => { if (alive) setJoinedAt(j); });
    return () => { alive = false; };
  }, [camp, isDemoCamp, userId]);

  const spotlights = useMemo(
    () => resolveSpotlights(brief ?? null, modules.enabled),
    [brief, modules],
  );

  const autoIds = useMemo(() => spotlights.flatMap((s) => s.steps)
    .flatMap((st) => (st.check.kind === 'auto' ? [st.check.id] : [])), [spotlights]);

  const refreshChecks = useCallback(async () => {
    if (!camp || !joinedAt || !userId || autoIds.length === 0) return;
    setAutoDone(await runAutoChecks(camp.id, joinedAt, userId, autoIds));
  }, [camp, joinedAt, userId, autoIds]);

  // Ticks follow what the visitor does in other tabs (the public request link opens in one), so
  // re-check when they come back to this tab and on a slow interval while it is open.
  useEffect(() => {
    const first = window.setTimeout(refreshChecks, 0);
    const onFocus = () => { refreshChecks(); };
    window.addEventListener('focus', onFocus);
    const t = window.setInterval(refreshChecks, 20_000);
    return () => { window.clearTimeout(first); window.removeEventListener('focus', onFocus); window.clearInterval(t); };
  }, [refreshChecks]);

  if (!camp) return null;
  if (!isDemoCamp || brief === null) return <Navigate to="/home" replace />;
  if (brief === undefined) {
    return <div className="flex-1 grid place-items-center"><CampLoader size="sm" /></div>;
  }

  const stepKey = (s: ResolvedSpotlight, i: number) => `${s.key}:${i}`;
  const isDone = (s: ResolvedSpotlight, st: SpotlightStep, i: number) =>
    st.check.kind === 'auto' ? autoDone.has(st.check.id) || manualDone.has(stepKey(s, i)) : manualDone.has(stepKey(s, i));
  const total = spotlights.reduce((n, s) => n + s.steps.length, 0);
  const done = spotlights.reduce((n, s) => n + s.steps.filter((st, i) => isDone(s, st, i)).length, 0);

  const prospect = brief?.prospectName?.trim();
  const headline = brief?.headline?.trim()
    || (prospect ? `Built for ${prospect}, after our conversation` : `Welcome to your CampCommand demo`);

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar title="Demo guide" subtitle={prospect ? `For ${prospect} · ${camp.name}` : camp.name} />

      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-5">
          <section className="bg-forest text-paper rounded-card px-5 py-5 sm:px-7 sm:py-6">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-side">
              <Sparkles className="w-3.5 h-3.5" /> Your demo
            </p>
            <h2 className="font-display text-[22px] sm:text-[28px] font-bold leading-tight mt-2">{headline}</h2>
            {brief?.intro && (
              <p className="text-[14px] sm:text-[15px] leading-relaxed text-side-strong/90 mt-2.5 whitespace-pre-line max-w-2xl">{brief.intro}</p>
            )}
            <p className="text-[12.5px] text-side mt-3 max-w-2xl">
              This is a working copy of CampCommand filled with sample data. Click anything and try it out — nothing here
              touches a real camp, and every change you make is really saved.
            </p>
            {total > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <div className="h-1.5 flex-1 max-w-xs rounded-pill bg-white/15 overflow-hidden">
                  <div className="h-full bg-amber rounded-pill transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                </div>
                <span className="text-[12px] font-semibold text-side-strong" data-testid="guide-progress">{done} of {total} steps tried</span>
              </div>
            )}
          </section>

          <SharedDemoBar seedable={spotlights.map((s) => s.key).filter((k) => SEEDABLE.includes(k))} />

          {spotlights.length === 0 && (
            <div className="bg-white rounded-card border border-border p-5 text-center">
              <p className="text-[13px] text-ink-soft">Nothing is highlighted for this demo yet. Explore anything in the sidebar.</p>
              <Link to="/home" className="inline-block mt-2 text-[13px] font-semibold text-forest underline">Go to the dashboard</Link>
            </div>
          )}

          {spotlights.map((s, n) => (
            <SpotlightCard
              key={s.key}
              number={n + 1}
              spotlight={s}
              ctx={ctx}
              isDone={(st, i) => isDone(s, st, i)}
              onToggle={(i) => setManualDone(stepKey(s, i))}
            />
          ))}

          <FooterCard brief={brief ?? null} shareUrl={ctx.shareUrl ?? null} />
        </div>
      </div>
    </div>
  );
}

function SpotlightCard({ number, spotlight: s, ctx, isDone, onToggle }: {
  number: number;
  spotlight: ResolvedSpotlight;
  ctx: GuideContext;
  isDone: (st: SpotlightStep, i: number) => boolean;
  onToggle: (i: number) => void;
}) {
  const navigate = useNavigate();
  const doneCount = s.steps.filter((st, i) => isDone(st, i)).length;

  return (
    <section className="bg-white rounded-card border border-border overflow-hidden" data-testid={`spotlight-${s.key}`}>
      <header className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 flex items-start gap-3">
        <span className="grid place-items-center w-8 h-8 rounded-full bg-sage-pale text-forest font-display font-bold text-[15px] flex-shrink-0">{number}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[18px] sm:text-[20px] font-bold text-forest leading-snug">{s.title}</h3>
          <p className="text-[11.5px] text-ink-faint mt-0.5">{doneCount} of {s.steps.length} tried</p>
        </div>
      </header>

      <div className="grid sm:grid-cols-2 gap-3 sm:gap-5 px-4 sm:px-6 pb-4">
        <div className="border-l-[3px] border-amber pl-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-text">What you told us</p>
          <p className="text-[13.5px] text-ink leading-relaxed mt-1 italic">“{s.youToldUs}”</p>
        </div>
        <div className="border-l-[3px] border-sage pl-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-green-muted-text">What we built</p>
          <p className="text-[13.5px] text-ink leading-relaxed mt-1">{s.whatWeBuilt}</p>
        </div>
      </div>

      {s.key === 'food_requests' && ctx.foodLink && <CounselorPanel link={ctx.foodLink} qrDataUrl={ctx.foodLinkQr ?? null} programName={ctx.foodProgramName ?? null} />}
      {s.key === 'receipts' && <SampleStatementPanel />}

      <ol className="border-t border-cream-dark divide-y divide-cream-dark">
        {s.steps.map((st, i) => {
          const done = isDone(st, i);
          const href = fillHref(st.href, ctx as Record<string, string | null | undefined>);
          const auto = st.check.kind === 'auto';
          return (
            <li key={i} className="flex items-start gap-3 px-4 sm:px-6 py-3">
              <button
                type="button"
                onClick={() => onToggle(i)}
                aria-pressed={done}
                aria-label={done ? 'Mark as not tried' : 'Mark as tried'}
                title={auto ? 'Ticks itself when you do it — or tick it yourself' : 'Tick when you’ve tried it'}
                className={`mt-0.5 grid place-items-center w-6 h-6 rounded-full border-2 flex-shrink-0 transition-colors ${done ? 'bg-forest border-forest text-paper' : 'border-border hover:border-sage bg-white'}`}
              >
                {done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-[13.5px] leading-snug ${done ? 'text-ink-soft' : 'text-ink'}`}>{st.text}</p>
                {st.notice && <p className="text-[12px] text-ink-faint mt-0.5">{st.notice}</p>}
              </div>
              {href && (
                st.newTab ? (
                  <a href={href} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12.5px] font-bold text-forest bg-white border border-border hover:border-sage rounded-btn px-3 py-1.5 flex-shrink-0">
                    Open <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <button type="button" onClick={() => navigate(href)}
                    className="inline-flex items-center gap-1 text-[12.5px] font-bold text-paper bg-forest hover:bg-forest-mid rounded-btn px-3 py-1.5 flex-shrink-0">
                    Open <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The two-screens moment. A prospect scanning this with their own phone and watching the request
 * land in the kitchen inbox on their laptop is the demo; a description of it is not.
 */
function CounselorPanel({ link, qrDataUrl, programName }: { link: string; qrDataUrl: string | null; programName: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-4 sm:mx-6 mb-4 rounded-card bg-cream-dark/50 border border-cream-dark p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center">
      {qrDataUrl && (
        <img src={qrDataUrl} alt="QR code for the request link" className="w-28 h-28 rounded-tag bg-white p-1.5 border border-border flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-forest">Be the counselor, on your phone</p>
        <p className="text-[12.5px] text-ink-soft mt-0.5 leading-relaxed">
          Scan this with your phone camera to open {programName ? `the ${programName}` : 'a program'}’s request form — no login.
          Send a request and watch it arrive in the kitchen inbox on this screen. Use your real email to get the reminder too.
        </p>
        <div className="mt-2 flex items-center gap-2 min-w-0">
          <code className="text-[11px] text-ink-soft bg-white border border-border rounded-tag px-2 py-1 truncate min-w-0">{link}</code>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-forest flex-shrink-0">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Two things a shared demo needs that a private one does not.
 *
 * A name: every /try/ visitor arrives as "Demo guest", so a request approved by the prospect and
 * one approved by their director looked like the same person did both.
 *
 * A way back: whoever opened the link first can finish last month's reconciliation, and the next
 * person finds nothing left to try. Resetting rewrites the sample rows and keeps what people made.
 */
function SharedDemoBar({ seedable }: { seedable: SpotlightKey[] }) {
  const camp = useCampStore((s) => s.currentCamp);
  const member = useCampStore((s) => s.currentMember);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'name' | 'reset' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const shownAs = member?.displayName?.trim() || 'Demo guest';

  async function saveName() {
    const n = name.trim();
    if (!camp || !userId || !member || n.length < 2) return;
    setBusy('name');
    try {
      await Promise.all([
        supabase.from('profiles').update({ full_name: n }).eq('id', userId),
        supabase.from('camp_members').update({ display_name: n }).eq('id', member.id),
      ]);
      await useCampStore.getState().loadMyCamps();
      await useCampStore.getState().selectCamp(camp.id);
      setEditing(false);
      setMsg(`Thanks, ${n.split(' ')[0]}. That’s the name others in this demo will see.`);
    } finally { setBusy(null); }
  }

  async function reset() {
    if (!camp) return;
    setBusy('reset'); setMsg(null);
    try {
      await resetDemoSampleData(camp.id, seedable);
      setConfirming(false);
      setMsg('The sample data is back as it started. Anything people added is still there.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not reset the sample data.');
    } finally { setBusy(null); }
  }

  return (
    <section className="bg-white rounded-card border border-border px-4 sm:px-6 py-3 space-y-2" data-testid="shared-demo-bar">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="min-w-0 flex-1 text-[13px] text-ink">
          {editing ? (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
              <label htmlFor="demo-name" className="text-ink-soft">Your name</label>
              <input id="demo-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
                className="text-[13px] bg-white border border-border rounded-btn px-2.5 py-1.5 focus:outline-none focus:border-sage min-w-0 w-44" />
              <button type="submit" disabled={busy === 'name' || name.trim().length < 2}
                className="text-[12.5px] font-bold text-paper bg-forest hover:bg-forest-mid rounded-btn px-3 py-1.5 disabled:opacity-50">
                {busy === 'name' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-[12.5px] text-ink-soft underline">Cancel</button>
            </form>
          ) : (
            <p>
              You appear as <span className="font-semibold">{shownAs}</span> to anyone else using this link.{' '}
              <button type="button" onClick={() => { setName(shownAs === 'Demo guest' ? '' : shownAs); setEditing(true); }}
                className="font-semibold text-forest underline">Use your name</button>
            </p>
          )}
        </div>
        {seedable.length > 0 && !confirming && (
          <button type="button" onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-forest hover:underline self-start sm:self-auto">
            <RotateCcw className="w-3.5 h-3.5" /> Reset the sample data
          </button>
        )}
      </div>
      {confirming && (
        <div className="rounded-card bg-amber-bg border border-amber/30 px-3 py-2.5 text-[12.5px] text-amber-text flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="flex-1">
            Everyone with this link shares one demo, so someone may already have tried the steps below. Resetting puts the sample
            requests, trips and receipts back the way they started. Anything people added stays.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={reset} disabled={busy === 'reset'}
              className="text-[12.5px] font-bold text-paper bg-forest hover:bg-forest-mid rounded-btn px-3 py-1.5 disabled:opacity-50">
              {busy === 'reset' ? 'Resetting…' : 'Reset it'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-[12.5px] font-semibold text-amber-text underline">Keep as is</button>
          </div>
        </div>
      )}
      {msg && <p className="text-[12.5px] text-green-muted-text" role="status">{msg}</p>}
    </section>
  );
}

/**
 * "Import a statement yourself" needs a statement. It is built from this demo's own sample
 * receipts, so the import actually matches instead of producing a page of unmatched charges.
 */
function SampleStatementPanel() {
  const camp = useCampStore((s) => s.currentCamp);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  async function download() {
    if (!camp) return;
    setBusy(true);
    try {
      const sample = await buildSampleStatementCsv(camp.id);
      if (!sample) { setMissing(true); return; }
      const url = URL.createObjectURL(new Blob([sample.csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = sample.fileName;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-4 sm:mx-6 mb-4 rounded-card bg-cream-dark/50 border border-cream-dark p-3 sm:p-4 flex flex-col sm:flex-row gap-2 sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-forest">A statement to try it with</p>
        <p className="text-[12.5px] text-ink-soft mt-0.5">
          {missing
            ? 'This demo has no sample receipts for the third card yet, so there is nothing to build a statement from.'
            : 'Download last month’s statement for Visa ··1156 as a CSV, like your bank exports, then import it on the Reconcile screen.'}
        </p>
      </div>
      {!missing && (
        <button type="button" onClick={download} disabled={busy} data-testid="sample-statement"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-forest bg-white border border-border hover:border-sage rounded-btn px-3 py-1.5 flex-shrink-0 disabled:opacity-50">
          <Download className="w-3.5 h-3.5" /> {busy ? 'Preparing…' : 'Download sample CSV'}
        </button>
      )}
    </div>
  );
}

function FooterCard({ brief, shareUrl }: { brief: DemoBrief | null; shareUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const name = brief?.founderName?.trim();
  const email = brief?.founderEmail?.trim();
  if (!email && !shareUrl) return null;
  return (
    <section className="bg-white rounded-card border border-border px-4 sm:px-6 py-4 flex flex-col sm:flex-row gap-3 sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-forest">Questions, or want to see it with your team?</p>
        <p className="text-[12.5px] text-ink-soft mt-0.5">
          {name ? `${name} built this demo and would love to hear what you think.` : 'We’d love to hear what you think.'}
          {shareUrl && ' Anyone with the link can open this same demo — no login.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {email && (
          <a href={`mailto:${email}?subject=${encodeURIComponent('Our CampCommand demo')}`}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-paper bg-forest hover:bg-forest-mid rounded-btn px-3.5 py-2">
            <Mail className="w-3.5 h-3.5" /> Email {name ? name.split(' ')[0] : 'us'}
          </a>
        )}
        {shareUrl && (
          <button type="button" onClick={() => { navigator.clipboard?.writeText(shareUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-forest bg-white border border-border hover:border-sage rounded-btn px-3.5 py-2">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Link copied' : 'Copy link to share'}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Manual ticks, per camp and per visitor, in this browser only. They are a convenience for the
 * person clicking through, not a record — localStorage can be unavailable (private windows) and
 * the guide must work without it.
 */
function useManualTicks(campId: string | null, userId: string | null): [Set<string>, (key: string) => void] {
  const storageKey = campId && userId ? `campcommand.demoGuide.${campId}.${userId}` : null;
  const [ticks, setTicks] = useState<Set<string>>(() => readTicks(storageKey));
  const [loadedKey, setLoadedKey] = useState(storageKey);
  if (loadedKey !== storageKey) {
    setLoadedKey(storageKey);
    setTicks(readTicks(storageKey));
  }
  const toggle = useCallback((key: string) => {
    setTicks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* not persisted */ }
      }
      return next;
    });
  }, [storageKey]);
  return [ticks, toggle];
}

function readTicks(key: string | null): Set<string> {
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
