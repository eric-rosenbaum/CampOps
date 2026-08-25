import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ChevronDown, Check, Wrench, ShieldCheck, Waves,
  Building2, UtensilsCrossed, CalendarRange, Users, CheckSquare, Eye,
  Smartphone, Camera, Wifi,
} from 'lucide-react';
import { CampCommandMark, CC_CREAM, CC_GREEN } from '@/components/shared/CampCommandMark';

const DEMO_MAILTO = 'mailto:eric@campcommand.app?subject=CampCommand%20demo%20request&body=Hi%20%E2%80%94%20I%27d%20like%20to%20see%20a%20demo%20of%20CampCommand%20for%20our%20camp.';

// Paste your booking page URL here to turn "Book a demo" into an in-page scheduler that
// drops the meeting straight onto your Google Calendar. Works with a Google Calendar
// Appointment Schedule link (calendar.google.com/calendar/appointments/…) or a Calendly
// link (calendly.com/…). Leave it as '' and "Book a demo" falls back to an email.
const DEMO_SCHEDULING_URL: string = 'https://calendar.app.google/Cwfexway6Wswhf6p9';

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Top navigation ─────────────────────────────────────────────────────────────

function Nav({ onSignIn, onBookDemo }: { onSignIn: () => void; onBookDemo: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`fixed top-0 inset-x-0 z-40 transition-colors duration-300 ${scrolled ? 'bg-cream/95 backdrop-blur border-b border-black/5 shadow-sm' : 'bg-transparent'}`}>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CampCommandMark
            size={32}
            disc={scrolled ? CC_GREEN : CC_CREAM}
            ink={scrolled ? CC_CREAM : CC_GREEN}
            decorative
            className="flex-shrink-0"
          />
          <span className={`text-[16px] font-semibold transition-colors ${scrolled ? 'text-forest' : 'text-cream'}`}>CampCommand</span>
        </div>
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => scrollToId('how-it-works')}
            className={`hidden sm:inline-flex items-center gap-1 px-3 py-2 text-[14px] font-medium rounded-btn transition-colors ${scrolled ? 'text-ink hover:text-forest' : 'text-cream/80 hover:text-cream'}`}
          >
            How it works <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onBookDemo}
            className={`px-3.5 py-2 text-[14px] font-semibold rounded-btn border transition-colors ${scrolled ? 'border-forest/20 text-forest hover:bg-forest/5' : 'border-cream/30 text-cream hover:bg-white/10'}`}
          >
            Book a demo
          </button>
          <button
            onClick={onSignIn}
            className="px-4 py-2 text-[14px] font-semibold rounded-btn bg-sage text-forest hover:bg-sage-light transition-colors"
          >
            Sign in
          </button>
        </nav>
      </div>
    </header>
  );
}

// ─── The hero's single "operations snapshot" card ───────────────────────────────

// One card that IS the pitch: the whole camp, across every module, handled at a glance -
// with one item flagged so it reads as a system that catches things, not a static list.
const SNAPSHOT = [
  { icon: Wrench, label: 'Maintenance', value: '1 to fix', attention: true },
  { icon: Waves, label: 'Pool chemistry', value: 'Logged 9:14a', attention: false },
  { icon: ShieldCheck, label: 'Safety check-in', value: '142 / 142', attention: false },
  { icon: UtensilsCrossed, label: 'Dinner service', value: 'On track', attention: false },
];

function HeroCard() {
  return (
    <div className="relative hidden lg:flex items-center justify-center w-full h-full">
      {/* soft glow so the white card lifts off the photo */}
      <div className="absolute w-72 h-72 rounded-full bg-sage/25 blur-3xl" />
      <div className="relative w-[340px] bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <p className="text-[15px] font-semibold text-forest">Today at Pinecrest</p>
            <p className="text-[11px] text-ink-faint mt-0.5">Day 12 of 54 · 142 campers on site</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-muted-bg text-green-muted-text text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-muted-text" /> On track
          </span>
        </div>
        {/* module status rows */}
        <div className="px-2.5 pb-1.5">
          {SNAPSHOT.map((r) => (
            <div key={r.label} className="flex items-center gap-3 px-2.5 py-2 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-cream flex items-center justify-center flex-shrink-0">
                <r.icon className="w-4 h-4 text-ink" />
              </div>
              <span className="flex-1 text-[13px] font-medium text-forest">{r.label}</span>
              {r.attention ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-text">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber" /> {r.value}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-green-muted-text">
                  <Check className="w-3.5 h-3.5" /> {r.value}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* footer */}
        <div className="px-5 py-2.5 bg-cream/60 border-t border-cream-dark flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse" /> Updated just now
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────────

function Hero({ onSignIn, onBookDemo }: { onSignIn: () => void; onBookDemo: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section className="relative min-h-[100svh] flex items-center overflow-hidden">
      {/* Photo background */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url(/hero-camp.jpg)' }} />
      {/* Forest gradients – hold the left half dark for text legibility, clear on the right */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(100deg, rgba(20,34,20,0.95) 0%, rgba(20,34,20,0.82) 32%, rgba(20,34,20,0.38) 60%, rgba(20,34,20,0) 86%)' }} />
      <div className="absolute inset-0 bg-gradient-to-t from-forest/60 via-transparent to-forest/25" />

      <div className="relative w-full max-w-6xl mx-auto px-5 sm:px-8 pt-28 pb-20 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
        {/* Left: copy */}
        <div className={`transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <h1 className="font-display text-cream font-semibold leading-[1.04] tracking-[-0.02em] text-[clamp(2.6rem,6vw,4.4rem)]">
            Your camp operations command center
          </h1>
          <p className="mt-6 text-[17px] sm:text-[18px] leading-relaxed text-cream/80 max-w-[34rem]">
            From maintenance requests to pool chemistry, food service to safety compliance – CampCommand keeps your entire operation and staff on the same page.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button onClick={onBookDemo} className="inline-flex items-center gap-2 px-5 py-3 rounded-btn bg-sage text-forest text-[15px] font-semibold hover:bg-sage-light transition-colors shadow-lg shadow-forest/20">
              Book a demo <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={onSignIn} className="inline-flex items-center gap-2 px-5 py-3 rounded-btn bg-white/10 backdrop-blur border border-white/25 text-cream text-[15px] font-semibold hover:bg-white/15 transition-colors">
              Sign in
            </button>
          </div>
          <button onClick={() => scrollToId('how-it-works')} className="mt-10 inline-flex items-center gap-2 text-cream/60 hover:text-cream text-[13px] font-medium transition-colors">
            See how it works <ChevronDown className="w-4 h-4 animate-bounce" />
          </button>
        </div>

        {/* Right: single operations-snapshot card */}
        <div className={`h-[440px] transition-all duration-1000 delay-200 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <HeroCard />
        </div>
      </div>
    </section>
  );
}

// ─── How it works ───────────────────────────────────────────────────────────────

const STEPS = [
  { icon: Users, n: '01', title: 'Set up your camp', body: 'Add your team, cabins, and the modules you use. Roles and permissions take minutes – everyone sees exactly what they should.' },
  { icon: CheckSquare, n: '02', title: 'Run the day', body: 'Staff log issues, pool readings, safety checks, and meals from any device. Everything updates in real time across your whole team.' },
  { icon: Eye, n: '03', title: 'Stay ahead', body: 'See the whole camp at a glance, keep compliance airtight, and never let a task slip through the cracks again.' },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-cream py-24 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-sage mb-3">How it works</p>
          <h2 className="font-display text-forest font-semibold text-[clamp(2rem,4vw,2.9rem)] leading-[1.1] tracking-[-0.01em]">
            Everything camp runs on, in one calm place
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-white rounded-card border border-black/5 p-7 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="w-11 h-11 rounded-xl bg-sage-pale flex items-center justify-center">
                  <s.icon className="w-5 h-5 text-forest" />
                </div>
                <span className="font-mono text-[13px] text-forest/25 font-semibold">{s.n}</span>
              </div>
              <h3 className="text-[18px] font-semibold text-forest mb-2">{s.title}</h3>
              <p className="text-[14px] leading-relaxed text-ink-soft">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Feature spotlights (built UI mockups) ───────────────────────────────────────

const MODULES = [
  { icon: Wrench, title: 'Issues & Repairs', desc: 'Log, assign, and track maintenance requests from any device, with photos and status.' },
  { icon: ShieldCheck, title: 'Safety & Compliance', desc: 'Run safety checks, drills, and headcounts with an airtight, timestamped record.' },
  { icon: Waves, title: 'Pool Management', desc: 'Log pool chemistry, scan test strips with AI, and keep every reading on record.' },
  { icon: Building2, title: 'Building Systems', desc: 'Track electrical, plumbing, and shutoffs room by room, ready before you need them.' },
  { icon: UtensilsCrossed, title: 'Commissary', desc: 'Plan menus, manage inventory, and order food for sessions and retreats with less waste.' },
  { icon: CalendarRange, title: 'Retreats', desc: 'Rent your facility to outside groups with a self-serve guest portal and full oversight.' },
];

/* Realistic iPhone frame: thin uniform bezel, Dynamic Island, iOS status bar */
function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[252px] rounded-[2.8rem] bg-[#1b1e1a] p-[7px] shadow-2xl ring-1 ring-black/30">
      <div className="relative rounded-[2.3rem] bg-cream overflow-hidden min-h-[520px]">
        {/* status bar */}
        <div className="flex items-center justify-between px-6 pt-3 pb-1">
          <span className="text-[11px] font-semibold text-forest tabular-nums">9:41</span>
          <span className="flex items-center gap-1.5 text-forest">
            <Wifi className="w-3.5 h-3.5" />
            <span className="relative inline-block w-[18px] h-[9px] rounded-[2px] border border-forest/70">
              <span className="absolute left-[1px] top-[1px] bottom-[1px] right-[4px] rounded-[1px] bg-forest/80" />
              <span className="absolute -right-[2.5px] top-1/2 -translate-y-1/2 w-[2px] h-[4px] rounded-r-sm bg-forest/60" />
            </span>
          </span>
        </div>
        {/* Dynamic Island */}
        <div className="absolute top-[9px] left-1/2 -translate-x-1/2 h-[22px] w-[74px] rounded-full bg-black" />
        {children}
      </div>
    </div>
  );
}

/* 1, Mobile field logging */
function MobileMock() {
  const rows = [
    { icon: Wrench, t: 'Cabin 4 · leaky faucet', s: 'Maintenance · 2m ago', c: 'text-amber-text' },
    { icon: Waves, t: 'Waterfront · Cl 2.1 ppm', s: 'Pool · logged 14m ago', c: 'text-green-muted-text' },
    { icon: ShieldCheck, t: 'Fire drill complete', s: 'Safety · done', c: 'text-green-muted-text' },
  ];
  return (
    <Phone>
      <div className="px-3.5 pt-3.5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-semibold text-forest">Pinecrest</span>
          <span className="w-6 h-6 rounded-full bg-sage/30" />
        </div>
        <div className="w-full rounded-xl bg-sage text-forest text-[12px] font-semibold py-2.5 text-center mb-3">+ Log an issue</div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-2">Just logged</p>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.t} className="flex items-center gap-2.5 bg-white rounded-lg p-2 border border-black/5">
              <div className="w-7 h-7 rounded-md bg-cream flex items-center justify-center flex-shrink-0"><r.icon className="w-3.5 h-3.5 text-ink" /></div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-forest leading-tight truncate">{r.t}</p>
                <p className={`text-[10px] ${r.c}`}>{r.s}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

/* 2, AI pool test-strip scan */
function PoolScanMock() {
  const reads = [
    { k: 'pH', v: '7.4', s: 'Ideal' },
    { k: 'Free chlorine', v: '2.1 ppm', s: 'In range' },
    { k: 'Alkalinity', v: '90 ppm', s: 'In range' },
  ];
  return (
    <div className="mx-auto w-[300px] bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
      <div className="relative bg-forest px-5 py-7">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-medium text-cream/70 inline-flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Scan test strip</span>
          <span className="text-[10px] font-mono text-sage-light">reading…</span>
        </div>
        <div className="mx-auto w-[58px] rounded-md bg-white p-1 shadow-lg rotate-[-4deg]">
          {['#e3a0b4', '#e6cf7e', '#82bfa6', '#cf9a63'].map((c) => (
            <div key={c} className="h-5 rounded-sm mb-1 last:mb-0" style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="absolute inset-x-6 top-[52%] h-[2px] bg-sage-light rounded" style={{ boxShadow: '0 0 10px 1px rgba(168,201,159,0.85)' }} />
      </div>
      <div className="px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-2.5">Read automatically</p>
        {reads.map((r) => (
          <div key={r.k} className="flex items-center justify-between py-1.5 text-[12.5px]">
            <span className="text-ink-soft">{r.k}</span>
            <span className="inline-flex items-center gap-2">
              <span className="font-mono font-semibold text-forest">{r.v}</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-muted-text"><Check className="w-3 h-3" />{r.s}</span>
            </span>
          </div>
        ))}
        <div className="mt-2 pt-2.5 border-t border-cream-dark flex items-center justify-between text-[11px]">
          <span className="text-ink-faint">Confidence 94%</span>
          <span className="text-green-muted-text font-medium inline-flex items-center gap-1"><Check className="w-3 h-3" /> Logged to Pool</span>
        </div>
      </div>
    </div>
  );
}

/* 3, Retreats guest portal */
function PortalMock() {
  const rows = [
    { t: 'Sign rental agreement', done: true },
    { t: 'Upload certificate of insurance', done: true },
    { t: 'Assign housing', done: false, note: 'due Aug 1' },
    { t: 'Review menu', done: false },
  ];
  return (
    <div className="mx-auto w-[320px] bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
      <div className="bg-forest px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sage-light">Guest portal</p>
        <p className="text-[15px] font-semibold text-cream mt-0.5">Welcome, Maplewood Retreat</p>
        <p className="text-[11px] text-cream/60 mt-0.5">Aug 12–15 · 48 guests</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-2">Your checklist</p>
        {rows.map((r) => (
          <div key={r.t} className="flex items-center gap-2.5 py-1.5">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${r.done ? 'bg-sage text-white' : 'border border-border'}`}>{r.done && <Check className="w-2.5 h-2.5" />}</span>
            <span className={`flex-1 text-[12.5px] ${r.done ? 'text-ink-faint line-through' : 'text-forest'}`}>{r.t}</span>
            {r.note && <span className="text-[10px] text-amber-text font-medium">{r.note}</span>}
          </div>
        ))}
        <div className="mt-2 pt-2.5 border-t border-cream-dark flex items-center justify-between text-[12px]">
          <span className="text-ink-soft">Balance due</span>
          <span className="font-mono font-semibold text-forest">$2,400</span>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Smartphone, eyebrow: 'Mobile', title: 'Runs in your pocket, all over the property', clip: true,
    body: 'Your team logs issues, pool readings, and safety checks right where they happen from their phone. It syncs the second they hit save, so the office always sees the field in real time.',
    points: ['Log from anywhere on the property', 'Photos attach in a tap', 'No radios, no “tell me later”'], Visual: MobileMock },
  { icon: Camera, eyebrow: 'AI pool scan', title: 'Snap the test strip. We read the chemistry.', clip: false,
    body: 'Point your phone at a pool test strip and CampCommand reads pH, chlorine, and alkalinity for you, logged, timestamped, and flagged the moment anything drifts out of range.',
    points: ['No squinting at color charts', 'Auto-logged to the pool record', 'Out-of-range alerts before it’s a problem'], Visual: PoolScanMock },
  { icon: CalendarRange, eyebrow: 'Retreats', title: 'Turn your off-season into revenue', clip: false,
    body: 'Rent your facility to outside groups and let them self-serve through a guest portal (contracts, housing, menus, and payments) while your team keeps full oversight.',
    points: ['A private booking portal per group', 'Contracts and COIs collected for you', 'Housing and menus without the email chain'], Visual: PortalMock },
];

function FeatureSpotlights() {
  return (
    <section className="bg-white py-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="max-w-2xl mb-16">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-sage mb-3">A closer look</p>
          <h2 className="font-display text-forest font-semibold text-[clamp(2rem,4vw,2.9rem)] leading-[1.1] tracking-[-0.01em]">
            See what your camp looks like on CampCommand
          </h2>
        </div>

        <div className="space-y-20 lg:space-y-28">
          {FEATURES.map((f, i) => {
            const flip = i % 2 === 1;
            return (
              <div key={f.title} className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <div className={flip ? 'lg:order-2' : ''}>
                  <div className="inline-flex items-center gap-2 text-sage mb-4">
                    <f.icon className="w-4 h-4" />
                    <span className="text-[12px] font-semibold uppercase tracking-[0.15em]">{f.eyebrow}</span>
                  </div>
                  <h3 className="font-display text-forest font-semibold text-[clamp(1.6rem,3vw,2.1rem)] leading-[1.15] tracking-[-0.01em]">{f.title}</h3>
                  <p className="mt-4 text-[15.5px] leading-relaxed text-ink-soft max-w-md">{f.body}</p>
                  <ul className="mt-5 space-y-2.5">
                    {f.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-[14px] text-forest/75">
                        <span className="w-5 h-5 rounded-full bg-sage-pale flex items-center justify-center flex-shrink-0 mt-0.5"><Check className="w-3 h-3 text-forest" /></span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={flip ? 'lg:order-1' : ''}>
                  {f.clip ? (
                    // Phone: a fixed-height panel that crops the tall device flush at the bottom.
                    <div className="relative h-[440px] overflow-hidden rounded-3xl bg-gradient-to-br from-cream to-sage-pale/50 flex justify-center items-start pt-12">
                      <f.Visual />
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute inset-0 -m-4 rounded-3xl bg-gradient-to-br from-cream to-sage-pale/50" />
                      <div className="relative py-8"><f.Visual /></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* breadth strip */}
        <ModuleBreadth />
      </div>
    </section>
  );
}

// The six "also covers" tiles. Each reveals a one-line description on hover (desktop) and
// on tap (touch), a lightweight, modern reveal rather than a separate tooltip layer.
function ModuleBreadth() {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="mt-24 pt-14 border-t border-black/5 text-center">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-faint mb-7">One login also covers</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 max-w-4xl mx-auto items-start">
        {MODULES.map((m) => {
          const open = active === m.title;
          return (
            <button
              key={m.title}
              type="button"
              onMouseEnter={() => setActive(m.title)}
              onMouseLeave={() => setActive((cur) => (cur === m.title ? null : cur))}
              onFocus={() => setActive(m.title)}
              onBlur={() => setActive((cur) => (cur === m.title ? null : cur))}
              onClick={() => setActive((cur) => (cur === m.title ? null : m.title))}
              aria-expanded={open}
              className={`flex flex-col items-center gap-2 rounded-card border px-3 py-5 text-center transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
                open ? 'border-sage bg-sage-pale/25' : 'border-border hover:border-sage'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-cream flex items-center justify-center"><m.icon className="w-5 h-5 text-forest" /></div>
              {/* Reserve two lines so a wrapping title (e.g. "Safety & Compliance") doesn't make its card taller than the rest. */}
              <span className="text-[12.5px] font-medium text-forest leading-tight min-h-[2.5em] flex items-center justify-center text-center">{m.title}</span>
              <span
                className={`overflow-hidden text-[11.5px] leading-snug text-ink-soft transition-all duration-300 ${
                  open ? 'max-h-24 opacity-100 mt-0.5' : 'max-h-0 opacity-0'
                }`}
              >
                {m.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Closing CTA ────────────────────────────────────────────────────────────────

function ClosingCta({ onSignIn, onBookDemo }: { onSignIn: () => void; onBookDemo: () => void }) {
  return (
    <section className="bg-forest py-24">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
        <h2 className="font-display text-cream font-semibold text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.1] tracking-[-0.01em]">
          Run camp with less chaos
        </h2>
        <p className="mt-5 text-[17px] text-cream/70 leading-relaxed max-w-xl mx-auto">
          See CampCommand on your own camp's setup. We'll walk you through it and get you started before the season begins.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button onClick={onBookDemo} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-btn bg-sage text-forest text-[15px] font-semibold hover:bg-sage-light transition-colors">
            Book a demo <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={onSignIn} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-btn bg-white/10 border border-white/25 text-cream text-[15px] font-semibold hover:bg-white/15 transition-colors">
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────────────

function Footer({ onSignIn, onBookDemo }: { onSignIn: () => void; onBookDemo: () => void }) {
  return (
    <footer className="bg-forest border-t border-white/10 py-12">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <CampCommandMark size={32} decorative />
          <span className="text-[15px] font-semibold text-cream">CampCommand</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-cream/50">
          <button onClick={() => scrollToId('how-it-works')} className="hover:text-cream/80 transition-colors">How it works</button>
          <button onClick={onBookDemo} className="hover:text-cream/80 transition-colors">Book a demo</button>
          <button onClick={onSignIn} className="hover:text-cream/80 transition-colors">Sign in</button>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-cream/80 transition-colors">Privacy</a>
          <a href="/security" target="_blank" rel="noopener noreferrer" className="hover:text-cream/80 transition-colors">Security</a>
        </nav>
      </div>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 mt-8 pt-6 border-t border-white/10">
        <p className="text-[12px] text-cream/35">© 2026 CampCommand. Camp operations, simplified.</p>
      </div>
    </footer>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export function LandingPage() {
  const navigate = useNavigate();
  const onSignIn = () => navigate('/login');
  // Open the booking page (Google Appointment Schedule) in a new tab, Google refuses to be
  // embedded in an iframe. Falls back to email if no scheduling URL is configured.
  const onBookDemo = () => {
    if (DEMO_SCHEDULING_URL) window.open(DEMO_SCHEDULING_URL, '_blank', 'noopener,noreferrer');
    else window.location.href = DEMO_MAILTO;
  };

  return (
    <div className="bg-cream w-full">
      <Nav onSignIn={onSignIn} onBookDemo={onBookDemo} />
      <Hero onSignIn={onSignIn} onBookDemo={onBookDemo} />
      <HowItWorks />
      <FeatureSpotlights />
      <ClosingCta onSignIn={onSignIn} onBookDemo={onBookDemo} />
      <Footer onSignIn={onSignIn} onBookDemo={onBookDemo} />
    </div>
  );
}
