import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import {
  TreePine, CalendarDays, Users, User, Moon, AlertCircle, CheckCircle2, FileText,
  PenLine, ShieldCheck, BedDouble, Accessibility, UtensilsCrossed, MessageSquarePlus,
  Star, Clock, Plus, Trash2, Send, Lock, ClipboardList, Loader2,
  Circle, ChevronRight, Wallet, UploadCloud, ListChecks, DollarSign, AlertTriangle,
} from 'lucide-react';
import {
  money, fmtDateFull, fmtRange, nights, MEAL_PERIOD_LABELS,
} from '@/components/retreats/retreatUi';
import { printInvoice } from '@/lib/invoiceHtml';

// This page renders OUTSIDE the authenticated app shell. It talks to Supabase only
// through token-validated RPCs using its own anonymous client — never the ops store.
const supabasePublic = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

// ─── Types (shape of get_portal_data) ─────────────────────────────────────────
interface PortalRetreat {
  id: string;
  group_name: string;
  group_type: string | null;
  camp_name?: string | null;
  arrival_date: string;
  departure_date: string;
  headcount: number | null;
  coordinator_name: string | null;
  status: string;
  dietary_flags: string[] | null;
  menu_published: boolean;
  change_requests_enabled: boolean;
  feedback_opens: string | null;
  housing_deadline: string | null;
  headcount_cutoff: string | null;
  pricing_model: string | null;
  rate_per_person_night: number | null;
  nights: number | null;
  deposit_required: number | null;
  deposit_received: number | null;
  deposit_due: string | null;
  final_headcount: number | null;
  final_headcount_at: string | null;
  final_headcount_by: string | null;
  total_charges: number | null;
  total_paid: number | null;
  balance_due: number | null;
}
interface PortalDocument {
  id: string;
  doc_type: string;
  name: string;
  status: string;
  due_date: string | null;
  signed_at: string | null;
  signed_by: string | null;
  meta: Record<string, unknown> | null;
  has_file?: boolean;
}
interface PortalSpace {
  id: string;
  name: string;
  bed_capacity: number | null;
  accessible: boolean | null;
}
interface PortalHousing {
  id: string;
  space_id: string;
  space_name: string;
  subgroup_name: string | null;
  people_count: number | null;
  notes: string | null;
  locked: boolean;
}
interface PortalMeal {
  day_date: string;
  meal_period: string;
  name: string | null;
  items: string[] | string | null;
  allergens: string[] | null;
  alternatives: string[] | string | null;
}
interface PortalChangeRequest {
  id: string;
  kind: string;
  body: string;
  status: string;
  submitted_at: string | null;
  response_message: string | null;
  responded_at: string | null;
}
interface PortalInvoice {
  id: string;
  kind: 'deposit' | 'balance';
  number: string;
  amount: number;
  note: string | null;
  due_date: string | null;
  status: string;
  line_items: { description: string; amount: number }[];
  issued_at: string;
}
interface PortalData {
  retreat: PortalRetreat;
  documents: PortalDocument[];
  invoices: PortalInvoice[];
  spaces: PortalSpace[];
  housing: PortalHousing[];
  meals: PortalMeal[];
  change_requests: PortalChangeRequest[];
  feedback_submitted: boolean;
}

type PageState = 'loading' | 'not_found' | 'ready';

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
  if (!iso) return '—';
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
          {subtitle && <p className="text-[12px] text-forest/50 leading-tight">{subtitle}</p>}
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
      <div className="text-[12px] font-semibold uppercase tracking-wide text-forest/45 flex-1">{label}</div>
      <div className="text-[14px] font-semibold text-forest text-right">{value}</div>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'info' | 'warn' | 'ok'; children: React.ReactNode }) {
  const cls = tone === 'ok' ? 'bg-green-muted-bg text-green-muted-text'
    : tone === 'warn' ? 'bg-amber-bg text-amber-text' : 'bg-blue-bg text-blue-text';
  return (
    <div className={`text-[13px] leading-relaxed rounded-xl px-4 py-3 ${cls}`}>{children}</div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status;
  const cls = s === 'active' ? 'bg-sage-pale text-forest'
    : s === 'ready' ? 'bg-green-muted-bg text-green-muted-text'
    : s === 'confirmed' || s === 'inquiry' ? 'bg-blue-bg text-blue-text'
    : s === 'cancelled' ? 'bg-red-bg text-red' : 'bg-cream-dark text-forest/70';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {STATUS_LABELS[s] ?? s}
    </span>
  );
}

function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[13px] font-medium text-forest">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="p-0.5 active:scale-90 transition-transform"
            aria-label={`${label} ${n} stars`}
          >
            <Star
              className={`w-6 h-6 ${n <= value ? 'fill-amber text-amber' : 'text-cream-dark'}`}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Bed dots for a cabin card ────────────────────────────────────────────────
function BedDots({ taken, capacity }: { taken: number; capacity: number }) {
  const cap = Math.max(capacity, taken);
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {Array.from({ length: cap }).map((_, i) => (
        <span
          key={i}
          className={`w-2.5 h-2.5 rounded-full ${i < taken ? 'bg-sage' : 'bg-cream-dark'}`}
        />
      ))}
    </div>
  );
}

const cardClass = 'bg-white border border-border rounded-2xl';
const inputClass = 'w-full text-[15px] bg-white border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage-pale transition-all placeholder:text-forest/30';
const labelClass = 'block text-[12px] font-semibold uppercase tracking-wide text-forest/45 mb-1.5';
const btnPrimary = 'inline-flex items-center justify-center gap-2 bg-forest text-white text-[14px] font-semibold rounded-xl px-5 py-3 hover:bg-forest-mid active:bg-forest disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

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
    const { data: res, error } = await supabasePublic.rpc('get_portal_data', { p_token: token });
    if (error || !res) { setPageState('not_found'); return; }
    setData(res as PortalData);
    setPageState('ready');
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      const { data: res, error } = await supabasePublic.rpc('get_portal_data', { p_token: token });
      if (!active) return;
      if (error || !res) { setPageState('not_found'); return; }
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

  if (pageState === 'not_found' || !data) {
    return (
      <div className="min-h-screen bg-cream w-full flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-forest/40" />
          </div>
          <h1 className="text-[20px] font-bold text-forest mb-2">Portal link not valid</h1>
          <p className="text-[14px] text-forest/50 leading-relaxed">
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

  // 1 — Agreement (only if the camp has shared one)
  if (agreementDoc) {
    const signed = agreementDoc.status === 'signed' || agreementDoc.status === 'approved' || !!agreementDoc.signed_at;
    steps.push({
      key: 'agreement', label: 'Sign the retreat agreement',
      hint: signed ? `Signed${agreementDoc.signed_by ? ` by ${agreementDoc.signed_by}` : ''}` : agreementDoc.due_date ? `Due ${fmtDateFull(agreementDoc.due_date)}` : 'Awaiting your signature',
      state: signed ? 'done' : urgency(agreementDoc.due_date), dueDate: agreementDoc.due_date, sectionId: 'documents', counts: true,
    });
  }

  // 2 — Deposit (only if one is required)
  if (retreat.deposit_required != null && retreat.deposit_required > 0) {
    const paid = (retreat.deposit_received ?? 0) >= retreat.deposit_required;
    const partial = (retreat.deposit_received ?? 0) > 0 && !paid;
    steps.push({
      key: 'deposit', label: 'Pay deposit to hold your dates',
      hint: paid ? 'Paid — your dates are secured' : partial ? 'Partial payment received' : retreat.deposit_due ? `Due ${fmtDateFull(retreat.deposit_due)}` : 'Invoice sent — pay to lock in your dates',
      state: paid ? 'done' : urgency(retreat.deposit_due), dueDate: retreat.deposit_due, sectionId: 'documents', counts: true,
    });
  }

  // 3 — Housing
  const housingLocked = housing.length > 0 && housing.some((h) => h.locked);
  const housingSubmitted = housing.length > 0;
  steps.push({
    key: 'housing', label: 'Assign your group to housing',
    hint: housingLocked ? 'Finalized & locked' : housingSubmitted ? 'Submitted — you can still edit until the deadline' : `Due ${fmtDateFull(housingDue)}`,
    state: housingLocked ? 'done' : housingSubmitted ? 'done' : urgency(housingDue), dueDate: housingDue, sectionId: 'housing', counts: true,
  });

  // 4 — Final headcount
  const headcountDone = retreat.final_headcount != null;
  steps.push({
    key: 'headcount', label: 'Confirm final headcount',
    hint: headcountDone ? `Confirmed: ${retreat.final_headcount} guests` : `Due ${fmtDateFull(headcountDue)} (about 2 weeks out)`,
    state: headcountDone ? 'done' : urgency(headcountDue), dueDate: headcountDue, sectionId: 'final', counts: true,
  });

  // 5 — COI
  const coiDone = !!coiDoc && (coiDoc.status === 'received' || coiDoc.status === 'approved' || !!coiDoc.has_file);
  steps.push({
    key: 'coi', label: 'Submit certificate of insurance',
    hint: coiDone ? 'Received' : `Required before arrival${coiDue ? ` · due ${fmtDateFull(coiDue)}` : ''}`,
    state: coiDone ? 'done' : (daysUntil(arrival) < 0 ? 'overdue' : urgency(coiDue)), dueDate: coiDue, sectionId: 'final', counts: true,
  });

  return steps;
}

// ─── Portal content (only rendered with valid data) ───────────────────────────
function PortalContent({ data, token, refetch }: { data: PortalData; token: string; refetch: () => Promise<void>; }) {
  const { retreat, documents, invoices, spaces, housing, meals, change_requests, feedback_submitted } = data;
  const today = todayISO();
  const numNights = nights(retreat.arrival_date, retreat.departure_date);

  const steps = buildSteps(data);
  const counted = steps.filter((s) => s.counts);
  const doneCount = counted.filter((s) => s.state === 'done').length;
  const allDone = counted.length > 0 && doneCount === counted.length;

  // Countdown label
  const dUntil = daysUntil(retreat.arrival_date);
  const dUntilDepart = daysUntil(retreat.departure_date);
  const countdown = dUntil > 0 ? `${dUntil} ${dUntil === 1 ? 'day' : 'days'} until arrival`
    : dUntilDepart >= 0 ? 'Your retreat is underway'
    : 'Retreat complete';

  const NAV = [
    { id: 'todo', label: 'To-do' },
    { id: 'info', label: 'Overview' },
    { id: 'documents', label: 'Agreement' },
    { id: 'housing', label: 'Housing' },
    ...(retreat.change_requests_enabled ? [{ id: 'requests', label: 'Requests' }] : []),
    { id: 'final', label: 'Final steps' },
    { id: 'menu', label: 'Menu' },
    { id: 'feedback', label: 'Feedback' },
  ];

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-screen bg-cream w-full">
      {/* Branded header with countdown */}
      <div className="bg-forest text-white">
        <div className="max-w-lg mx-auto px-5 pt-7 pb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-sage rounded-xl flex items-center justify-center flex-shrink-0">
              <TreePine className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-sage-light uppercase tracking-widest">Retreat Portal</p>
              <h1 className="text-[19px] font-bold leading-tight truncate">{retreat.group_name}</h1>
            </div>
            <span className="flex-shrink-0 inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5 text-[12px] font-semibold text-sage-light">
              <Clock className="w-3.5 h-3.5" /> {countdown}
            </span>
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

          {/* Progress bar */}
          {counted.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[12px] text-white/70 mb-1.5">
                <span>{allDone ? "You're all set 🎉" : 'Your progress'}</span>
                <span className="font-semibold text-white">{doneCount} of {counted.length} done</span>
              </div>
              <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${(doneCount / counted.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky sub-nav */}
      <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-3">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-2">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => scrollTo(n.id)}
                className="flex-shrink-0 text-[13px] font-semibold text-forest/70 hover:text-forest px-3.5 py-1.5 rounded-full hover:bg-sage-pale transition-colors"
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-7 space-y-9">
        {/* 0 — Welcome */}
        <div className="bg-sage-pale border border-sage/30 rounded-2xl px-5 py-4 -mb-3">
          <p className="text-[15px] font-bold text-forest">Welcome, {retreat.coordinator_name?.split(' ')[0] ?? retreat.group_name} 👋</p>
          <p className="text-[13px] text-forest/75 mt-1.5 leading-relaxed">
            This is your private hub for {retreat.group_name}'s stay. The checklist below shows
            everything the camp needs from you before you arrive — tap any item to jump to it. Your changes save automatically.
          </p>
          <p className="text-[12px] text-forest/50 mt-2.5">
            🔖 Bookmark this page — it's your private link, so there's no password to remember.
          </p>
        </div>

        {/* 1 — To-do checklist (the hero) */}
        <Section id="todo" icon={<ListChecks className="w-4.5 h-4.5" />} title="Your checklist" subtitle={allDone ? 'Everything is in — thank you!' : "What the camp needs from you"}>
          <ChecklistBlock steps={steps} onJump={scrollTo} />
        </Section>

        {/* 2 — Overview */}
        <Section id="info" icon={<ClipboardList className="w-4.5 h-4.5" />} title="Booking overview" subtitle="Your reservation at a glance">
          <div className={`${cardClass} divide-y divide-cream-dark overflow-hidden`}>
            <div className="flex items-center justify-between py-3 px-4">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-forest/45">Status</span>
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

          {retreat.dietary_flags && retreat.dietary_flags.length > 0 && (
            <div className={`${cardClass} p-4 mt-3`}>
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
            <div className={`${cardClass} p-4 mt-3`}>
              <p className={labelClass}>Account balance</p>
              <div className="space-y-1.5 text-[14px]">
                {retreat.pricing_model === 'per_person_night' && retreat.rate_per_person_night != null && (
                  <div className="flex justify-between text-forest/50 text-[12px]">
                    <span>{money(retreat.rate_per_person_night)}/person/night × {retreat.headcount ?? 0} × {retreat.nights ?? 0} night{(retreat.nights ?? 0) === 1 ? '' : 's'}</span>
                  </div>
                )}
                <div className="flex justify-between text-forest/70">
                  <span>Total charges</span><span className="font-mono">{money(retreat.total_charges)}</span>
                </div>
                <div className="flex justify-between text-forest/70">
                  <span>Paid</span><span className="font-mono">{money(retreat.total_paid)}</span>
                </div>
                <div className="flex justify-between font-semibold text-forest pt-1.5 border-t border-cream-dark">
                  <span>Balance due</span>
                  <span className={`font-mono ${(retreat.balance_due ?? 0) > 0 ? 'text-amber-text' : 'text-green-muted-text'}`}>
                    {money(retreat.balance_due)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-forest/40 mt-2.5">Payments are handled directly with the camp — contact your coordinator to pay.</p>
            </div>
          )}
        </Section>

        {/* 3 — Agreement & deposit */}
        <Section id="documents" icon={<FileText className="w-4.5 h-4.5" />} title="Agreement & deposit" subtitle="Secure your booking">
          <DepositCard retreat={retreat} />
          {invoices.length > 0 && (
            <div className="mt-3">
              <InvoicesBlock retreat={retreat} invoices={invoices} />
            </div>
          )}
          <div className="mt-3">
            <DocumentsBlock documents={documents.filter((d) => d.doc_type !== 'coi')} token={token} refetch={refetch} />
          </div>
        </Section>

        {/* 4 — Housing */}
        <Section id="housing" icon={<BedDouble className="w-4.5 h-4.5" />} title="Housing" subtitle="Assign your group to cabins & rooms">
          <HousingBlock retreat={retreat} spaces={spaces} housing={housing} token={token} refetch={refetch} today={today} />
        </Section>

        {/* 5 — Special requests */}
        {retreat.change_requests_enabled && (
          <Section id="requests" icon={<MessageSquarePlus className="w-4.5 h-4.5" />} title="Special requests" subtitle="Program spaces, dietary, childcare & more">
            <ChangeRequestsBlock
              requests={change_requests}
              defaultName={retreat.coordinator_name}
              token={token}
              refetch={refetch}
            />
          </Section>
        )}

        {/* 6 — Final steps */}
        <Section id="final" icon={<ListChecks className="w-4.5 h-4.5" />} title="Final steps" subtitle="Due in the weeks before arrival">
          <div className="space-y-3">
            <HeadcountBlock retreat={retreat} token={token} refetch={refetch} />
            <CoiBlock retreat={retreat} documents={documents} token={token} refetch={refetch} />
          </div>
        </Section>

        {/* 7 — Menu */}
        <Section id="menu" icon={<UtensilsCrossed className="w-4.5 h-4.5" />} title="Menu & dining" subtitle="What's being served">
          <MenuBlock published={retreat.menu_published} meals={meals} />
        </Section>

        {/* 8 — Feedback */}
        <Section id="feedback" icon={<Star className="w-4.5 h-4.5" />} title="Feedback" subtitle="Tell us how it went">
          <FeedbackBlock retreat={retreat} submitted={feedback_submitted} token={token} refetch={refetch} today={today} />
        </Section>

        <div className="pt-2 pb-6 text-center">
          <p className="text-[11px] text-forest/35">Powered by CampCommand · This is a private link — please don't share it publicly.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Checklist block ──────────────────────────────────────────────────────────
function ChecklistBlock({ steps, onJump }: { steps: Step[]; onJump: (id: string) => void }) {
  // Show incomplete items first (most urgent at top), completed at the bottom.
  const rank: Record<StepState, number> = { overdue: 0, due_soon: 1, todo: 2, locked: 3, done: 4 };
  const ordered = [...steps].sort((a, b) => rank[a.state] - rank[b.state]);

  const styleFor = (s: StepState) => {
    switch (s) {
      case 'done': return { icon: <CheckCircle2 className="w-5 h-5 text-sage" />, chip: 'bg-green-muted-bg text-green-muted-text', chipText: 'Done' };
      case 'overdue': return { icon: <AlertTriangle className="w-5 h-5 text-red" />, chip: 'bg-red-bg text-red', chipText: 'Overdue' };
      case 'due_soon': return { icon: <Circle className="w-5 h-5 text-amber-text" />, chip: 'bg-amber-bg text-amber-text', chipText: 'Due soon' };
      case 'locked': return { icon: <Lock className="w-5 h-5 text-forest/35" />, chip: 'bg-cream-dark text-forest/55', chipText: 'Locked' };
      default: return { icon: <Circle className="w-5 h-5 text-forest/30" />, chip: 'bg-cream-dark text-forest/55', chipText: 'To do' };
    }
  };

  return (
    <div className={`${cardClass} divide-y divide-cream-dark overflow-hidden`}>
      {ordered.map((step) => {
        const st = styleFor(step.state);
        return (
          <button
            key={step.key}
            onClick={() => onJump(step.sectionId)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cream/50 transition-colors"
          >
            <span className="flex-shrink-0">{st.icon}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[14px] font-semibold leading-tight ${step.state === 'done' ? 'text-forest/55' : 'text-forest'}`}>{step.label}</span>
              <span className="block text-[12px] text-forest/50 mt-0.5">{step.hint}</span>
            </span>
            <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${st.chip}`}>{st.chipText}</span>
            <ChevronRight className="w-4 h-4 text-forest/25 flex-shrink-0" />
          </button>
        );
      })}
    </div>
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
            <p className="text-[14px] font-semibold text-forest leading-tight">Deposit — holds your dates</p>
            <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${paid ? 'bg-green-muted-bg text-green-muted-text' : partial ? 'bg-amber-bg text-amber-text' : 'bg-cream-dark text-forest/60'}`}>
              {paid ? 'Paid' : partial ? 'Partial' : 'Due'}
            </span>
          </div>
          <p className="text-[12px] text-forest/50 mt-0.5">
            {paid ? 'Your dates are secured — thank you!'
              : retreat.deposit_due ? `Please pay by ${fmtDateFull(retreat.deposit_due)} to lock in your dates.`
              : 'Paying your deposit locks in your dates.'}
          </p>
          <div className="mt-3 bg-cream rounded-xl p-3 flex items-center justify-between text-[14px]">
            <span className="inline-flex items-center gap-1.5 text-forest/60"><DollarSign className="w-4 h-4" /> Deposit</span>
            <span className="font-semibold text-forest">
              {partial && <span className="text-forest/45 font-normal">{money(retreat.deposit_received)} of </span>}
              {money(retreat.deposit_required)}
            </span>
          </div>
          {!paid && <p className="text-[11px] text-forest/40 mt-2.5">Payment is handled directly with the camp — contact your coordinator to pay.</p>}
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
              <div className="w-9 h-9 rounded-xl bg-cream-dark text-forest/50 flex items-center justify-center flex-shrink-0">
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
                <p className="text-[12px] text-forest/45 mt-0.5">
                  {inv.number}{inv.due_date ? ` · due ${fmtDateFull(inv.due_date)}` : ''}
                </p>
                {inv.note && <p className="text-[12px] text-forest/55 mt-1.5 leading-relaxed">{inv.note}</p>}
                <button onClick={() => download(inv)} className="mt-2.5 text-[13px] font-semibold text-forest inline-flex items-center gap-1.5 hover:text-forest-mid">
                  <FileText className="w-3.5 h-3.5" /> Download PDF
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-forest/40 px-1">Payment is handled directly with the camp — contact your coordinator to pay.</p>
    </div>
  );
}

// ─── Final headcount block ────────────────────────────────────────────────────
function HeadcountBlock({ retreat, token, refetch }: { retreat: PortalRetreat; token: string; refetch: () => Promise<void>; }) {
  const confirmed = retreat.final_headcount != null;
  const [count, setCount] = useState(confirmed ? String(retreat.final_headcount) : (retreat.headcount ? String(retreat.headcount) : ''));
  const [name, setName] = useState(retreat.coordinator_name ?? '');
  const [editing, setEditing] = useState(!confirmed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const due = retreat.headcount_cutoff ?? addDays(retreat.arrival_date, -14);

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
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${confirmed && !editing ? 'bg-green-muted-bg text-green-muted-text' : 'bg-cream-dark text-forest/50'}`}>
          <Users className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-forest leading-tight">Confirm final headcount</p>
          <p className="text-[12px] text-forest/50 mt-0.5">
            {confirmed && !editing
              ? `Confirmed: ${retreat.final_headcount} guests${retreat.final_headcount_by ? ` · by ${retreat.final_headcount_by}` : ''}`
              : `Your final number of guests. Due ${fmtDateFull(due)} — about two weeks before arrival.`}
          </p>

          {confirmed && !editing ? (
            <button onClick={() => setEditing(true)} className="mt-3 text-[13px] font-semibold text-forest inline-flex items-center gap-1.5 hover:text-forest-mid">
              <PenLine className="w-3.5 h-3.5" /> Update headcount
            </button>
          ) : (
            <div className="mt-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
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
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${received ? 'bg-green-muted-bg text-green-muted-text' : 'bg-cream-dark text-forest/50'}`}>
          <ShieldCheck className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-forest leading-tight">Certificate of insurance (COI)</p>
            <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${received ? 'bg-green-muted-bg text-green-muted-text' : 'bg-cream-dark text-forest/60'}`}>
              {received ? 'Received' : 'Required'}
            </span>
          </div>
          <p className="text-[12px] text-forest/50 mt-0.5">
            {received ? 'Thanks — we have your COI on file.' : `Required before your group enters camp — due ${dueLabel}.`}
          </p>

          {/* COI meta if the camp recorded any */}
          {coiDoc?.meta && Object.keys(coiDoc.meta).filter((k) => !['uploaded_by', 'uploaded_via', 'original_name'].includes(k)).length > 0 && (
            <div className="mt-3 bg-cream rounded-xl p-3 space-y-1">
              {Object.entries(coiDoc.meta)
                .filter(([k]) => !['uploaded_by', 'uploaded_via', 'original_name'].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 text-[12px]">
                    <span className="text-forest/50 capitalize">{k.replace(/_/g, ' ')}</span>
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
function DocumentsBlock({ documents, token, refetch }: { documents: PortalDocument[]; token: string; refetch: () => Promise<void>; }) {
  if (documents.length === 0) {
    return <EmptyCard>No documents have been shared yet.</EmptyCard>;
  }
  return (
    <div className="space-y-3">
      {documents.map((doc) => <DocumentCard key={doc.id} doc={doc} token={token} refetch={refetch} />)}
    </div>
  );
}

function DocumentCard({ doc, token, refetch }: { doc: PortalDocument; token: string; refetch: () => Promise<void>; }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSigned = doc.status === 'signed' || !!doc.signed_at;
  const signable = !isSigned && (doc.doc_type === 'agreement' || doc.doc_type === 'waiver' || doc.doc_type === 'contract');
  const isCOI = doc.doc_type === 'coi';

  async function sign() {
    if (!name.trim()) { setError('Please type your full name to sign.'); return; }
    setBusy(true); setError(null);
    const { data: ok, error: err } = await supabasePublic.rpc('portal_sign_document', {
      p_token: token, p_doc_id: doc.id, p_signed_by: name.trim(),
    });
    if (err || !ok) { setError('Could not record signature. Please try again.'); setBusy(false); return; }
    await refetch();
  }

  const statusTone = isSigned ? 'ok' : doc.status === 'approved' ? 'ok' : doc.status === 'rejected' ? 'alert' : 'neutral';
  const statusText = isSigned ? 'Signed' : (doc.status ? doc.status.charAt(0).toUpperCase() + doc.status.slice(1) : 'Pending');

  return (
    <div className={`${cardClass} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isSigned ? 'bg-green-muted-bg text-green-muted-text' : 'bg-cream-dark text-forest/50'}`}>
          {isCOI ? <ShieldCheck className="w-4.5 h-4.5" /> : isSigned ? <CheckCircle2 className="w-4.5 h-4.5" /> : <FileText className="w-4.5 h-4.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-forest leading-tight">{doc.name}</p>
            <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
              statusTone === 'ok' ? 'bg-green-muted-bg text-green-muted-text'
              : statusTone === 'alert' ? 'bg-red-bg text-red' : 'bg-cream-dark text-forest/60'}`}>
              {statusText}
            </span>
          </div>
          <p className="text-[12px] text-forest/45 mt-0.5">
            {isSigned && doc.signed_by
              ? `Signed by ${doc.signed_by}${doc.signed_at ? ' · ' + fmtDateTime(doc.signed_at) : ''}`
              : doc.due_date ? `Due ${fmtDateFull(doc.due_date)}` : 'No due date'}
          </p>

          {/* COI meta (read-only) */}
          {isCOI && doc.meta && Object.keys(doc.meta).length > 0 && (
            <div className="mt-3 bg-cream rounded-xl p-3 space-y-1">
              {Object.entries(doc.meta).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-[12px]">
                  <span className="text-forest/50 capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="text-forest font-medium text-right">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Sign affordance */}
          {signable && (
            <div className="mt-3 border-t border-cream-dark pt-3">
              <label className={labelClass}>Type your full name to sign</label>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Jordan Meyer"
                  disabled={busy}
                />
                <button onClick={sign} disabled={busy || !name.trim()} className={`${btnPrimary} flex-shrink-0`}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
                  Sign
                </button>
              </div>
              {error && <p className="text-[12px] text-red mt-2">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Housing block ────────────────────────────────────────────────────────────
function HousingBlock({ retreat, spaces, housing, token, refetch, today }: {
  retreat: PortalRetreat; spaces: PortalSpace[]; housing: PortalHousing[];
  token: string; refetch: () => Promise<void>; today: string;
}) {
  const locked = housing.length > 0 && housing.some((h) => h.locked);
  const deadlinePassed = !!retreat.housing_deadline && retreat.housing_deadline < today;

  if (locked) {
    return (
      <div className="space-y-3">
        <Banner tone="ok">
          <span className="inline-flex items-center gap-1.5 font-semibold"><Lock className="w-4 h-4" /> Housing is finalized</span>
          <p className="mt-1">Your assignments are locked in below. Need a change? Use the change requests section and the camp will help.</p>
        </Banner>
        <div className="grid grid-cols-1 gap-3">
          {housing.map((h) => {
            const space = spaces.find((s) => s.id === h.space_id);
            const cap = space?.bed_capacity ?? h.people_count ?? 0;
            return (
              <div key={h.id} className={`${cardClass} border-sage p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-bold text-forest">{h.space_name}</p>
                    {h.subgroup_name && <p className="text-[13px] text-forest/60">{h.subgroup_name}</p>}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-forest">
                    <Users className="w-4 h-4 text-sage" />{h.people_count ?? 0}{cap ? `/${cap}` : ''}
                  </span>
                </div>
                <BedDots taken={h.people_count ?? 0} capacity={cap} />
                {h.notes && <p className="text-[12px] text-forest/55 mt-2.5 leading-relaxed">{h.notes}</p>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <HousingBuilder
      retreat={retreat}
      spaces={spaces}
      housing={housing}
      token={token}
      refetch={refetch}
      deadlinePassed={deadlinePassed}
    />
  );
}

interface HousingRow { space_id: string; subgroup_name: string; people_count: string; notes: string; }

function HousingBuilder({ retreat, spaces, housing, token, refetch, deadlinePassed }: {
  retreat: PortalRetreat; spaces: PortalSpace[]; housing: PortalHousing[];
  token: string; refetch: () => Promise<void>; deadlinePassed: boolean;
}) {
  const [rows, setRows] = useState<HousingRow[]>(() =>
    housing.length > 0
      ? housing.map((h) => ({
          space_id: h.space_id,
          subgroup_name: h.subgroup_name ?? '',
          people_count: h.people_count != null ? String(h.people_count) : '',
          notes: h.notes ?? '',
        }))
      : [{ space_id: '', subgroup_name: '', people_count: '', notes: '' }],
  );
  const [name, setName] = useState(retreat.coordinator_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function update(i: number, patch: Partial<HousingRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() { setRows((rs) => [...rs, { space_id: '', subgroup_name: '', people_count: '', notes: '' }]); }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }

  async function submit() {
    const valid = rows.filter((r) => r.space_id);
    if (valid.length === 0) { setError('Add at least one cabin assignment.'); return; }
    if (!name.trim()) { setError('Please enter your name so the camp knows who submitted this.'); return; }
    setBusy(true); setError(null);
    const assignments = valid.map((r) => ({
      space_id: r.space_id,
      subgroup_name: r.subgroup_name.trim() || null,
      people_count: r.people_count ? Number(r.people_count) : 0,
      notes: r.notes.trim() || null,
    }));
    const { data: ok, error: err } = await supabasePublic.rpc('portal_submit_housing', {
      p_token: token, p_assignments: assignments, p_submitted_by: name.trim(),
    });
    if (err || !ok) { setError('Could not submit housing. It may now be locked — please contact the camp.'); setBusy(false); return; }
    setDone(true);
    await refetch();
    setBusy(false);
  }

  const usedSpaceIds = rows.map((r) => r.space_id);

  return (
    <div className="space-y-3">
      {deadlinePassed ? (
        <Banner tone="warn">
          The housing deadline {retreat.housing_deadline ? `(${fmtDateFull(retreat.housing_deadline)})` : ''} has passed.
          You can still try to submit, but please also contact the camp directly to confirm any changes.
        </Banner>
      ) : (
        <Banner tone="info">
          Assign your group to cabins below.{retreat.housing_deadline ? ` Please submit by ${fmtDateFull(retreat.housing_deadline)}.` : ''}
        </Banner>
      )}

      {done && (
        <Banner tone="ok">
          <span className="inline-flex items-center gap-1.5 font-semibold"><CheckCircle2 className="w-4 h-4" /> Housing submitted</span>
          <p className="mt-1">Thanks! The camp has your assignments and will confirm them.</p>
        </Banner>
      )}

      {rows.map((row, i) => {
        const space = spaces.find((s) => s.id === row.space_id);
        return (
          <div key={i} className={`${cardClass} p-4 space-y-3`}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-forest/45">Assignment {i + 1}</span>
              {rows.length > 1 && (
                <button onClick={() => removeRow(i)} className="text-forest/40 hover:text-red p-1" aria-label="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div>
              <label className={labelClass}>Cabin / space</label>
              <select
                value={row.space_id}
                onChange={(e) => update(i, { space_id: e.target.value })}
                className={inputClass}
                disabled={busy}
              >
                <option value="">Select a space…</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id} disabled={usedSpaceIds.includes(s.id) && s.id !== row.space_id}>
                    {s.name}{s.bed_capacity ? ` · ${s.bed_capacity} beds` : ''}{s.accessible ? ' · accessible' : ''}
                  </option>
                ))}
              </select>
              {space?.accessible && (
                <p className="inline-flex items-center gap-1 text-[11px] text-blue-text mt-1.5">
                  <Accessibility className="w-3.5 h-3.5" /> Accessible space
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Subgroup name</label>
                <input
                  value={row.subgroup_name}
                  onChange={(e) => update(i, { subgroup_name: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Staff A"
                  disabled={busy}
                />
              </div>
              <div>
                <label className={labelClass}>People</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={space?.bed_capacity ?? undefined}
                  value={row.people_count}
                  onChange={(e) => update(i, { people_count: e.target.value })}
                  className={inputClass}
                  placeholder="0"
                  disabled={busy}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Notes <span className="normal-case font-normal text-forest/30">— optional</span></label>
              <textarea
                value={row.notes}
                onChange={(e) => update(i, { notes: e.target.value })}
                className={`${inputClass} resize-none`}
                rows={2}
                placeholder="Anything the camp should know about this group…"
                disabled={busy}
              />
            </div>
          </div>
        );
      })}

      <button onClick={addRow} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 text-[14px] font-semibold text-forest border-2 border-dashed border-border rounded-xl py-3 hover:border-sage hover:bg-sage-pale/40 transition-colors">
        <Plus className="w-4 h-4" /> Add another cabin
      </button>

      <div className={`${cardClass} p-4`}>
        <label className={labelClass}>Submitted by</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Your name"
          disabled={busy}
        />
      </div>

      {error && <p className="text-[13px] text-red">{error}</p>}

      <button onClick={submit} disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {busy ? 'Submitting…' : 'Submit housing'}
      </button>
    </div>
  );
}

// ─── Menu block ───────────────────────────────────────────────────────────────
function MenuBlock({ published, meals }: { published: boolean; meals: PortalMeal[] }) {
  if (!published) {
    return (
      <EmptyCard>
        <UtensilsCrossed className="w-6 h-6 text-forest/25 mx-auto mb-2" />
        The menu hasn't been published yet. Check back soon — you'll see the full day-by-day plan here once the camp finalizes it.
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
                      <ul className="text-[13px] text-forest/70 mt-1 space-y-0.5">
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
                      <p className="text-[12px] text-forest/50 mt-2">
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
        <p className="text-[11px] text-forest/40 text-center">The camp reviews and approves all changes. You'll see the status below.</p>
      </div>

      {/* Existing requests */}
      {requests.length > 0 && (
        <div className="space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-forest/45">Your requests</p>
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
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-forest/50">{KIND_LABELS[r.kind] ?? r.kind}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-[13px] text-forest/80 leading-relaxed">{r.body}</p>
                  <p className="text-[11px] text-forest/40 mt-1.5 inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Submitted {fmtDateTime(r.submitted_at)}
                  </p>
                  {r.response_message && (
                    <div className="mt-2.5 pt-2.5 border-t border-cream-dark">
                      <p className="text-[12px] text-forest/70 leading-relaxed italic">
                        <span className="font-semibold not-italic text-forest">Camp response:</span> {r.response_message}
                      </p>
                      {r.responded_at && <p className="text-[11px] text-forest/35 mt-1">{fmtDateTime(r.responded_at)}</p>}
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

  const opensSet = !!retreat.feedback_opens;
  const open = opensSet && retreat.feedback_opens! <= today;

  if (submitted || thanks) {
    return (
      <div className={`${cardClass} p-6 text-center`}>
        <div className="w-14 h-14 bg-sage-pale rounded-2xl flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-7 h-7 text-sage" />
        </div>
        <p className="text-[16px] font-bold text-forest mb-1">Thank you!</p>
        <p className="text-[13px] text-forest/55 leading-relaxed">
          Your feedback has been received. We appreciate you helping us make the next retreat even better.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <EmptyCard>
        <Star className="w-6 h-6 text-forest/25 mx-auto mb-2" />
        {opensSet
          ? <>The feedback survey opens on {fmtDateFull(retreat.feedback_opens)}, at the end of your stay.</>
          : <>The feedback survey isn't open yet. It becomes available at the end of your retreat.</>}
      </EmptyCard>
    );
  }

  async function submit() {
    if (overall === 0) { setError('Please give an overall rating.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabasePublic.rpc('portal_submit_feedback', {
      p_token: token,
      p_overall: overall,
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
        <label className={labelClass}>Comments <span className="normal-case font-normal text-forest/30">— optional</span></label>
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
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setReturning(true)}
            className={`text-[14px] font-semibold rounded-xl py-3 border-2 transition-colors ${
              returning === true ? 'border-sage bg-sage-pale text-forest' : 'border-border text-forest/60 hover:border-sage'}`}
          >
            Yes, we'd return
          </button>
          <button
            type="button"
            onClick={() => setReturning(false)}
            className={`text-[14px] font-semibold rounded-xl py-3 border-2 transition-colors ${
              returning === false ? 'border-amber bg-amber-bg text-amber-text' : 'border-border text-forest/60 hover:border-amber'}`}
          >
            Not sure
          </button>
        </div>
      </div>

      {error && <p className="text-[13px] text-red pt-2">{error}</p>}

      <div className="pt-3">
        <button onClick={submit} disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {busy ? 'Submitting…' : 'Submit feedback'}
        </button>
      </div>
    </div>
  );
}

// ─── Empty card ───────────────────────────────────────────────────────────────
function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${cardClass} p-6 text-center text-[13px] text-forest/50 leading-relaxed`}>
      {children}
    </div>
  );
}
