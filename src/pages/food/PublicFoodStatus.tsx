import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, Copy, Loader2, MapPin, UtensilsCrossed } from 'lucide-react';
import { publicCancelFoodRequest, publicGetFoodStatus, type PublicFoodStatus as Status } from '@/lib/foodRequestsDb';
import { formatClock, formatLineQty, formatPickup, formatNotice, formatNoticeRule } from '@/lib/foodRequests';
import { ConfirmDialog } from '@/components/foodRequests/ConfirmDialog';

/**
 * /food/status/:token — one request, as the person who asked sees it.
 *
 * It refreshes every 8 seconds while the page is visible, and at once when the phone comes back to
 * it, because the person reading it is usually checking whether they can walk over yet. It used to
 * poll every 20 seconds while saying "always current", which in a demo read as broken.
 */
const POLL_MS = 8_000;
export function PublicFoodStatus() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const justSent = params.get('sent') === '1';
  const [data, setData] = useState<Status | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await publicGetFoodStatus(token);
      setData(s);
      setState(s ? 'ready' : 'not_found');
    } catch {
      setState((prev) => (prev === 'ready' ? prev : 'error'));
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first fetch of a page that has nothing else to show
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(t);
    };
  }, [refresh]);

  async function cancel() {
    setCancelling(true);
    setError(null);
    const err = await publicCancelFoodRequest(token);
    setCancelling(false);
    if (err) setError(err);
    setConfirming(false);
    await refresh();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href.replace(/\?.*$/, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the address bar still has it */ }
  }

  if (state === 'loading') {
    return <div className="flex min-h-screen w-full items-center justify-center bg-cream"><Loader2 className="h-5 w-5 animate-spin text-forest" /></div>;
  }
  if (state !== 'ready' || !data) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-cream px-5">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-[20px] font-bold text-forest">{state === 'error' ? 'We could not reach the kitchen' : 'We could not find this request'}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            {state === 'error' ? 'Check your connection and try again.' : 'Check the link in your email.'}
          </p>
        </div>
      </div>
    );
  }

  const when = formatPickup(data.pickup_date, data.pickup_time.slice(0, 5));
  const where = data.pickup_location || 'the kitchen';
  const headline = headlineFor(data, where);

  return (
    <div className="min-h-screen w-full bg-cream px-4 pb-28 pt-6 sm:px-5 sm:pt-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-5 flex items-center gap-2.5">
          {data.camp.logo_url
            ? <img src={data.camp.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            : <span className="grid h-8 w-8 place-items-center rounded-full bg-forest text-paper"><UtensilsCrossed className="h-4 w-4" /></span>}
          <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-sage">{data.camp.name} · Kitchen</span>
        </div>

        {justSent && data.status === 'submitted' && (
          <div className="mb-5 rounded-card border border-sage/40 bg-green-muted-bg px-3.5 py-3">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-green-muted-text">
              <CheckCircle2 className="h-4 w-4" /> Sent to the kitchen
            </p>
            <p className="mt-1 text-[14px] leading-snug text-green-muted-text">
              We emailed you this page, and it updates as the kitchen works on your request. It’s also listed under “Your requests on this phone” on your program’s link.
            </p>
            <button type="button" onClick={copyLink} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-forest underline underline-offset-2">
              {copied ? <><Check className="h-3.5 w-3.5" /> Link copied</> : <><Copy className="h-3.5 w-3.5" /> Copy link to this page</>}
            </button>
          </div>
        )}

        <p className="text-[13px] font-semibold text-ink-soft">{data.program_name ?? data.requester_name}</p>
        <h1 data-testid="status-headline" className="font-display text-[26px] font-bold leading-tight text-forest">{headline}</h1>
        {data.status === 'picked_up' && data.picked_up_at ? (
          <p data-testid="picked-up-when" className="mt-2 text-[15px] text-ink">
            Picked up <strong>{formatStamp(data.picked_up_at)}</strong> <span className="text-ink-soft">(pickup was {when})</span>
          </p>
        ) : (
          <p className="mt-2 flex items-start gap-1.5 text-[15px] text-ink">
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-sage" />
            <span>Pickup <strong>{when}</strong> at {where}</span>
          </p>
        )}
        {(data.purpose || data.headcount) && (
          <p data-testid="status-purpose" className="mt-1 text-[14px] text-ink-soft">
            {[data.purpose, data.headcount ? `${data.headcount} ${data.headcount === 1 ? 'person' : 'people'}` : null].filter(Boolean).join(' · ')}
          </p>
        )}
        {data.is_late && data.status === 'submitted' && (
          <p className="mt-2 text-[14px] leading-snug text-amber-text">
            Short notice: this was sent {formatNotice(Number(data.notice_hours))} ahead, and the kitchen asks for {formatNoticeRule(Number(data.cutoff_hours))}, so they may not fill all of it.
          </p>
        )}

        <ol className="mt-6 space-y-0" aria-label="Progress">
          {timeline(data).map((step, i, all) => (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < all.length - 1 && <span className={`absolute left-[9px] top-5 h-full w-0.5 ${step.done ? 'bg-sage' : 'bg-border'}`} aria-hidden="true" />}
              <span className={`relative z-10 mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border-2 ${
                step.tone === 'bad' ? 'border-red bg-red text-paper' : step.done ? 'border-sage bg-sage text-paper' : 'border-border bg-white'
              }`}>
                {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <div className="min-w-0">
                <p className={`text-[15px] font-semibold ${step.done ? 'text-forest' : 'text-ink-soft'}`}>{step.label}</p>
                {step.at && <p className="text-[12.5px] text-ink-soft">{formatStamp(step.at)}</p>}
              </div>
            </li>
          ))}
        </ol>

        {data.kitchen_note && (
          <div className="mt-6 rounded-card border border-border bg-white px-3.5 py-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-soft">From the kitchen</p>
            <p className="mt-1 text-[15px] leading-snug text-ink">{data.kitchen_note}</p>
          </div>
        )}

        <div className="mt-6 rounded-card border border-border bg-white">
          <p className="border-b border-border px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-soft">What you asked for</p>
          <ul>
            {data.lines.map((l, i) => {
              const decided = l.qty_approved != null || l.line_state === 'unavailable';
              return (
                <li key={i} className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-2.5 last:border-0">
                  <div className="min-w-0">
                    <p className={`text-[15px] ${l.line_state === 'unavailable' ? 'text-ink-soft' : 'text-ink'}`}>{l.label}</p>
                    {l.note && <p className="text-[12.5px] text-ink-soft">{l.note}</p>}
                  </div>
                  <div className="flex-shrink-0 text-right text-[14px]">
                    {l.line_state === 'unavailable' ? (
                      <><span className="text-ink-soft line-through">{formatLineQty(l.qty_requested, l.unit_label)}</span><br /><span className="font-semibold text-red-text">Not available</span></>
                    ) : decided && l.line_state === 'changed' ? (
                      <><span className="text-ink-soft line-through">{formatLineQty(l.qty_requested, l.unit_label)}</span><br /><span className="font-semibold text-forest">{formatLineQty(l.qty_approved, l.approved_unit_label)}</span></>
                    ) : (
                      <span className="text-ink">{formatLineQty(decided ? l.qty_approved : l.qty_requested, decided ? l.approved_unit_label : l.unit_label)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {error && <p role="alert" className="mt-4 text-[14px] text-red-text">{error}</p>}
        {data.can_cancel && (
          <button type="button" onClick={() => setConfirming(true)} disabled={cancelling}
            className="mt-6 w-full rounded-btn border border-border bg-white px-4 py-3 text-[15px] font-semibold text-red-text hover:border-red disabled:opacity-60">
            {cancelling ? 'Cancelling…' : 'Cancel this request'}
          </button>
        )}
        <p className="mt-6 text-center text-[12px] text-ink-faint">This page updates automatically while it’s open. Emails can take up to 15 minutes to arrive.</p>
      </div>
      {confirming && (
        <ConfirmDialog tone="danger" busy={cancelling}
          title="Cancel this request?"
          body={<>Pickup {when}. The kitchen is told and stops setting it aside.</>}
          confirmLabel={cancelling ? 'Cancelling…' : 'Cancel request'}
          onCancel={() => setConfirming(false)}
          onConfirm={cancel} />
      )}
    </div>
  );
}

function headlineFor(d: Status, where: string): string {
  switch (d.status) {
    case 'submitted': return 'Waiting for the kitchen';
    case 'approved': return d.changed_by_kitchen ? 'Approved, with changes' : 'Approved';
    case 'ready': return `Ready at ${where}`;
    case 'picked_up': return 'Picked up';
    case 'declined': return 'The kitchen can’t fill this one';
    case 'missed': return 'Not picked up';
    case 'cancelled': return 'Cancelled';
  }
}

interface Step { key: string; label: string; at: string | null; done: boolean; tone?: 'bad' }

function timeline(d: Status): Step[] {
  const steps: Step[] = [{ key: 'sent', label: 'Sent', at: d.created_at, done: true }];
  if (d.status === 'declined') return [...steps, { key: 'declined', label: 'Declined', at: d.decided_at, done: true, tone: 'bad' }];
  if (d.status === 'cancelled') {
    if (d.decided_at) steps.push({ key: 'approved', label: d.changed_by_kitchen ? 'Approved with changes' : 'Approved', at: d.decided_at, done: true });
    return [...steps, { key: 'cancelled', label: 'Cancelled', at: d.cancelled_at, done: true, tone: 'bad' }];
  }
  steps.push({ key: 'approved', label: d.decided_at ? (d.changed_by_kitchen ? 'Approved with changes' : 'Approved') : 'Approved by the kitchen', at: d.decided_at, done: !!d.decided_at });
  if (d.status === 'missed') {
    if (d.ready_at) steps.push({ key: 'ready', label: 'Ready', at: d.ready_at, done: true });
    return [...steps, { key: 'missed', label: 'Not picked up', at: d.missed_at, done: true, tone: 'bad' }];
  }
  steps.push({ key: 'ready', label: 'Ready to pick up', at: d.ready_at, done: !!d.ready_at });
  steps.push({ key: 'picked_up', label: 'Picked up', at: d.picked_up_at, done: !!d.picked_up_at });
  return steps;
}

function formatStamp(ts: string): string {
  const dt = new Date(ts);
  return `${dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${formatClock(`${dt.getHours()}:${dt.getMinutes()}`)}`;
}
