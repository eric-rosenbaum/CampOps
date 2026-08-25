import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  CalendarDays, Users, User, Moon, AlertCircle, CheckCircle2, FileText,
  PenLine, ShieldCheck, BedDouble, UtensilsCrossed, MessageSquarePlus,
  Star, Clock, Trash2, Send, Lock, ClipboardList, Loader2,
  Circle, ChevronRight, Wallet, UploadCloud, DollarSign, Bell, X,
} from 'lucide-react';
import {
  money, fmtDateFull, fmtRange, nights, MEAL_PERIOD_LABELS,
} from '@/components/retreats/retreatUi';
import { printInvoice } from '@/lib/invoiceHtml';
import { CampCommandMark, CC_CREAM, CC_GREEN } from '@/components/shared/CampCommandMark';
import { RoomingBoard } from './RoomingBoard';
import {
  supabasePublic, SUPABASE_URL, portalFnHeaders,
  readPortalSession, writePortalSession, clearPortalSession,
  cardClass, inputClass, labelClass, btnPrimary,
  type PortalRetreat, type PortalDocument, type PortalSpace, type PortalHousing,
  type PortalGuest, type PortalMeal, type PortalChangeRequest, type PortalInvoice,
  type PortalData,
} from './portalShared';

type PageState = 'loading' | 'not_found' | 'expired' | 'ready';

// ─── Small helpers ─────────────────────────────────────────────────────────────
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Add days to a YYYY-MM-DD date, returning YYYY-MM-DD. Used to derive default deadlines from arrival. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Whole days from today until an ISO date (negative if past). */
function daysUntil(iso: string): number {
  const a = new Date(todayISO() + 'T00:00:00').getTime();
  const b = new Date(iso + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function asList(v: string[] | string | null | undefined): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}
const GROUP_TYPE_LABELS: Record<string, string> = {
  synagogue: 'Synagogue / Jewish org', corporate: 'Corporate / professional', youth: 'Youth organization',
  alumni: 'Alumni organization', family: 'Family camp', school: 'School / educational', other: 'Other',
};
const STATUS_LABELS: Record<string, string> = {
  inquiry: 'Inquiry', confirmed: 'Confirmed', ready: 'Ready to go', active: 'Active now',
  complete: 'Complete', cancelled: 'Cancelled',
};

// ─── Reusable atoms ──────────────────────────────────────────────────────────
function Section({ id, icon, title, subtitle, children }: {
  id: string; icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-sage-pale text-forest flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-forest leading-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-ink-soft leading-tight">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      <div className="text-sage flex-shrink-0">{icon}</div>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint flex-1">{label}</div>
      <div className="text-[14px] font-semibold text-forest text-right">{value}</div>
    </div>
  );
}


function StatusPill({ status }: { status: string }) {
  const s = status;
  const cls = s === 'active' ? 'bg-sage-pale text-forest'
    : s === 'ready' ? 'bg-green-muted-bg text-green-muted-text'
    : s === 'confirmed' || s === 'inquiry' ? 'bg-blue-bg text-blue-text'
    : s === 'cancelled' ? 'bg-red-bg text-red' : 'bg-cream-dark text-ink';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {STATUS_LABELS[s] ?? s}
    </span>
  );
}

/**
 * Stars sit under their label rather than beside it, and they are large.
 *
 * Side by side they were competing with the label for a narrow row, which left them small and
 * pale enough that people did not register them as something to tap. Empty stars now carry a
 * visible outline instead of near-white fill, so an unrated row still reads as five stars.
 */
function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-[13.5px] font-semibold text-forest">{label}</span>
        {value > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            className="text-[11.5px] text-ink-soft hover:text-forest"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n === value ? 0 : n)}
            className="p-1 -m-1 active:scale-90 transition-transform"
            aria-label={`${label}, ${n} star${n === 1 ? '' : 's'}`}
            aria-pressed={n <= value}
          >
            <Star
              className={`w-9 h-9 transition-colors ${
                n <= value ? 'fill-amber text-amber' : 'fill-none text-border hover:text-sage'
              }`}
              strokeWidth={1.75}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function RetreatPortal() {
  const { token } = useParams<{ token: string }>();
  const [pageState, setPageState] = useState<PageState>(token ? 'loading' : 'not_found');
  const [data, setData] = useState<PortalData | null>(null);

  // Mobile viewport lock (matches PublicReportForm)
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    const original = viewport?.getAttribute('content') ?? '';
    viewport?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    document.documentElement.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';
    return () => {
      viewport?.setAttribute('content', original);
      document.documentElement.style.overflowX = '';
      document.body.style.overflowX = '';
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) { setPageState('not_found'); return; }
    const { data: res, error } = await supabasePublic.rpc('get_portal_data', { p_token: token, p_session: readPortalSession(token) });
    if (error || !res) { setPageState('not_found'); return; }
    if ((res as { expired?: boolean }).expired) { setPageState('expired'); return; }
    setData(res as PortalData);
    setPageState('ready');
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      const { data: res, error } = await supabasePublic.rpc('get_portal_data', { p_token: token, p_session: readPortalSession(token) });
      if (!active) return;
      if (error || !res) { setPageState('not_found'); return; }
      if ((res as { expired?: boolean }).expired) { setPageState('expired'); return; }
      setData(res as PortalData);
      setPageState('ready');
    })();
    return () => { active = false; };
  }, [token]);

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-cream w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sage animate-spin" />
      </div>
    );
  }

  if (pageState === 'expired') {
    return (
      <div className="min-h-screen bg-cream w-full flex items-center justify-center p-4 sm:p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-ink-faint" />
          </div>
          <h1 className="text-[20px] font-bold text-forest mb-2">This portal has closed</h1>
          <p className="text-[14px] text-ink-soft leading-relaxed">
            Retreat portals close a few weeks after the group departs. If you need a copy of your
            agreement or invoice, the camp can send it to you directly.
          </p>
        </div>
      </div>
    );
  }

  if (pageState === 'not_found' || !data) {
    return (
      <div className="min-h-screen bg-cream w-full flex items-center justify-center p-4 sm:p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-ink-faint" />
          </div>
          <h1 className="text-[20px] font-bold text-forest mb-2">Portal link not valid</h1>
          <p className="text-[14px] text-ink-soft leading-relaxed">
            This retreat portal link is not valid or is no longer active. Please check the link
            from your coordinator, or reach out to the camp directly.
          </p>
        </div>
      </div>
    );
  }

  return <PortalContent data={data} token={token!} refetch={fetchData} />;
}

// ─── Workflow checklist model ─────────────────────────────────────────────────
type StepState = 'done' | 'overdue' | 'due_soon' | 'todo' | 'locked';
interface Step {
  key: string;
  label: string;
  hint: string;
  state: StepState;
  dueDate: string | null;
  sectionId: string;
  counts: boolean; // whether it counts toward the progress bar
}

function buildSteps(data: PortalData): Step[] {
  const { retreat, documents, housing } = data;
  const arrival = retreat.arrival_date;

  const agreementDoc = documents.find((d) => d.doc_type === 'agreement' || d.doc_type === 'contract');
  const coiDoc = documents.find((d) => d.doc_type === 'coi');

  // Effective deadlines: explicit if set, otherwise derived from arrival.
  const housingDue = retreat.housing_deadline ?? addDays(arrival, -7);
  const headcountDue = retreat.headcount_cutoff ?? addDays(arrival, -14);
  const coiDue = coiDoc?.due_date ?? addDays(arrival, -1);

  // Urgency helper for an incomplete, dated task.
  const urgency = (due: string | null): StepState => {
    if (!due) return 'todo';
    const d = daysUntil(due);
    if (d < 0) return 'overdue';
    if (d <= 7) return 'due_soon';
    return 'todo';
  };

  const steps: Step[] = [];

  // 1, Agreement (only if the camp has shared one)
  if (agreementDoc) {
    const signed = agreementDoc.status === 'signed' || agreementDoc.status === 'approved' || !!agreementDoc.signed_at;
    steps.push({
      key: 'agreement', label: 'Sign the retreat agreement',
      hint: signed ? `Signed${agreementDoc.signed_by ? ` by ${agreementDoc.signed_by}` : ''}` : agreementDoc.due_date ? `Due ${fmtDateFull(agreementDoc.due_date)}` : 'Awaiting your signature',
      state: signed ? 'done' : urgency(agreementDoc.due_date), dueDate: agreementDoc.due_date, sectionId: 'documents', counts: true,
    });
  }

  // 2, Deposit (only if one is required)
  if (retreat.deposit_required != null && retreat.deposit_required > 0) {
    const paid = (retreat.deposit_received ?? 0) >= retreat.deposit_required;
    const partial = (retreat.deposit_received ?? 0) > 0 && !paid;
    steps.push({
      key: 'deposit', label: 'Pay deposit to hold your dates',
      hint: paid ? 'Paid. Your dates are secured' : partial ? 'Partial payment received' : retreat.deposit_due ? `Due ${fmtDateFull(retreat.deposit_due)}` : 'Invoice sent - pay to lock in your dates',
      state: paid ? 'done' : urgency(retreat.deposit_due), dueDate: retreat.deposit_due, sectionId: 'documents', counts: true,
    });
  }

  // 3, Rooming: names first, then a bed for each of them
  const housingLocked = housing.length > 0 && housing.some((h) => h.locked);
  const housingSubmitted = housing.length > 0;
  const roster = data.guests.length;
  const placed = data.guests.filter((g) => g.location_id).length;
  const roomingDone = housingLocked || (roster > 0 && placed === roster) || (roster === 0 && housingSubmitted);
  steps.push({
    key: 'housing', label: 'Sort your group into rooms',
    hint: housingLocked ? 'Finalized & locked'
      : roster === 0 ? `Add your guest list · due ${fmtDateFull(housingDue)}`
      : placed === roster ? `All ${roster} guests have a room`
      : `${placed} of ${roster} guests placed`,
    state: roomingDone ? 'done' : urgency(housingDue), dueDate: housingDue, sectionId: 'housing', counts: true,
  });

  // 4 · Final headcount
  const headcountDone = retreat.final_headcount != null;
  steps.push({
    key: 'headcount', label: 'Confirm final headcount',
    hint: headcountDone ? `Confirmed: ${retreat.final_headcount} guests` : `Due ${fmtDateFull(headcountDue)} (about 2 weeks out)`,
    state: headcountDone ? 'done' : urgency(headcountDue), dueDate: headcountDue, sectionId: 'final', counts: true,
  });

  // 5 · COI
  const coiDone = !!coiDoc && (coiDoc.status === 'received' || coiDoc.status === 'approved' || !!coiDoc.has_file);
  steps.push({
    key: 'coi', label: 'Submit certificate of insurance',
    hint: coiDone ? 'Received' : `Required before arrival${coiDue ? ` · due ${fmtDateFull(coiDue)}` : ''}`,
    state: coiDone ? 'done' : (daysUntil(arrival) < 0 ? 'overdue' : urgency(coiDue)), dueDate: coiDue, sectionId: 'final', counts: true,
  });

  if (retreat.change_requests_enabled) {
    const pending = data.change_requests.filter((r) => r.status === 'pending').length;
    const answered = data.change_requests.filter((r) => r.status !== 'pending').length;
    steps.push({
      key: 'requests', label: 'Special requests',
      hint: pending > 0 ? `${pending} awaiting a reply from the camp`
        : answered > 0 ? `${answered} answered`
        : 'Program spaces, dietary, childcare & more',
      state: 'todo', dueDate: null, sectionId: 'requests', counts: false,
    });
  }

  return steps;
}

// ─── Portal content (only rendered with valid data) ───────────────────────────
/**
 * Anything the camp has sent that the group has not acknowledged.
 *
 * An invoice arriving by email and then sitting three tabs deep is how people end up thinking
 * the portal is a dead end. These surface at the top of every view until dismissed, and the
 * dismissal is per link, in local storage, because there is no account to hang it on.
 */
interface PortalUpdate {
  id: string;
  title: string;
  detail: string;
  view: ViewId;
}

function seenKey(token: string) { return `campops_portal_seen_${token}`; }

function readSeen(token: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey(token)) ?? '[]') as string[]); }
  catch { return new Set(); }
}

function writeSeen(token: string, ids: Set<string>) {
  try { localStorage.setItem(seenKey(token), JSON.stringify(Array.from(ids))); }
  catch { /* private mode */ }
}

function buildUpdates(data: PortalData): PortalUpdate[] {
  const out: PortalUpdate[] = [];
  data.invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .forEach((i) => out.push({
      id: `invoice:${i.id}:${i.status}`,
      title: `${i.kind === 'deposit' ? 'Deposit invoice' : 'Invoice'} ${i.number} · ${money(i.amount)}`,
      detail: i.due_date ? `Due ${fmtDateFull(i.due_date)}` : 'Sent by the camp',
      view: 'stay',
    }));
  data.change_requests
    .filter((r) => r.status !== 'pending' && r.response_message)
    .forEach((r) => out.push({
      id: `request:${r.id}:${r.responded_at ?? r.status}`,
      title: 'The camp replied to your request',
      detail: r.response_message as string,
      view: 'todo',
    }));
  data.documents
    .filter((d) => d.doc_type !== 'coi' && d.has_file && d.status !== 'signed' && d.status !== 'approved')
    .forEach((d) => out.push({
      id: `doc:${d.id}:${d.status}`,
      title: `${d.name} needs your attention`,
      detail: d.due_date ? `Due ${fmtDateFull(d.due_date)}` : 'Shared by the camp',
      view: 'todo',
    }));
  return out;
}

/**
 * The unlock step for the private half of the portal.
 *
 * Shown in place of whatever it is guarding, rather than as a wall in front of the whole
 * portal, so a coordinator who only wants to check the menu never meets it at all.
 */
function UnlockPanel({
  token, hint, what, onUnlocked,
}: {
  token: string;
  hint?: string | null;
  /** What this particular slot is protecting, for the explanatory line. */
  what: string;
  onUnlocked: () => Promise<void>;
}) {
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [noEmail, setNoEmail] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/portal-access-code`, {
        method: 'POST', headers: portalFnHeaders(), body: JSON.stringify({ token }),
      });
      const payload = await res.json();
      if (!res.ok) { setError(payload?.error ?? 'Could not send the code.'); return; }
      if (payload.codeRequired === false) { setNoEmail(true); return; }
      setSentTo(payload.sentTo ?? null);
      setSent(true);
    } catch {
      setError('Could not send the code. Please check your connection.');
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setError(null);
    const { data, error: err } = await supabasePublic.rpc('portal_verify_access_code', {
      p_token: token, p_code: code,
    });
    const res = data as { ok: boolean; error?: string; session?: string; hours?: number } | null;
    if (err || !res?.ok) {
      setError(res?.error ?? 'Could not check that code.');
      setBusy(false);
      return;
    }
    writePortalSession(token, res.session as string, res.hours ?? 12);
    await onUnlocked();
    setBusy(false);
  }

  if (noEmail) {
    return (
      <div className={`${cardClass} p-5 text-center`}>
        <Lock className="w-6 h-6 text-ink-faint mx-auto mb-2.5" />
        <p className="text-[14px] font-semibold text-forest">We have no email on file for you</p>
        <p className="text-[13px] text-ink-soft mt-1.5 max-w-sm mx-auto leading-relaxed">
          Only your group can see {what}, and we verify that by emailing a code to the
          group's coordinator.
          Ask the camp to add a coordinator email and this will unlock.
        </p>
      </div>
    );
  }

  return (
    <div className={`${cardClass} p-5`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-cream-dark text-ink-soft flex items-center justify-center flex-shrink-0">
          <Lock className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-forest">This part is private</p>
          <p className="text-[13px] text-ink-soft mt-1 leading-relaxed">
            Only your group can see {what}. We will email a code to
            {hint ? <> <span className="font-semibold text-forest">{hint}</span></> : ' the coordinator on file'}
            {' '}to check it is you, and this device stays unlocked for 12 hours.
          </p>

          {!sent ? (
            <button onClick={requestCode} disabled={busy} className={`${btnPrimary} mt-3.5`}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Email me a code
            </button>
          ) : (
            <div className="mt-3.5">
              <p className="text-[12.5px] text-ink-soft mb-2">
                Sent to <span className="font-semibold text-forest">{sentTo ?? 'your email on file'}</span>. It expires in 15 minutes.
              </p>
              <label className={labelClass}>Access code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={`${inputClass} tracking-[0.3em] font-mono`}
                placeholder="000000"
                inputMode="numeric"
                disabled={busy}
              />
              <div className="flex gap-2 mt-3">
                <button onClick={verify} disabled={busy || code.length < 6} className={`${btnPrimary} flex-1`}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Unlock
                </button>
                <button onClick={requestCode} disabled={busy} className="px-3 text-[13px] font-semibold text-ink-soft hover:text-forest">
                  Resend
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-[12.5px] text-red mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}

type ViewId = 'todo' | 'stay' | 'rooming' | 'feedback';

/** Matches Tailwind's lg breakpoint, so the checklist can render once instead of twice. */
function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [is, setIs] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIs(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return is;
}

function PortalContent({ data, token, refetch }: { data: PortalData; token: string; refetch: () => Promise<void>; }) {
  const { retreat, documents, invoices, spaces, housing, guests, meals, change_requests, feedback_submitted } = data;
  const today = todayISO();
  const numNights = nights(retreat.arrival_date, retreat.departure_date);
  const isDesktop = useIsDesktop();
  const unlocked = data.unlocked !== false;
  const lock = (what: string) => (
    <UnlockPanel token={token} hint={data.verify_email_hint} what={what} onUnlocked={refetch} />
  );

  const steps = buildSteps(data);
  const counted = steps.filter((s) => s.counts);
  const doneCount = counted.filter((s) => s.state === 'done').length;
  const allDone = counted.length > 0 && doneCount === counted.length;

  // The checklist opens on the first thing that still needs doing, because that is what the
  // coordinator came here for.
  const firstOpen = steps.find((s) => s.state !== 'done' && s.key !== 'housing')?.key ?? null;
  const [openStep, setOpenStep] = useState<string | null>(firstOpen);
  const [view, setView] = useState<ViewId>('todo');

  const [seen, setSeen] = useState<Set<string>>(() => readSeen(token));
  const updates = buildUpdates(data).filter((u) => !seen.has(u.id));
  function dismiss(id: string) {
    setSeen((prev) => {
      const next = new Set(prev).add(id);
      writeSeen(token, next);
      return next;
    });
  }

  const dUntil = daysUntil(retreat.arrival_date);
  const dUntilDepart = daysUntil(retreat.departure_date);
  const countdown = dUntil > 0 ? `${dUntil} ${dUntil === 1 ? 'day' : 'days'} until arrival`
    : dUntilDepart >= 0 ? 'Your retreat is underway'
    : 'Retreat complete';

  // Feedback only exists once there is something to reflect on.
  const feedbackFrom = retreat.feedback_opens ?? addDays(retreat.departure_date, 1);
  const feedbackOpen = today >= feedbackFrom;

  const VIEWS: { id: ViewId; label: string }[] = [
    { id: 'todo', label: 'To do' },
    { id: 'stay', label: 'Your stay' },
    { id: 'rooming', label: 'Rooming' },
    ...(feedbackOpen ? [{ id: 'feedback' as ViewId, label: 'Feedback' }] : []),
  ];

  function openRooming() { setView('rooming'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  /** The working part of a checklist item, shown when that item is open. */
  function stepBody(key: string) {
    switch (key) {
      case 'agreement':
        return <DocumentsBlock documents={documents.filter((d) => d.doc_type !== 'coi')} token={token} refetch={refetch} unlocked={unlocked} hint={data.verify_email_hint} />;
      case 'deposit':
        return (
          <div className="space-y-3">
            <DepositCard retreat={retreat} />
            {invoices.length > 0 && <InvoicesBlock retreat={retreat} invoices={invoices} />}
          </div>
        );
      case 'housing':
        return (
          <div className={`${cardClass} p-4`}>
            <p className="text-[13px] text-ink leading-relaxed">
              {guests.length === 0
                ? 'Add your guest list, then sort everyone into cabins and rooms.'
                : `${guests.filter((g) => g.location_id).length} of ${guests.length} guests have a room.`}
            </p>
            <button onClick={openRooming} className={`${btnPrimary} mt-3 w-full`}>
              <BedDouble className="w-4 h-4" /> Open rooming
            </button>
          </div>
        );
      case 'headcount':
        return <HeadcountBlock retreat={retreat} guests={guests} token={token} refetch={refetch} />;
      case 'coi':
        return <CoiBlock retreat={retreat} documents={documents} token={token} refetch={refetch} />;
      case 'requests':
        return (
          <ChangeRequestsBlock
            requests={change_requests}
            defaultName={retreat.coordinator_name}
            token={token}
            refetch={refetch}
          />
        );
      default:
        return null;
    }
  }

  const activeStep = steps.find((s) => s.key === openStep) ?? null;

  return (
    <div className="min-h-screen bg-cream w-full">
      {/* Branded header with countdown */}
      <div className="bg-forest text-white">
        <div className="max-w-5xl mx-auto px-5 pt-7 pb-6">
          <div className="flex items-center gap-3 mb-4">
            <CampCommandMark size={40} disc={CC_CREAM} ink={CC_GREEN} decorative className="flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-sage-light uppercase tracking-widest">Retreat Portal</p>
              <h1 className="text-[19px] font-bold leading-tight truncate">{retreat.group_name}</h1>
            </div>
            <span className="flex-shrink-0 inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5 text-[12px] font-semibold text-sage-light">
              <Clock className="w-3.5 h-3.5" /> {countdown}
            </span>
            {unlocked && (
              <button
                onClick={() => { clearPortalSession(token); void refetch(); }}
                title="Hide your guest list, invoices and agreement on this device"
                className="flex-shrink-0 inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5 text-[12px] font-semibold text-sage-light hover:bg-white/20 transition-colors"
              >
                <Lock className="w-3.5 h-3.5" /> Lock
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-white/80">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-sage-light" />
              {fmtRange(retreat.arrival_date, retreat.departure_date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Moon className="w-4 h-4 text-sage-light" />
              {numNights} {numNights === 1 ? 'night' : 'nights'}
            </span>
            {retreat.headcount != null && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-4 h-4 text-sage-light" />
                {retreat.final_headcount ?? retreat.headcount} guests
              </span>
            )}
          </div>

          {counted.length > 0 && (
            <div className="mt-4 max-w-md">
              <div className="flex items-center justify-between text-[12px] text-white/70 mb-1.5">
                <span>{allDone ? "You're all set" : 'Your progress'}</span>
                <span className="font-semibold text-white">{doneCount} of {counted.length} done</span>
              </div>
              <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${(doneCount / counted.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View switcher */}
      <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-3">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-2">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                aria-current={view === v.id}
                className={`flex-shrink-0 text-[13px] font-semibold px-3.5 py-1.5 rounded-full transition-colors ${
                  view === v.id ? 'bg-forest text-white' : 'text-ink hover:text-forest hover:bg-sage-pale'
                }`}
              >
                {v.label}
                {updates.some((u) => u.view === v.id) && (
                  <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${
                    view === v.id ? 'bg-white' : 'bg-amber'
                  }`} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 py-7">
        {updates.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber/40 bg-amber-pale overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-text" />
              <p className="text-[14px] font-bold text-amber-text">
                New from {retreat.camp_name ?? 'the camp'}
              </p>
            </div>
            <div className="divide-y divide-amber/20">
              {updates.map((u) => (
                <div key={u.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-forest">{u.title}</p>
                    <p className="text-[12.5px] text-ink-soft mt-0.5">{u.detail}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => { setView(u.view); dismiss(u.id); }}
                      className="text-[12.5px] font-semibold text-forest bg-white border border-border rounded-btn px-3 py-1.5 hover:border-sage transition-colors"
                    >
                      View
                    </button>
                    <button
                      onClick={() => dismiss(u.id)}
                      aria-label="Dismiss"
                      className="text-ink-faint hover:text-forest p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── To do ── */}
        {view === 'todo' && (
          <div className="space-y-5">
            <div className="bg-sage-pale border border-sage/30 rounded-2xl px-5 py-4">
              <p className="text-[15px] font-bold text-forest">Welcome, {retreat.coordinator_name?.split(' ')[0] ?? retreat.group_name}</p>
              <p className="text-[13px] text-forest/75 mt-1.5 leading-relaxed">
                This is your private hub for {retreat.group_name}'s stay. Everything the camp
                needs from you is below. Open an item to deal with it. Your changes save automatically.
              </p>
              <p className="text-[12px] text-ink-soft mt-2.5">
                Bookmark this page. It's your private link, so there's no password to remember.
              </p>
            </div>

            <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-5 lg:items-start">
              <div className="space-y-2 lg:sticky lg:top-20">
                {steps.map((step) => (
                  <div key={step.key}>
                    <StepRow
                      step={step}
                      open={openStep === step.key}
                      onClick={() => (step.key === 'housing' && isDesktop
                        ? openRooming()
                        : setOpenStep(openStep === step.key ? null : step.key))}
                    />
                    {!isDesktop && openStep === step.key && (
                      <div className="mt-2 mb-3">{stepBody(step.key)}</div>
                    )}
                  </div>
                ))}
              </div>

              {isDesktop && (
                <div>
                  {activeStep ? (
                    <>
                      <h2 className="text-[16px] font-bold text-forest mb-1">{activeStep.label}</h2>
                      <p className="text-[12.5px] text-ink-soft mb-3">{activeStep.hint}</p>
                      {stepBody(activeStep.key)}
                    </>
                  ) : (
                    <div className={`${cardClass} p-8 text-center`}>
                      <CheckCircle2 className="w-8 h-8 text-sage mx-auto mb-3" />
                      <p className="text-[15px] font-semibold text-forest">
                        {allDone ? 'Everything is in, thank you!' : 'Pick an item to get started'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Your stay ── */}
        {view === 'stay' && (
          <div className="space-y-7">
            <Section id="info" icon={<ClipboardList className="w-4.5 h-4.5" />} title="Booking overview" subtitle="Your reservation at a glance">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                <div className={`${cardClass} divide-y divide-cream-dark overflow-hidden`}>
                  <div className="flex items-center justify-between py-3 px-4">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Status</span>
                    <StatusPill status={retreat.status} />
                  </div>
                  <InfoRow icon={<Users className="w-4 h-4" />} label="Group" value={retreat.group_name} />
                  {retreat.group_type && (
                    <InfoRow icon={<FileText className="w-4 h-4" />} label="Type" value={GROUP_TYPE_LABELS[retreat.group_type] ?? retreat.group_type} />
                  )}
                  <InfoRow icon={<CalendarDays className="w-4 h-4" />} label="Dates" value={fmtRange(retreat.arrival_date, retreat.departure_date)} />
                  <InfoRow icon={<Moon className="w-4 h-4" />} label="Nights" value={numNights} />
                  <InfoRow icon={<Users className="w-4 h-4" />} label={retreat.final_headcount != null ? 'Final headcount' : 'Estimated headcount'} value={retreat.final_headcount ?? retreat.headcount} />
                  {retreat.coordinator_name && (
                    <InfoRow icon={<User className="w-4 h-4" />} label="Coordinator" value={retreat.coordinator_name} />
                  )}
                </div>

                <div className="space-y-3">
                  {retreat.dietary_flags && retreat.dietary_flags.length > 0 && (
                    <div className={`${cardClass} p-4`}>
                      <p className={labelClass}>Dietary notes on file</p>
                      <div className="flex flex-wrap gap-2">
                        {retreat.dietary_flags.map((f) => (
                          <span key={f} className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium bg-amber-bg text-amber-text">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(retreat.balance_due != null || retreat.total_charges != null) && (
                    <div className={`${cardClass} p-4`}>
                      <p className={labelClass}>Account balance</p>
                      <div className="space-y-1.5 text-[14px]">
                        {retreat.pricing_model === 'per_person_night' && retreat.rate_per_person_night != null && (
                          <div className="flex justify-between text-ink-soft text-[12px]">
                            <span>{money(retreat.rate_per_person_night)}/person/night × {retreat.headcount ?? 0} × {retreat.nights ?? 0} night{(retreat.nights ?? 0) === 1 ? '' : 's'}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-ink">
                          <span>Total charges</span><span className="font-mono">{money(retreat.total_charges)}</span>
                        </div>
                        <div className="flex justify-between text-ink">
                          <span>Paid</span><span className="font-mono">{money(retreat.total_paid)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-forest pt-1.5 border-t border-cream-dark">
                          <span>Balance due</span>
                          <span className={`font-mono ${(retreat.balance_due ?? 0) > 0 ? 'text-amber-text' : 'text-green-muted-text'}`}>
                            {money(retreat.balance_due)}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-ink-faint mt-2.5">Payments are handled directly with the camp. Contact your coordinator to pay.</p>
                    </div>
                  )}

                  {invoices.length > 0 && <InvoicesBlock retreat={retreat} invoices={invoices} />}
                </div>
              </div>
            </Section>

            <Section id="menu" icon={<UtensilsCrossed className="w-4.5 h-4.5" />} title="Menu & dining" subtitle="What's being served">
              <MenuBlock published={retreat.menu_published} meals={meals} />
            </Section>

            <Section id="documents" icon={<FileText className="w-4.5 h-4.5" />} title="Your documents" subtitle="Agreement, invoices & insurance">
              <DocumentsBlock documents={documents} token={token} refetch={refetch} unlocked={unlocked} hint={data.verify_email_hint} />
            </Section>
          </div>
        )}

        {/* ── Rooming ── */}
        {view === 'rooming' && (
          <Section id="rooming" icon={<BedDouble className="w-4.5 h-4.5" />} title="Rooming" subtitle="Your guest list, and who sleeps where">
            {!unlocked ? lock('your guest list and room assignments') : <HousingBlock
              retreat={retreat}
              spaces={spaces}
              housing={housing}
              guests={guests}
              token={token}
              refetch={refetch}
              today={today}
            />}
          </Section>
        )}

        {/* ── Feedback ── */}
        {view === 'feedback' && (
          <Section id="feedback" icon={<Star className="w-4.5 h-4.5" />} title="Feedback" subtitle="Tell us how it went">
            <FeedbackBlock retreat={retreat} submitted={feedback_submitted} token={token} refetch={refetch} today={today} />
          </Section>
        )}

        <div className="pt-8 pb-6 text-center">
          <p className="text-[11px] text-ink-faint">Powered by CampCommand · This is a private link. Please don't share it publicly.</p>
        </div>
      </div>
    </div>
  );
}

/** One line of the checklist. Doubles as the nav on desktop, so it shows selection. */
function StepRow({ step, open, onClick }: { step: Step; open: boolean; onClick: () => void }) {
  const done = step.state === 'done';
  const tone = !step.counts ? 'text-ink-soft'
    : done ? 'text-green-muted-text'
    : step.state === 'overdue' ? 'text-red'
    : step.state === 'due_soon' ? 'text-amber-text' : 'text-ink-soft';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
        open ? 'border-sage bg-sage-pale' : 'border-border bg-white hover:border-sage/50'
      }`}
    >
      <span className="flex-shrink-0 mt-0.5">
        {/* A standing offer like "special requests" is never outstanding, so it gets its own
            mark rather than an empty circle that reads as unfinished homework. */}
        {!step.counts
          ? <MessageSquarePlus className="w-[18px] h-[18px] text-ink-faint" />
          : done
            ? <CheckCircle2 className="w-[18px] h-[18px] text-sage" />
            : step.state === 'overdue'
              ? <AlertCircle className="w-[18px] h-[18px] text-red" />
              : <Circle className="w-[18px] h-[18px] text-ink-faint" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13.5px] font-semibold leading-snug ${done ? 'text-ink-soft' : 'text-forest'}`}>
          {step.label}
        </span>
        <span className={`block text-[11.5px] mt-0.5 ${tone}`}>{step.hint}</span>
      </span>
      <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-0.5 text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`} />
    </button>
  );
}

// ─── Deposit card ─────────────────────────────────────────────────────────────
function DepositCard({ retreat }: { retreat: PortalRetreat }) {
  if (retreat.deposit_required == null || retreat.deposit_required <= 0) return null;
  const paid = (retreat.deposit_received ?? 0) >= retreat.deposit_required;
  const partial = (retreat.deposit_received ?? 0) > 0 && !paid;

  return (
    <div className={`${cardClass} p-4 ${paid ? 'border-sage' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${paid ? 'bg-green-muted-bg text-green-muted-text' : 'bg-amber-bg text-amber-text'}`}>
          {paid ? <ShieldCheck className="w-4.5 h-4.5" /> : <Wallet className="w-4.5 h-4.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-forest leading-tight">Deposit, holds your dates</p>
            <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${paid ? 'bg-green-muted-bg text-green-muted-text' : partial ? 'bg-amber-bg text-amber-text' : 'bg-cream-dark text-ink-soft'}`}>
              {paid ? 'Paid' : partial ? 'Partial' : 'Due'}
            </span>
          </div>
          <p className="text-[12px] text-ink-soft mt-0.5">
            {paid ? 'Your dates are secured · thank you!'
              : retreat.deposit_due ? `Please pay by ${fmtDateFull(retreat.deposit_due)} to lock in your dates.`
              : 'Paying your deposit locks in your dates.'}
          </p>
          <div className="mt-3 bg-cream rounded-xl p-3 flex items-center justify-between text-[14px]">
            <span className="inline-flex items-center gap-1.5 text-ink-soft"><DollarSign className="w-4 h-4" /> Deposit</span>
            <span className="font-semibold text-forest">
              {partial && <span className="text-ink-faint font-normal">{money(retreat.deposit_received)} of </span>}
              {money(retreat.deposit_required)}
            </span>
          </div>
          {!paid && <p className="text-[11px] text-ink-faint mt-2.5">Payment is handled directly with the camp. Contact your coordinator to pay.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Invoices block ───────────────────────────────────────────────────────────
function InvoicesBlock({ retreat, invoices }: { retreat: PortalRetreat; invoices: PortalInvoice[] }) {
  function download(inv: PortalInvoice) {
    const ok = printInvoice({
      campName: retreat.camp_name ?? 'Camp', groupName: retreat.group_name,
      coordinatorName: retreat.coordinator_name,
      number: inv.number, kind: inv.kind, issuedAt: inv.issued_at, dueDate: inv.due_date,
      lineItems: inv.line_items ?? [], amount: inv.amount, note: inv.note,
      arrivalDate: retreat.arrival_date, departureDate: retreat.departure_date,
    });
    if (!ok) alert('Enable pop-ups to download your invoice.');
  }
  return (
    <div className="space-y-3">
      {invoices.map((inv) => {
        const paid = inv.status === 'paid';
        return (
          <div key={inv.id} className={`${cardClass} p-4`}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-cream-dark text-ink-soft flex items-center justify-center flex-shrink-0">
                <FileText className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-semibold text-forest leading-tight">
                    {inv.kind === 'deposit' ? 'Deposit invoice' : 'Invoice'} · {money(inv.amount)}
                  </p>
                  <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${paid ? 'bg-green-muted-bg text-green-muted-text' : 'bg-amber-bg text-amber-text'}`}>
                    {paid ? 'Paid' : 'Due'}
                  </span>
                </div>
                <p className="text-[12px] text-ink-faint mt-0.5">
                  {inv.number}{inv.due_date ? ` · due ${fmtDateFull(inv.due_date)}` : ''}
                </p>
                {inv.note && <p className="text-[12px] text-ink-soft mt-1.5 leading-relaxed">{inv.note}</p>}
                <button onClick={() => download(inv)} className="mt-2.5 text-[13px] font-semibold text-forest inline-flex items-center gap-1.5 hover:text-forest-mid">
                  <FileText className="w-3.5 h-3.5" /> Download PDF
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-ink-faint px-1">Payment is handled directly with the camp. Contact your coordinator to pay.</p>
    </div>
  );
}

// ─── Final headcount block ────────────────────────────────────────────────────
function HeadcountBlock({ retreat, guests, token, refetch }: {
  retreat: PortalRetreat; guests: PortalGuest[]; token: string; refetch: () => Promise<void>;
}) {
  const confirmed = retreat.final_headcount != null;
  // The roster is the best number available, so it seeds the field. It stays editable -
  // plenty of groups bring someone who never made it onto the list.
  const rosterCount = guests.length;
  const seed = confirmed ? String(retreat.final_headcount)
    : rosterCount > 0 ? String(rosterCount)
    : (retreat.headcount ? String(retreat.headcount) : '');
  const [count, setCount] = useState(seed);
  const [name, setName] = useState(retreat.coordinator_name ?? '');
  const [editing, setEditing] = useState(!confirmed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const due = retreat.headcount_cutoff ?? addDays(retreat.arrival_date, -14);
  const entered = parseInt(count, 10);
  const mismatch = rosterCount > 0 && Number.isFinite(entered) ? entered - rosterCount : 0;

  async function submit() {
    const n = parseInt(count, 10);
    if (Number.isNaN(n) || n < 0) { setError('Enter your final number of guests.'); return; }
    if (!name.trim()) { setError('Please enter your name.'); return; }
    setBusy(true); setError(null);
    const { data: ok, error: err } = await supabasePublic.rpc('portal_confirm_headcount', {
      p_token: token, p_headcount: n, p_submitted_by: name.trim(),
    });
    if (err || !ok) { setError('Could not save. Please try again.'); setBusy(false); return; }
    setEditing(false); setBusy(false);
    await refetch();
  }

  return (
    <div className={`${cardClass} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${confirmed && !editing ? 'bg-green-muted-bg text-green-muted-text' : 'bg-cream-dark text-ink-soft'}`}>
          <Users className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-forest leading-tight">Confirm final headcount</p>
          <p className="text-[12px] text-ink-soft mt-0.5">
            {confirmed && !editing
              ? `Confirmed: ${retreat.final_headcount} guests${retreat.final_headcount_by ? ` · by ${retreat.final_headcount_by}` : ''}`
              : rosterCount > 0
                ? `Taken from the ${rosterCount} ${rosterCount === 1 ? 'name' : 'names'} on your rooming list. Adjust it if that isn't everyone.`
                : `Your final number of guests. Due ${fmtDateFull(due)}, about two weeks before arrival.`}
          </p>
          {rosterCount > 0 && mismatch !== 0 && (
            <p className="text-[12px] text-amber-text mt-1.5">
              {mismatch > 0
                ? `That's ${mismatch} more than the ${rosterCount} on your rooming list · ${mismatch === 1 ? 'that guest still needs' : 'those guests still need'} a name and a bed.`
                : `That's ${-mismatch} fewer than the ${rosterCount} on your rooming list.`}
            </p>
          )}

          {confirmed && !editing ? (
            <button onClick={() => setEditing(true)} className="mt-3 text-[13px] font-semibold text-forest inline-flex items-center gap-1.5 hover:text-forest-mid">
              <PenLine className="w-3.5 h-3.5" /> Update headcount
            </button>
          ) : (
            <div className="mt-3 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={labelClass}>Final guests</label>
                  <input type="number" inputMode="numeric" min={0} value={count} onChange={(e) => setCount(e.target.value)} className={inputClass} placeholder="0" disabled={busy} />
                </div>
                <div>
                  <label className={labelClass}>Your name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Your name" disabled={busy} />
                </div>
              </div>
              {error && <p className="text-[12px] text-red">{error}</p>}
              <button onClick={submit} disabled={busy} className={`${btnPrimary} w-full`}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {busy ? 'Saving…' : 'Confirm headcount'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COI upload block ─────────────────────────────────────────────────────────
function CoiBlock({ retreat, documents, token, refetch }: { retreat: PortalRetreat; documents: PortalDocument[]; token: string; refetch: () => Promise<void>; }) {
  const coiDoc = documents.find((d) => d.doc_type === 'coi');
  const received = !!coiDoc && (coiDoc.status === 'received' || coiDoc.status === 'approved' || !!coiDoc.has_file);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10 MB.'); return; }
    setBusy(true); setError(null);
    try {
      const b64 = await fileToBase64(file);
      const { data: res, error: err } = await supabasePublic.functions.invoke('portal-upload-coi', {
        body: { token, fileBase64: b64, fileName: file.name, contentType: file.type, uploadedBy: retreat.coordinator_name },
      });
      if (err || !(res as { ok?: boolean })?.ok) { setError('Could not upload. Use a PDF, JPG or PNG under 10 MB.'); setBusy(false); return; }
      setBusy(false);
      await refetch();
    } catch {
      setError('Could not upload. Please try again.');
      setBusy(false);
    }
  }

  const dueLabel = coiDoc?.due_date ? fmtDateFull(coiDoc.due_date) : 'before arrival';

  return (
    <div className={`${cardClass} p-4 ${received ? 'border-sage' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${received ? 'bg-green-muted-bg text-green-muted-text' : 'bg-cream-dark text-ink-soft'}`}>
          <ShieldCheck className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-forest leading-tight">Certificate of insurance (COI)</p>
            <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${received ? 'bg-green-muted-bg text-green-muted-text' : 'bg-cream-dark text-ink-soft'}`}>
              {received ? 'Received' : 'Required'}
            </span>
          </div>
          <p className="text-[12px] text-ink-soft mt-0.5">
            {received ? 'Thanks, we have your COI on file.' : `Required before your group enters camp, due ${dueLabel}.`}
          </p>

          {/* COI meta if the camp recorded any */}
          {coiDoc?.meta && Object.keys(coiDoc.meta).filter((k) => !['uploaded_by', 'uploaded_via', 'original_name'].includes(k)).length > 0 && (
            <div className="mt-3 bg-cream rounded-xl p-3 space-y-1">
              {Object.entries(coiDoc.meta)
                .filter(([k]) => !['uploaded_by', 'uploaded_via', 'original_name'].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 text-[12px]">
                    <span className="text-ink-soft capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="text-forest font-medium text-right">{String(v)}</span>
                  </div>
                ))}
            </div>
          )}

          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" className="hidden" onChange={onFile} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className={`${received ? 'mt-3 text-[13px] font-semibold text-forest inline-flex items-center gap-1.5 hover:text-forest-mid' : `${btnPrimary} w-full mt-3`}`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {busy ? 'Uploading…' : received ? 'Replace file' : 'Upload your COI'}
          </button>
          {error && <p className="text-[12px] text-red mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Documents block ──────────────────────────────────────────────────────────
function DocumentsBlock({ documents, token, refetch, unlocked, hint }: {
  documents: PortalDocument[]; token: string; refetch: () => Promise<void>;
  unlocked: boolean; hint?: string | null;
}) {
  if (documents.length === 0) {
    return <EmptyCard>No documents have been shared yet.</EmptyCard>;
  }
  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <DocumentCard key={doc.id} doc={doc} token={token} refetch={refetch} unlocked={unlocked} hint={hint} />
      ))}
    </div>
  );
}

function DocumentCard({ doc, token, refetch, unlocked, hint }: {
  doc: PortalDocument; token: string; refetch: () => Promise<void>;
  unlocked: boolean; hint?: string | null;
}) {
  const [showUnlock, setShowUnlock] = useState(false);
  const [name, setName] = useState('');
  const [consented, setConsented] = useState(false);
  const [opened, setOpened] = useState(false);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [sending, setSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeRequired, setCodeRequired] = useState(true);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isSigned = doc.status === 'signed' || !!doc.signed_at;
  const signable = !isSigned && (doc.doc_type === 'agreement' || doc.doc_type === 'waiver' || doc.doc_type === 'contract');
  const isCOI = doc.doc_type === 'coi';

  /** The single next thing standing between the guest and a signature, or null when ready. */
  const blocker = doc.has_file && !opened
    ? 'Open the agreement above first, then this unlocks.'
    : !consented
      ? 'Tick the box above to confirm you have read it.'
      : !name.trim()
        ? 'Type your full name to sign.'
        : null;

  /**
   * Fetch a short-lived signed URL for the document.
   *
   * The bucket is private and the portal is anonymous, so the URL is minted by an edge function
   * that validates the portal token server-side. It also returns a hash of the exact bytes
   * served, which is recorded with the signature so the camp can later prove which version was
   * agreed to.
   */
  async function openDocument(): Promise<void> {
    setOpening(true); setError(null);

    // A new tab rather than an inline viewer: guests need to read, scroll, print and keep a
    // copy, and the browser's own PDF viewer does all four better than we would.
    //
    // The tab is opened here, synchronously, while the click's user activation is still live.
    // Opening it after the await below reads as unsolicited and is blocked by default. It
    // starts blank and is pointed at the signed URL once that comes back. Nulling `opener`
    // while the tab is still same-origin about:blank is what 'noopener' would have bought us,
    // except that passing 'noopener' makes window.open return null even when it succeeds --
    // which is what made this warn about pop-ups on every successful open.
    const win = window.open('', '_blank');
    if (win) win.opener = null;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/portal-document`, {
        method: 'POST',
        headers: portalFnHeaders(),
        body: JSON.stringify({ token, docId: doc.id, access: readPortalSession(token) }),
      });
      const payload = await res.json();
      if (!res.ok) { win?.close(); setError(payload?.error ?? 'Could not open the document.'); return; }
      setFileHash(payload.sha256 ?? null);
      setOpened(true);
      if (win) win.location.replace(payload.url);
      else setError('Your browser blocked the new tab. Allow pop-ups for this site, then try again.');
    } catch {
      win?.close();
      setError('Could not open the document. Please check your connection.');
    } finally {
      setOpening(false);
    }
  }

  /**
   * Ask for the one-time code. It is sent to the coordinator address already on the retreat -
   * not one entered here, so a forwarded link alone cannot bind the group to a contract.
   */
  async function requestCode() {
    setSending(true); setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/portal-signing-code`, {
        method: 'POST',
        headers: portalFnHeaders(),
        body: JSON.stringify({ token, docId: doc.id }),
      });
      const payload = await res.json();
      if (!res.ok) { setError(payload?.error ?? 'Could not send the code.'); return; }
      if (payload.codeRequired === false) {
        // No coordinator address on file, nothing to verify against, so sign directly.
        setCodeRequired(false);
        setCodeSent(true);
        return;
      }
      setCodeRequired(true);
      setCodeSent(true);
      setSentTo(payload.sentTo ?? null);
    } catch {
      setError('Could not send the code. Please check your connection.');
    } finally {
      setSending(false);
    }
  }

  async function sign() {
    if (!name.trim()) { setError('Please type your full name to sign.'); return; }
    if (!consented) { setError('Please confirm you agree to sign electronically.'); return; }
    if (codeRequired && !unlocked && !code.trim()) { setError('Enter the code we emailed you.'); return; }
    setBusy(true); setError(null);
    const { data, error: err } = await supabasePublic.rpc('portal_sign_document', {
      p_token: token,
      p_doc_id: doc.id,
      p_signed_by: name.trim(),
      p_user_agent: navigator.userAgent,
      p_file_hash: fileHash,
      p_code: codeRequired ? code.trim() : null,
      p_access: readPortalSession(token),
    });
    const result = data as { ok?: boolean; error?: string } | null;
    if (err || !result?.ok) {
      setError(result?.error ?? 'Could not record signature. Please try again.');
      setBusy(false);
      return;
    }
    await refetch();
  }

  const statusTone = isSigned ? 'ok' : doc.status === 'approved' ? 'ok' : doc.status === 'rejected' ? 'alert' : 'neutral';
  const statusText = isSigned ? 'Signed' : (doc.status ? doc.status.charAt(0).toUpperCase() + doc.status.slice(1) : 'Pending');

  return (
    <div className={`${cardClass} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isSigned ? 'bg-green-muted-bg text-green-muted-text' : 'bg-cream-dark text-ink-soft'}`}>
          {isCOI ? <ShieldCheck className="w-4.5 h-4.5" /> : isSigned ? <CheckCircle2 className="w-4.5 h-4.5" /> : <FileText className="w-4.5 h-4.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-forest leading-tight">{doc.name}</p>
            <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
              statusTone === 'ok' ? 'bg-green-muted-bg text-green-muted-text'
              : statusTone === 'alert' ? 'bg-red-bg text-red' : 'bg-cream-dark text-ink-soft'}`}>
              {statusText}
            </span>
          </div>
          <p className="text-[12px] text-ink-faint mt-0.5">
            {isSigned && doc.signed_by
              ? `Signed by ${doc.signed_by}${doc.signed_at ? ' · ' + fmtDateTime(doc.signed_at) : ''}`
              : doc.due_date ? `Due ${fmtDateFull(doc.due_date)}` : 'No due date'}
          </p>

          {/* COI meta (read-only) */}
          {isCOI && doc.meta && Object.keys(doc.meta).length > 0 && (
            <div className="mt-3 bg-cream rounded-xl p-3 space-y-1">
              {Object.entries(doc.meta).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-[12px]">
                  <span className="text-ink-soft capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="text-forest font-medium text-right">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Read the document. Available whether or not it still needs signing · a guest
              should always be able to retrieve what they agreed to.

              While the portal is locked this becomes the way IN to unlocking, rather than a
              button that fails with an error the guest cannot act on. */}
          {doc.has_file && !unlocked && (
            <button
              onClick={() => setShowUnlock(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-forest hover:text-forest-mid"
            >
              <Lock className="w-4 h-4" />
              {isSigned ? 'Unlock to view your signed agreement' : 'Unlock to read the agreement'}
            </button>
          )}
          {doc.has_file && unlocked && (
            <button
              onClick={openDocument}
              disabled={opening}
              className={
                // While reading is the step holding up the signature, this stops being a quiet
                // text link and starts looking like the thing to press.
                signable && !opened
                  ? 'mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-forest bg-white border border-sage rounded-btn px-3.5 py-2 hover:bg-sage-pale transition-colors'
                  : 'mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-forest hover:text-forest-mid'
              }
            >
              {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {isSigned ? 'View or download your signed agreement' : 'Read the agreement'}
            </button>
          )}

          {/* Locked: explain, and offer the code. Signing is hidden until this clears, because
              you cannot honestly agree to a document you have not been able to open. */}
          {!unlocked && (
            <div className="mt-3">
              {showUnlock ? (
                <UnlockPanel
                  token={token}
                  hint={hint}
                  what={doc.doc_type === 'agreement' ? 'your retreat agreement' : `your ${doc.name.toLowerCase()}`}
                  onUnlocked={refetch}
                />
              ) : (
                <p className="text-[12.5px] text-ink-soft">
                  This document is private to your group. Unlocking sends a short code to the
                  coordinator's email address.
                </p>
              )}
            </div>
          )}

          {/* Sign affordance */}
          {unlocked && signable && (
            <div className="mt-3 border-t border-cream-dark pt-3">
              {doc.has_file && !opened && (
                <p className="text-[12px] text-ink-soft mb-2.5">
                  Open and read the agreement above before signing.
                </p>
              )}

              <label className="flex items-start gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={(e) => setConsented(e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 flex-none accent-forest"
                />
                <span className="text-[12px] leading-relaxed text-ink">
                  I have read this agreement, I intend to sign it, and I agree that my typed name
                  is my legally binding signature.
                </span>
              </label>

              <label className={labelClass}>Type your full name to sign</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Jordan Meyer"
                disabled={busy}
              />

              {/* Second factor, only when there is no live session. Unlocking the portal already
                  proved control of the coordinator's inbox, and a second code to the same
                  address proves nothing further, it just adds a step at the moment the guest is
                  trying to finish. */}
              {unlocked ? (
                <>
                  <button
                    onClick={sign}
                    disabled={busy || !!blocker}
                    className={`${btnPrimary} mt-3 w-full justify-center`}
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
                    {busy ? 'Signing…' : 'Sign agreement'}
                  </button>
                  {blocker && (
                    <p className="text-[12px] text-ink-soft text-center mt-2">{blocker}</p>
                  )}
                </>
              ) : !codeSent ? (
                <>
                  <button
                    onClick={requestCode}
                    disabled={sending || !!blocker}
                    className={`${btnPrimary} mt-3 w-full justify-center`}
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Email me a code to sign
                  </button>
                  {/* A greyed button with no stated reason is the thing people get stuck on:
                      the missing step is usually "open the agreement", which sits far enough
                      above that nobody connects the two. */}
                  {blocker && (
                    <p className="text-[12px] text-ink-soft text-center mt-2">{blocker}</p>
                  )}
                </>
              ) : (
                <div className="mt-3">
                  {codeRequired && (
                    <>
                      <p className="text-[12px] text-ink-soft mb-2">
                        We sent a 6-digit code to{' '}
                        <span className="font-semibold text-forest">{sentTo ?? 'your email on file'}</span>.
                        It expires in 15 minutes.
                      </p>
                      <label className={labelClass}>Verification code</label>
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className={`${inputClass} tracking-[0.3em] font-mono`}
                        placeholder="000000"
                        inputMode="numeric"
                        disabled={busy}
                      />
                    </>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={sign}
                      disabled={busy || !name.trim() || !consented || (codeRequired && code.length < 6)}
                      className={`${btnPrimary} flex-1 justify-center`}
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
                      Sign agreement
                    </button>
                    {codeRequired && (
                      <button
                        onClick={requestCode}
                        disabled={sending}
                        className="flex-shrink-0 px-3 text-[13px] font-semibold text-ink-soft hover:text-forest"
                      >
                        Resend
                      </button>
                    )}
                  </div>
                </div>
              )}
              {error && <p className="text-[12px] text-red mt-2">{error}</p>}
            </div>
          )}
          {!signable && error && <p className="text-[12px] text-red mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Housing block ────────────────────────────────────────────────────────────
function HousingBlock({ retreat, spaces, housing, guests, token, refetch, today }: {
  retreat: PortalRetreat; spaces: PortalSpace[]; housing: PortalHousing[];
  guests: PortalGuest[]; token: string; refetch: () => Promise<void>; today: string;
}) {
  const locked = housing.length > 0 && housing.some((h) => h.locked);
  const deadlinePassed = !!retreat.housing_deadline && retreat.housing_deadline < today;

  return (
    <RoomingBoard
      retreat={retreat}
      spaces={spaces}
      housing={housing}
      guests={guests}
      token={token}
      refetch={refetch}
      locked={locked}
      deadlinePassed={deadlinePassed}
    />
  );
}

// ─── Menu block ───────────────────────────────────────────────────────────────
function MenuBlock({ published, meals }: { published: boolean; meals: PortalMeal[] }) {
  if (!published) {
    return (
      <EmptyCard>
        <UtensilsCrossed className="w-6 h-6 text-forest/25 mx-auto mb-2" />
        The menu hasn't been published yet. Check back soon. You'll see the full day-by-day plan here once the camp finalizes it.
      </EmptyCard>
    );
  }
  if (meals.length === 0) {
    return <EmptyCard>The menu is published but no meals have been added yet.</EmptyCard>;
  }

  // Group by day
  const days = Array.from(new Set(meals.map((m) => m.day_date))).sort();
  const periodOrder = ['breakfast', 'lunch', 'dinner', 'snack'];

  return (
    <div className="space-y-4">
      {days.map((day) => {
        const dayMeals = meals
          .filter((m) => m.day_date === day)
          .sort((a, b) => periodOrder.indexOf(a.meal_period) - periodOrder.indexOf(b.meal_period));
        return (
          <div key={day} className={`${cardClass} overflow-hidden`}>
            <div className="bg-forest text-white px-4 py-2.5">
              <p className="text-[14px] font-bold">{fmtDateFull(day)}</p>
            </div>
            <div className="divide-y divide-cream-dark">
              {dayMeals.map((m, i) => {
                const items = asList(m.items);
                const allergens = m.allergens ?? [];
                const alternatives = asList(m.alternatives);
                return (
                  <div key={i} className="p-4">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-sage">
                        {MEAL_PERIOD_LABELS[m.meal_period] ?? m.meal_period}
                      </span>
                    </div>
                    {m.name && <p className="text-[14px] font-semibold text-forest">{m.name}</p>}
                    {items.length > 0 && (
                      <ul className="text-[13px] text-ink mt-1 space-y-0.5">
                        {items.map((it, j) => <li key={j}>· {it}</li>)}
                      </ul>
                    )}
                    {allergens.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {allergens.map((a) => (
                          <span key={a} className="text-[10px] font-medium bg-amber-bg text-amber-text px-2 py-0.5 rounded">
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                    {alternatives.length > 0 && (
                      <p className="text-[12px] text-ink-soft mt-2">
                        <span className="font-semibold">Alternatives:</span> {alternatives.join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Change requests block ────────────────────────────────────────────────────
const KIND_LABELS: Record<string, string> = {
  program_space: 'Program / meeting space', dietary: 'Dietary & allergies', childcare: 'Childcare',
  equipment: 'Equipment / AV', housing: 'Housing', menu: 'Menu', headcount: 'Headcount', other: 'Other',
};

function ChangeRequestsBlock({ requests, defaultName, token, refetch }: {
  requests: PortalChangeRequest[]; defaultName: string | null; token: string; refetch: () => Promise<void>;
}) {
  const [kind, setKind] = useState('program_space');
  const [body, setBody] = useState('');
  const [name, setName] = useState(defaultName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);

  /**
   * Withdraw a request. Only possible while it is still pending. Once the camp has replied,
   * the exchange is part of the record of what was agreed and shouldn't vanish from their side.
   */
  async function remove(id: string) {
    setRemovingId(id); setError(null);
    const { data: ok, error: err } = await supabasePublic.rpc('portal_delete_change_request', {
      p_token: token, p_request_id: id,
    });
    if (err || !ok) { setError('Could not withdraw that request. Please try again.'); setRemovingId(null); return; }
    setRemovingId(null);
    await refetch();
  }

  async function submit() {
    if (!body.trim()) { setError('Please describe your request.'); return; }
    if (!name.trim()) { setError('Please enter your name.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabasePublic.rpc('portal_submit_change_request', {
      p_token: token, p_kind: kind, p_body: body.trim(), p_submitted_by: name.trim(),
    });
    if (err) { setError('Could not submit your request. Please try again.'); setBusy(false); return; }
    setBody('');
    setBusy(false);
    await refetch();
  }

  return (
    <div className="space-y-4">
      {/* Submit form */}
      <div className={`${cardClass} p-4 space-y-3`}>
        <div>
          <label className={labelClass}>What's this about?</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass} disabled={busy}>
            <option value="program_space">Program / meeting space</option>
            <option value="dietary">Dietary & allergies</option>
            <option value="childcare">Childcare</option>
            <option value="equipment">Equipment / AV</option>
            <option value="housing">Housing</option>
            <option value="menu">Menu & dining</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Your request</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={`${inputClass} resize-none`}
            rows={4}
            placeholder="Describe what you'd like the camp to change or help with…"
            disabled={busy}
          />
        </div>
        <div>
          <label className={labelClass}>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Your name" disabled={busy} />
        </div>
        {error && <p className="text-[13px] text-red">{error}</p>}
        <button onClick={submit} disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
          {busy ? 'Submitting…' : 'Submit request'}
        </button>
        <p className="text-[11px] text-ink-faint text-center">The camp reviews and approves all changes. You'll see the status below.</p>
      </div>

      {/* Existing requests */}
      {requests.length > 0 && (
        <div className="space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Your requests</p>
          {requests
            .slice()
            .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))
            .map((r) => {
              const accent = r.status === 'approved' ? 'border-l-sage'
                : r.status === 'declined' || r.status === 'rejected' ? 'border-l-red' : 'border-l-amber';
              const tone = r.status === 'approved' ? 'bg-green-muted-bg text-green-muted-text'
                : r.status === 'declined' || r.status === 'rejected' ? 'bg-red-bg text-red' : 'bg-amber-bg text-amber-text';
              return (
                <div key={r.id} className={`${cardClass} border-l-4 ${accent} p-4`}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{KIND_LABELS[r.kind] ?? r.kind}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-[13px] text-ink leading-relaxed">{r.body}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-ink-faint inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Submitted {fmtDateTime(r.submitted_at)}
                    </p>
                    {r.status === 'pending' && !r.responded_at && (
                      <button
                        onClick={() => remove(r.id)}
                        disabled={removingId === r.id}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-soft
                                   transition-colors hover:text-red disabled:opacity-50"
                      >
                        {removingId === r.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />}
                        Withdraw
                      </button>
                    )}
                  </div>
                  {r.response_message && (
                    <div className="mt-2.5 pt-2.5 border-t border-cream-dark">
                      <p className="text-[12px] text-ink leading-relaxed italic">
                        <span className="font-semibold not-italic text-forest">Camp response:</span> {r.response_message}
                      </p>
                      {r.responded_at && <p className="text-[11px] text-ink-faint mt-1">{fmtDateTime(r.responded_at)}</p>}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ─── Feedback block ───────────────────────────────────────────────────────────
function FeedbackBlock({ retreat, submitted, token, refetch, today }: {
  retreat: PortalRetreat; submitted: boolean; token: string; refetch: () => Promise<void>; today: string;
}) {
  const [overall, setOverall] = useState(0);
  const [accommodations, setAccommodations] = useState(0);
  const [food, setFood] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [comment, setComment] = useState('');
  const [returning, setReturning] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  /**
   * A retreat is done the day after it ends, and that is when feedback opens.
   *
   * This used to read `retreat.feedback_opens`, a column nothing populates. It is null on
   * every retreat in the database, so the survey never opened for anybody and the portal kept
   * saying "not open yet" long after the group had gone home. The date is derived from the
   * departure date instead, with the column kept as an optional manual override.
   */
  const opensOn = retreat.feedback_opens ?? (retreat.departure_date ? addDays(retreat.departure_date, 1) : null);
  const open = !!opensOn && opensOn <= today;

  if (submitted || thanks) {
    return (
      <div className={`${cardClass} p-4 sm:p-6 text-center`}>
        <div className="w-14 h-14 bg-sage-pale rounded-2xl flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-7 h-7 text-sage" />
        </div>
        <p className="text-[16px] font-bold text-forest mb-1">Thank you!</p>
        <p className="text-[13px] text-ink-soft leading-relaxed">
          Your feedback has been received. We appreciate you helping us make the next retreat even better.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <EmptyCard>
        <Star className="w-6 h-6 text-forest/25 mx-auto mb-2" />
        {opensOn
          ? <>The feedback survey opens on {fmtDateFull(opensOn)}, the day after your retreat ends.</>
          : <>The feedback survey opens the day after your retreat ends.</>}
      </EmptyCard>
    );
  }

  const hasSomething = overall > 0 || accommodations > 0 || food > 0
    || communication > 0 || comment.trim().length > 0 || returning !== null;

  async function submit() {
    // Ratings are optional. A single sentence is worth more than an abandoned form, so the
    // only thing this refuses is a completely empty submission.
    if (!hasSomething) { setError('Add a rating or a comment, whichever you have time for.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabasePublic.rpc('portal_submit_feedback', {
      p_token: token,
      p_overall: overall || null,
      p_accommodations: accommodations || null,
      p_food: food || null,
      p_communication: communication || null,
      p_comment: comment.trim() || null,
      p_returning: returning,
    });
    if (err) { setError('Could not submit feedback. Please try again.'); setBusy(false); return; }
    setThanks(true);
    await refetch();
  }

  return (
    <div className={`${cardClass} p-4 space-y-1`}>
      <div className="divide-y divide-cream-dark">
        <StarPicker label="Overall experience" value={overall} onChange={setOverall} />
        <StarPicker label="Accommodations" value={accommodations} onChange={setAccommodations} />
        <StarPicker label="Food & dining" value={food} onChange={setFood} />
        <StarPicker label="Communication" value={communication} onChange={setCommunication} />
      </div>

      <div className="pt-3">
        <label className={labelClass}>Comments <span className="normal-case font-normal text-forest/30">optional</span></label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className={`${inputClass} resize-none`}
          rows={4}
          placeholder="What went well? What could be better?"
          disabled={busy}
        />
      </div>

      <div className="pt-3">
        <label className={labelClass}>Would you return?</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setReturning(true)}
            className={`text-[14px] font-semibold rounded-xl py-3 border-2 transition-colors ${
              returning === true ? 'border-sage bg-sage-pale text-forest' : 'border-border text-ink-soft hover:border-sage'}`}
          >
            Yes, we'd return
          </button>
          <button
            type="button"
            onClick={() => setReturning(false)}
            className={`text-[14px] font-semibold rounded-xl py-3 border-2 transition-colors ${
              returning === false ? 'border-amber bg-amber-bg text-amber-text' : 'border-border text-ink-soft hover:border-amber'}`}
          >
            Not sure
          </button>
        </div>
      </div>

      {error && <p className="text-[13px] text-red pt-2">{error}</p>}

      <div className="pt-3">
        <button onClick={submit} disabled={busy || !hasSomething} className={`${btnPrimary} w-full`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {busy ? 'Submitting…' : 'Submit feedback'}
        </button>
        <p className="text-[11.5px] text-ink-faint text-center mt-2">
          Every field is optional. Ratings, a comment, or both, whatever you have time for.
        </p>
      </div>
    </div>
  );
}

// ─── Empty card ───────────────────────────────────────────────────────────────
function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${cardClass} p-4 sm:p-6 text-center text-[13px] text-ink-soft leading-relaxed`}>
      {children}
    </div>
  );
}
