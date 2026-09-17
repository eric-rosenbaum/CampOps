import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, Copy, Download, Mail } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { CampLoader } from '@/components/shared/ModuleLoading';
import { useCampStore } from '@/store/campStore';
import { useAuthStore } from '@/store/authStore';
import { useModules } from '@/lib/modules';
import { fillHref, resolveSpotlights, type AutoCheckId, type DemoBrief, type SpotlightStep, type SpotlightTemplate } from '@/lib/demoSpotlights';
import { buildSampleStatementCsv, loadDemoBrief, loadGuideContext, loadJoinedAt, runAutoChecks, type GuideContext } from '@/lib/demoGuideDb';

/**
 * The page a prospect lands on when they open their demo link: what this environment is, the few
 * features it was set up to show with a short checklist for trying each, and a way to ask
 * questions or pass it on.
 */
export function DemoGuide() {
  const camp = useCampStore((s) => s.currentCamp);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const modules = useModules();
  const [brief, setBrief] = useState<DemoBrief | null | undefined>(undefined);
  const [ctx, setCtx] = useState<GuideContext>({});
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [autoDone, setAutoDone] = useState<Set<AutoCheckId>>(new Set());
  const [manualDone, toggleManual] = useManualTicks(camp?.id ?? null, userId);

  const isDemoCamp = camp?.accountType === 'trial' || camp?.accountType === 'demo';

  useEffect(() => {
    if (!camp || !isDemoCamp) return;
    let alive = true;
    loadDemoBrief(camp.id).then((b) => { if (alive) setBrief(b); }).catch(() => { if (alive) setBrief(null); });
    loadGuideContext(camp.id).then((c) => { if (alive) setCtx(c); });
    if (userId) loadJoinedAt(camp.id, userId).then((j) => { if (alive) setJoinedAt(j); });
    return () => { alive = false; };
  }, [camp, isDemoCamp, userId]);

  const features = useMemo(() => resolveSpotlights(brief ?? null, modules.enabled), [brief, modules]);

  const autoIds = useMemo(() => features.flatMap((f) => f.steps)
    .flatMap((st) => (st.check.kind === 'auto' ? [st.check.id] : [])), [features]);

  const refreshChecks = useCallback(async () => {
    if (!camp || !joinedAt || !userId || autoIds.length === 0) return;
    setAutoDone(await runAutoChecks(camp.id, joinedAt, userId, autoIds));
  }, [camp, joinedAt, userId, autoIds]);

  // Ticks follow what the visitor does in other tabs (the counselor link opens in one), so
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

  const heading = brief.headline?.trim() || camp.name;
  const isDone = (f: SpotlightTemplate, st: SpotlightStep, i: number) =>
    manualDone.has(`${f.key}:${i}`) || (st.check.kind === 'auto' && autoDone.has(st.check.id));

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar title="Demo guide" subtitle={camp.name} />

      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">
          <section className="bg-forest text-paper rounded-card px-5 py-5 sm:px-7 sm:py-6">
            <h2 className="font-display text-[24px] sm:text-[30px] font-bold leading-tight" data-testid="guide-heading">{heading}</h2>
            <p className="text-[14px] sm:text-[15px] leading-relaxed text-side-strong/90 mt-3 max-w-2xl">
              This is your camp’s own demo environment, set up to show how CampCommand works using realistic sample
              data. Click around and try things for yourself — your changes are saved, and nothing here affects a real
              camp.
            </p>
            <p className="text-[12.5px] leading-relaxed text-side mt-2.5 max-w-2xl">
              It focuses on a few features rather than the whole platform, so please don’t use it for real camp
              information or day-to-day operations.
            </p>
          </section>

          {features.length > 0 && (
            <section className="space-y-3" aria-labelledby="core-features">
              <h3 id="core-features" className="font-display text-[18px] sm:text-[20px] font-bold text-forest">
                Your camp’s core features
              </h3>
              <ol className="space-y-3 sm:space-y-4">
                {features.map((f, n) => (
                  <FeatureCard key={f.key} number={n + 1} feature={f} ctx={ctx}
                    isDone={(st, i) => isDone(f, st, i)} onToggle={(i) => toggleManual(`${f.key}:${i}`)} />
                ))}
              </ol>
            </section>
          )}

          {features.length === 0 && (
            <div className="bg-white rounded-card border border-border p-5 text-center">
              <p className="text-[13px] text-ink-soft">Explore anything in the sidebar.</p>
              <Link to="/home" className="inline-block mt-2 text-[13px] font-semibold text-forest underline">Go to the dashboard</Link>
            </div>
          )}

          <FooterCard brief={brief} shareUrl={ctx.shareUrl ?? null} />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ number, feature: f, ctx, isDone, onToggle }: {
  number: number;
  feature: SpotlightTemplate;
  ctx: GuideContext;
  isDone: (st: SpotlightStep, i: number) => boolean;
  onToggle: (i: number) => void;
}) {
  const navigate = useNavigate();
  return (
    <li className="bg-white rounded-card border border-border overflow-hidden" data-testid={`feature-${f.key}`}>
      <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row gap-3 sm:gap-5 sm:items-start">
        <span className="hidden sm:grid place-items-center w-9 h-9 rounded-full bg-sage-pale text-forest font-display font-bold text-[16px] flex-shrink-0">{number}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] sm:text-[18px] font-bold text-forest leading-snug">
            <span className="sm:hidden">{number}. </span>{f.title}
          </p>
          <p className="text-[13.5px] text-ink leading-relaxed mt-1">{f.summary}</p>
        </div>
        <button type="button" onClick={() => navigate(f.href)}
          className="inline-flex items-center justify-center gap-1.5 text-[13px] font-bold text-paper bg-forest hover:bg-forest-mid rounded-btn px-4 py-2 flex-shrink-0 self-start">
          {f.openLabel} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <ol className="border-t border-cream-dark divide-y divide-cream-dark">
        {f.steps.map((st, i) => {
          const done = isDone(st, i);
          const href = fillHref(st.href, ctx as Record<string, string | null | undefined>);
          // A step the data can't see ("look at Inventory") ticks when its Open button is used.
          // Reviewers opened every such screen and came back to empty circles, and read that as
          // having done something wrong.
          const openStep = () => { if (st.check.kind === 'manual' && !done) onToggle(i); };
          return (
            <li key={i} className="flex items-start gap-3 px-4 sm:px-6 py-3">
              <button
                type="button"
                onClick={() => onToggle(i)}
                aria-pressed={done}
                aria-label={done ? 'Mark as not tried' : 'Mark as tried'}
                className={`mt-0.5 grid place-items-center w-6 h-6 rounded-full border-2 flex-shrink-0 transition-colors ${done ? 'bg-forest border-forest text-paper' : 'border-border hover:border-sage bg-white'}`}
              >
                {done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-[13.5px] leading-snug ${done ? 'text-ink-soft' : 'text-ink'}`}>{st.text}</p>
                {st.notice && <p className="text-[12px] text-ink-faint mt-0.5">{st.notice}</p>}
                {st.download === 'sample_statement' && <SampleStatementLink />}
              </div>
              {href && (
                st.newTab ? (
                  <a href={href} target="_blank" rel="noreferrer" onClick={openStep}
                    className="inline-flex items-center gap-1 text-[12.5px] font-bold text-forest bg-white border border-border hover:border-sage rounded-btn px-3 py-1.5 flex-shrink-0">
                    Open <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <button type="button" onClick={() => { openStep(); navigate(href); }}
                    className="inline-flex items-center gap-1 text-[12.5px] font-bold text-forest bg-white border border-border hover:border-sage rounded-btn px-3 py-1.5 flex-shrink-0">
                    Open <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )
              )}
            </li>
          );
        })}
      </ol>
    </li>
  );
}

/**
 * "Import a card statement yourself" needs a statement. It is built from this demo's own sample
 * receipts, so the import matches instead of producing a page of unmatched charges.
 */
function SampleStatementLink() {
  const camp = useCampStore((s) => s.currentCamp);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  async function download() {
    if (!camp) return;
    setBusy(true);
    try {
      const sample = await buildSampleStatementCsv(camp.id);
      if (!sample) { setMissing(true); return; }
      setTotal(sample.total);
      const url = URL.createObjectURL(new Blob([sample.csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = sample.fileName;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally { setBusy(false); }
  }

  if (missing) return <p className="text-[12px] text-ink-faint mt-1">There are no sample receipts to build a statement from.</p>;
  return (
    <span className="block mt-1">
      <button type="button" onClick={download} disabled={busy} data-testid="sample-statement"
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-forest underline disabled:opacity-50">
        <Download className="w-3 h-3" /> {busy ? 'Preparing…' : 'Download the sample statement (CSV)'}
      </button>
      {total != null && (
        <span className="block text-[12px] text-ink-soft mt-0.5" data-testid="sample-statement-total">
          When the import asks for the bill’s total, type ${total.toFixed(2)}.
        </span>
      )}
    </span>
  );
}

function FooterCard({ brief, shareUrl }: { brief: DemoBrief; shareUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const name = brief.founderName?.trim();
  const email = brief.founderEmail?.trim();
  if (!email && !shareUrl) return null;
  return (
    <section className="bg-white rounded-card border border-border px-4 sm:px-6 py-4 flex flex-col sm:flex-row gap-3 sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-forest">Questions, or want to see it with your team?</p>
        <p className="text-[12.5px] text-ink-soft mt-0.5">
          {name ? `${name} set up this demo and would love to hear what you think.` : 'We’d love to hear what you think.'}
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
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Link copied' : 'Share with your team'}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Manual ticks, per camp and per visitor, in this browser only -- a convenience for the person
 * clicking through, not a record. localStorage can be unavailable and the guide works without it.
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
