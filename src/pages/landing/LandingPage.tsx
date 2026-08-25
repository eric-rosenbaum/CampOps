import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './landing.css';

/**
 * The public landing page.
 *
 * Markup and styling are a direct port of docs/design/landing-mockup.html, which is where the
 * design is worked on. Keeping the two in the same shape means an edit there is a paste here
 * rather than a re-derivation, and the CSS is scoped under `.lp` so the mockup's bare-element
 * rules cannot escape into the app.
 */

const DEMO_MAILTO =
  'mailto:eric@campcommand.app?subject=CampCommand%20demo%20request&body=Hi%20%E2%80%94%20I%27d%20like%20to%20see%20a%20demo%20of%20CampCommand%20for%20our%20camp.';

/** A Google Appointment Schedule link. Falls back to email if ever cleared. */
const DEMO_SCHEDULING_URL: string = 'https://calendar.app.google/Cwfexway6Wswhf6p9';

type TabId = 'fac' | 'pool' | 'com' | 'ret' | 'saf';

// ─── The settle ───────────────────────────────────────────────────────────────
// Eight artifacts, two per lane. Everything is laid out in pixels rather than percentages so
// nothing can overlap at any width, cards leave one at a time rather than all at once, and
// each card's starting outline stays behind as a ghost so the path it took is still readable
// after it lands.

const LANES = ['Facilities', 'Pool & waterfront', 'Commissary', 'Retreats'];
const CLS = ['fac', 'pool', 'com', 'ret'];
const FRAGS: [string, string, number][] = [
  ['Text', '"heater out in bathhouse 2"', 0],
  ['Sticky note', 'Cabin 12 — order glass?', 0],
  ['Spreadsheet', 'Cl 2.4 · pH 7.3 · 4:37pm', 1],
  ['Clipboard', 'AM temp log, not filed', 1],
  ['Voicemail', '"walk-in is at 46 degrees"', 2],
  ['Text', '"need 2 more cases of buns"', 2],
  ['Whiteboard', 'Retreat Fri · 50pax · COI??', 3],
  ['Email', 'INV-2603 still unpaid', 3],
];

/** Deterministic scatter across the left half, rotated enough to read as a pile. */
const SPOTS: [number, number, number][] = [
  [0.04, 0.06, -9], [0.40, 0.02, 7], [0.10, 0.28, 5], [0.46, 0.26, -6],
  [0.02, 0.50, 8], [0.38, 0.52, -4], [0.12, 0.74, -7], [0.44, 0.76, 6],
];

const CARD_W = 150;
const CARD_H = 46;

function useSettle(stageRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const trails = stage.querySelector<SVGSVGElement>('.trails');
    const divider = stage.querySelector<HTMLDivElement>('.divider');
    const tagB = stage.querySelector<HTMLDivElement>('.tag-before');
    const tagA = stage.querySelector<HTMLDivElement>('.tag-after');
    if (!trails || !divider || !tagB || !tagA) return;

    let made: HTMLElement[] = [];
    let timers: ReturnType<typeof setTimeout>[] = [];

    function layout() {
      const W = stage!.clientWidth;
      const H = stage!.clientHeight;
      const narrow = W < 560;
      // Left half is "before", right half is the board. On narrow widths the board takes more
      // of the frame because the cards cannot shrink below legibility.
      const splitX = narrow ? W * 0.30 : W * 0.42;
      const boardX = splitX + (narrow ? 14 : 26);
      return { W, H, splitX, boardX, boardW: W - boardX - 16, laneGap: (H - 54) / LANES.length };
    }

    function clearAll() {
      timers.forEach(clearTimeout);
      timers = [];
      made.forEach((n) => n.remove());
      made = [];
      trails!.innerHTML = '';
    }

    function run() {
      clearAll();
      const L = layout();
      divider!.style.left = `${L.splitX}px`;
      stage!.classList.remove('settled', 'ghosted', 'done');
      tagA!.style.opacity = '0';
      tagB!.style.opacity = '1';

      LANES.forEach((name, i) => {
        const top = 40 + i * L.laneGap;
        const rule = document.createElement('div');
        rule.className = 'lanerule';
        rule.style.left = `${L.boardX}px`;
        rule.style.width = `${L.boardW}px`;
        rule.style.top = `${top + CARD_H + 12}px`;
        stage!.appendChild(rule);
        made.push(rule);

        const lab = document.createElement('div');
        lab.className = 'lanelabel';
        lab.textContent = name;
        lab.style.left = `${L.boardX}px`;
        lab.style.top = `${top - 15}px`;
        lab.dataset.lane = String(i);
        stage!.appendChild(lab);
        made.push(lab);
      });

      const cards: HTMLElement[] = [];
      FRAGS.forEach(([kind, text, lane], i) => {
        const [fx, fy, rot] = SPOTS[i];
        const x = Math.max(8, fx * (L.splitX - 40));
        // Clears the "Emails, spreadsheets, and binders" label, which wraps to two lines and
        // was getting buried under the top row of the pile.
        const y = 50 + fy * (L.H - CARD_H - 76);

        const g = document.createElement('div');
        g.className = 'ghost';
        g.style.cssText = `left:${x}px;top:${y}px;width:${CARD_W}px;height:${CARD_H}px;transform:rotate(${rot}deg)`;
        stage!.appendChild(g);
        made.push(g);

        const d = document.createElement('div');
        d.className = `frag ${CLS[lane]}`;
        d.innerHTML = `<span class="k">${kind}</span>${text}`;
        d.style.cssText = `width:${CARD_W}px;left:${x}px;top:${y}px;transform:rotate(${rot}deg)`;
        d.dataset.lane = String(lane);
        d.dataset.gx = String(x + CARD_W / 2);
        d.dataset.gy = String(y + CARD_H / 2);
        stage!.appendChild(d);
        made.push(d);
        cards.push(d);
      });

      const per = [0, 0, 0, 0];
      const targets = cards.map((d) => {
        const lane = Number(d.dataset.lane);
        const n = per[lane]++;
        const colW = (L.boardW - 12) / 2;
        return { x: L.boardX + n * (colW + 12), y: 40 + lane * L.laneGap, w: Math.min(CARD_W, colW) };
      });

      const place = (i: number) => {
        const d = cards[i];
        const t = targets[i];
        d.style.width = `${t.w}px`;
        d.style.left = `${t.x}px`;
        d.style.top = `${t.y}px`;
        d.style.transform = 'rotate(0deg)';
        d.dataset.tx = String(t.x + t.w / 2);
        d.dataset.ty = String(t.y + CARD_H / 2);
      };

      const drawTrail = (d: HTMLElement) => {
        const x1 = Number(d.dataset.gx);
        const y1 = Number(d.dataset.gy);
        const x2 = Number(d.dataset.tx);
        const y2 = Number(d.dataset.ty);
        const mx = (x1 + x2) / 2;
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', 'rgba(154,169,143,.32)');
        p.setAttribute('stroke-width', '1');
        p.setAttribute('stroke-dasharray', '3 4');
        trails!.appendChild(p);
      };

      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        stage!.classList.add('ghosted', 'settled', 'done');
        cards.forEach((_, i) => place(i));
        cards.forEach(drawTrail);
        tagA!.style.opacity = '1';
        return;
      }

      // Long enough to register the mess, not long enough to wonder if it is broken. The
      // travel itself stays slow: it was the waiting that dragged, not the movement.
      timers.push(setTimeout(() => {
        stage!.classList.add('ghosted', 'settled');
        tagA!.style.opacity = '1';
        cards.forEach((_, i) => timers.push(setTimeout(() => place(i), i * 260)));
        timers.push(setTimeout(() => {
          cards.forEach(drawTrail);
          stage!.classList.add('done');
          tagB!.style.opacity = '.55';
        }, cards.length * 260 + 1500));
      }, 650));
    }

    run();

    // Hovering a lane label lifts that module and dims the rest.
    const over = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!t.classList?.contains('lanelabel')) return;
      made.forEach((d) => {
        if (d.classList.contains('frag')) d.style.opacity = d.dataset.lane === t.dataset.lane ? '1' : '.2';
      });
    };
    const out = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!t.classList?.contains('lanelabel')) return;
      made.forEach((d) => { if (d.classList.contains('frag')) d.style.opacity = '1'; });
    };
    stage.addEventListener('mouseover', over);
    stage.addEventListener('mouseout', out);

    let rt: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(run, 250); };
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(rt);
      window.removeEventListener('resize', onResize);
      stage.removeEventListener('mouseover', over);
      stage.removeEventListener('mouseout', out);
      clearAll();
    };
  }, [stageRef]);
}

/** Fade sections in as they arrive, once each. */
function useReveal(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    root.querySelectorAll('.rv').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

export function LandingPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabId>('fac');

  useSettle(stageRef);
  useReveal(rootRef);

  const onSignIn = () => navigate('/login');
  // Opens the booking page in a new tab: Google refuses to be embedded in an iframe.
  const onBookDemo = () => {
    if (DEMO_SCHEDULING_URL) window.open(DEMO_SCHEDULING_URL, '_blank', 'noopener,noreferrer');
    else window.location.href = DEMO_MAILTO;
  };

  const panelClass = (id: TabId) => (tab === id ? 'panel on' : 'panel');

  return (
    <div className="lp w-full min-h-screen" ref={rootRef}>
      {/* ═══ NAV ═══ */}
      <nav>
        <div className="inner">
          <div className="brand">
            <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
              <circle cx="32" cy="32" r="31" fill="#F6F1E4" />
              <circle cx="32" cy="32" r="27" fill="none" stroke="#1D3A2E" strokeWidth="1.4" />
              <path d="M 28.863 17.965A7 7 0 1 0 28.863 28.035L 26.779 25.877A4 4 0 1 1 26.779 20.123Z" fill="#1D3A2E" />
              <path d="M 44.863 17.965A7 7 0 1 0 44.863 28.035L 42.779 25.877A4 4 0 1 1 42.779 20.123Z" fill="#1D3A2E" />
              <path d="M32 32C35 37 38 40 38 44A6 6 0 0 1 26 44C26 40.8 27.8 38.6 29 36C29.8 38.6 30.7 40 31.6 40.7C31.3 37.6 31.5 34.6 32 32Z" fill="#1D3A2E" />
              <path d="M18 51 46 45.5" stroke="#1D3A2E" strokeWidth="3" />
              <path d="M18 45.5 46 51" stroke="#1D3A2E" strokeWidth="3" />
            </svg>
            CampCommand
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-ghost" onClick={onSignIn}>Sign in</button>
            <button className="btn btn-primary" onClick={onBookDemo}>Book a demo</button>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="hero">
        <svg className="contours" viewBox="0 0 1200 620" preserveAspectRatio="none" aria-hidden="true">
          <g fill="none" stroke="#EFE7D4" strokeWidth="1">
            <path d="M0 90 C 220 40, 420 130, 640 80 S 1020 20, 1200 70" />
            <path d="M0 180 C 240 130, 440 220, 660 170 S 1030 110, 1200 160" />
            <path d="M0 270 C 200 220, 460 310, 680 260 S 1040 200, 1200 250" />
            <path d="M0 360 C 260 310, 430 400, 650 350 S 1050 290, 1200 340" />
            <path d="M0 450 C 210 400, 450 490, 670 440 S 1020 380, 1200 430" />
            <path d="M0 540 C 240 490, 420 580, 640 530 S 1040 470, 1200 520" />
          </g>
        </svg>

        <div className="inner">
          <div>
            <div className="wordmark">
              <svg viewBox="0 0 64 64" width="38" height="38" aria-hidden="true">
                  <circle cx="32" cy="32" r="31" fill="#F6F1E4"/>
                  <circle cx="32" cy="32" r="27" fill="none" stroke="#1D3A2E" strokeWidth="1.4"/>
                  <path d="M 28.863 17.965A7 7 0 1 0 28.863 28.035L 26.779 25.877A4 4 0 1 1 26.779 20.123Z" fill="#1D3A2E"/>
                  <path d="M 44.863 17.965A7 7 0 1 0 44.863 28.035L 42.779 25.877A4 4 0 1 1 42.779 20.123Z" fill="#1D3A2E"/>
                  <path d="M32 32C35 37 38 40 38 44A6 6 0 0 1 26 44C26 40.8 27.8 38.6 29 36C29.8 38.6 30.7 40 31.6 40.7C31.3 37.6 31.5 34.6 32 32Z" fill="#1D3A2E"/>
                  <path d="M18 51 46 45.5" stroke="#1D3A2E" strokeWidth="3"/>
                  <path d="M18 45.5 46 51" stroke="#1D3A2E" strokeWidth="3"/>
                </svg>
              CampCommand
            </div>

            <h1>Your camp operations command center</h1>

            <p className="mission">
              Our mission is to streamline the chaos of camp operations and <b>eliminate the stress
              and wasted money that come from scattered systems</b>. We do it by providing systematic
              workflows and resources that keep your <b>entire operations team on the same page</b>
              {' '}across facilities, pool and waterfront, commissary, and retreats.
            </p>

            <div className="cta">
              <button className="btn btn-primary" onClick={onBookDemo}>Book a demo →</button>
            </div>
          </div>

          <div>
            <div className="stage" ref={stageRef}>
              <svg className="trails" aria-hidden="true" />
              <div className="divider" />
              <div className="tag tag-before" style={{ left: '16px', top: '14px' }}>Emails, spreadsheets, and binders</div>
              <div className="tag tag-after" style={{ right: '16px', top: '14px', opacity: 0 }}>One place</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ OUR SERVICES ═══ */}
      <section className="modules" id="services">
        <div className="wrap">
          <div className="sechead rv">
            <p className="eyebrow">Our services</p>
            <h2>All operational responsibilities in one command center.</h2>
            <p className="lede">
              Each module is built for the person who actually does that job, and each one saves to
              the same central place.
            </p>
          </div>

          <div className="tabs rv" role="tablist">
            <button className="tab" role="tab" aria-selected={tab === 'fac'} onClick={() => setTab('fac')}>
              <span className="dot" style={{ background: 'var(--flame)' }} />Facilities</button>
            <button className="tab" role="tab" aria-selected={tab === 'pool'} onClick={() => setTab('pool')}>
              <span className="dot" style={{ background: 'var(--water)' }} />Pool &amp; waterfront</button>
            <button className="tab" role="tab" aria-selected={tab === 'com'} onClick={() => setTab('com')}>
              <span className="dot" style={{ background: 'var(--amber)' }} />Commissary</button>
            <button className="tab" role="tab" aria-selected={tab === 'ret'} onClick={() => setTab('ret')}>
              <span className="dot" style={{ background: 'var(--sage)' }} />Retreats</button>
            <button className="tab" role="tab" aria-selected={tab === 'saf'} onClick={() => setTab('saf')}>
              <span className="dot" style={{ background: '#7B6BA8' }} />Safety &amp; compliance</button>
          </div>

          {/* ── FACILITIES ── */}
              <div className={panelClass('fac')} id="p-fac">
                <div className="panel-head">
                  <h3>Logged from a phone, handled from the office</h3>
                  <p className="blurb">
                    A counsellor photographs a broken window where they're standing. It lands on the
                    director's board with a location and a priority, gets a name against it, and stays
                    there until it's actually fixed.
                  </p>
                  <div className="subs">
                    <span className="sub-pill">Issues &amp; repairs</span>
                    <span className="sub-pill">Pre/post camp</span>
                    <span className="sub-pill">Assets &amp; vehicles</span>
                    <span className="sub-pill">Building systems</span>
                  </div>
                </div>

                <div className="flow">
                  <div className="phone">
                    <span className="btn-vol v1"></span><span className="btn-vol v2"></span><span className="btn-vol v3"></span>
                    <span className="btn-pwr"></span>
                    <div className="frame"><div className="screen">
                    <div className="island"></div><div className="home"></div>
                    <div className="pscreen">
                      <div className="pbar"><span>9:26</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span className="sig"><i style={{ height: "3px" }}></i><i style={{ height: "5px" }}></i><i style={{ height: "6.5px" }}></i><i style={{ height: "8px" }}></i></span>
                          <svg width="11" height="9" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true"><path d="M8 11.2 5.9 8.9a3 3 0 0 1 4.2 0zM3.6 6.6 2 4.9a8.6 8.6 0 0 1 12 0l-1.6 1.7a6.3 6.3 0 0 0-8.8 0z"/></svg>
                          <span className="batt"><i></i></span>
                        </span></div>
                      <div className="ptitle">Log an issue</div>
                      <div className="photo">
                        {/* The photo the counsellor just took. Drawn rather than loaded so the page stays
                             one self-contained file with nothing to fetch. */}
                        <svg viewBox="0 0 200 124" role="img" aria-label="Photo of a cracked cabin window">
                          <defs>
                            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0" stopColor="#9dc4d8"/><stop offset="1" stopColor="#cfe0e6"/>
                            </linearGradient>
                            <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1">
                              <stop offset="0" stopColor="#fff" stopOpacity=".55"/>
                              <stop offset="1" stopColor="#fff" stopOpacity="0"/>
                            </linearGradient>
                            <linearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0" stopColor="#000" stopOpacity=".16"/>
                              <stop offset=".35" stopColor="#000" stopOpacity="0"/>
                              <stop offset="1" stopColor="#000" stopOpacity=".22"/>
                            </linearGradient>
                          </defs>
                          <rect width="200" height="124" fill="#8a6a4a"/>
                          <g fill="#7d5f42">
                            <rect y="8" width="200" height="2"/><rect y="26" width="200" height="2"/>
                            <rect y="44" width="200" height="2"/><rect y="62" width="200" height="2"/>
                            <rect y="80" width="200" height="2"/><rect y="98" width="200" height="2"/>
                            <rect y="116" width="200" height="2"/>
                          </g>
                          <g opacity=".28" fill="#5e462f">
                            <rect x="16" y="0" width="1.5" height="124"/><rect x="132" y="0" width="1.5" height="124"/>
                          </g>
                          <rect x="44" y="18" width="112" height="88" rx="2" fill="#f2ede1"/>
                          <rect x="49" y="23" width="102" height="78" fill="url(#sky)"/>
                          <path d="M49 78 L74 56 L92 72 L112 44 L151 78 Z" fill="#5E7A61" opacity=".55"/>
                          <rect x="98" y="23" width="4" height="78" fill="#f2ede1"/>
                          <rect x="49" y="59" width="102" height="4" fill="#f2ede1"/>
                          <path d="M49 23 L92 23 L49 62 Z" fill="url(#glare)"/>
                          <g stroke="#fdfdfd" strokeWidth="1.1" fill="none" opacity=".95">
                            <path d="M70 44 L58 27 M70 44 L52 52 M70 44 L64 66 M70 44 L88 34 M70 44 L86 58 M70 44 L74 78"/>
                            <path d="M62 36 L57 44 M76 39 L80 47 M67 55 L60 59"/>
                          </g>
                          <circle cx="70" cy="44" r="2.4" fill="#fff" opacity=".9"/>
                          <rect width="200" height="124" fill="url(#vig)"/>
                        </svg>
                        <span className="stamp">Cabin 12 · 9:26 AM</span>
                      </div>
                      <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--ink)", marginBottom: "5px" }}>
                        Cabin 12 window cracked</div>
                      <div style={{ display: "flex", gap: "4px", marginBottom: "9px" }}>
                        <span className="chip urgent">Urgent</span><span className="chip grey">Cabin 12</span></div>
                      <div style={{ background: "var(--pine)", color: "var(--paper)", borderRadius: "9px", textAlign: "center", padding: "9px", fontSize: "11.5px", fontWeight: "600" }}>Submit</div>
                    </div></div></div>
                  </div>
                  <div className="arrow"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"><path d="M4 12h14M13 6l6 6-6 6"/></svg></div>
                  <div className="ui">
                    <div className="uibar"><span className="t">Issues &amp; Repairs</span><span className="meta">9 open · 3 urgent</span></div>
                    <div className="uibody">
                      <div className="row"><span className="chip urgent">Urgent</span><div className="grow">
                        <div className="title">Cabin 12 window cracked</div>
                        <div className="sub">Cabin 12 · just now · from phone</div></div><span className="av">MT</span></div>
                      <div className="row"><span className="chip urgent">Urgent</span><div className="grow">
                        <div className="title">Kitchen breakers tripping at dinner</div>
                        <div className="sub">Kitchen · yesterday</div></div><span className="av">S</span></div>
                      <div className="row"><span className="chip high">High</span><div className="grow">
                        <div className="title">Swim dock ladder rung is loose</div>
                        <div className="sub">Waterfront · yesterday</div></div><span className="av">PS</span></div>
                      <div className="row"><span className="chip grey">Unassigned</span><div className="grow">
                        <div className="title">Replace broken window in exam room</div>
                        <div className="sub">Health Center · Aug 22</div></div></div>
                      <div className="callout save">Assigned to Marcus · he sees it on his phone now</div>
                    </div>
                  </div>
                </div>

                  <ul className="caps">
                    <li><span className="tick">✓</span><span>Log with a photo in under fifteen seconds, from anywhere on the property</span></li>
                    <li><span className="tick">✓</span><span>Assign to a person, watch it move without asking</span></li>
                    <li><span className="tick">✓</span><span>Opening and closing checklists that don't live on a clipboard</span></li>
                    <li><span className="tick">✓</span><span>Vehicles, equipment, panels and shutoffs, room by room</span></li>
                  </ul>
              </div>

              {/* ── POOL ── */}
              <div className={panelClass('pool')} id="p-pool">
                <div className="panel-head">
                  <h3>Scan the strip, keep the log</h3>
                  <p className="blurb">
                    Point a phone at a test strip and the reading is captured, checked against your target
                    ranges, and filed. When the health inspector asks for a season of logs, it's a page,
                    not a weekend of reconstruction.
                  </p>
                  <div className="subs">
                    <span className="sub-pill">Chemical log</span>
                    <span className="sub-pill">Equipment</span>
                    <span className="sub-pill">Inspections</span>
                    <span className="sub-pill">Seasonal tasks</span>
                  </div>
                </div>

                <div className="flow">
                  <div className="phone">
                    <span className="btn-vol v1"></span><span className="btn-vol v2"></span><span className="btn-vol v3"></span>
                    <span className="btn-pwr"></span>
                    <div className="frame"><div className="screen">
                    <div className="island"></div><div className="home"></div>
                    <div className="pscreen">
                      <div className="pbar"><span>4:37</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span className="sig"><i style={{ height: "3px" }}></i><i style={{ height: "5px" }}></i><i style={{ height: "6.5px" }}></i><i style={{ height: "8px" }}></i></span>
                          <svg width="11" height="9" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true"><path d="M8 11.2 5.9 8.9a3 3 0 0 1 4.2 0zM3.6 6.6 2 4.9a8.6 8.6 0 0 1 12 0l-1.6 1.7a6.3 6.3 0 0 0-8.8 0z"/></svg>
                          <span className="batt"><i></i></span>
                        </span></div>
                      <div className="ptitle">Scan test strip</div>
                      <div className="scanbox">
                        <div className="striprow">
                          <i style={{ background: "#E8C547" }}></i><i style={{ background: "#C6553C" }}></i>
                          <i style={{ background: "#8FB894" }}></i><i style={{ background: "#6FA8B8" }}></i>
                        </div>
                        <div style={{ fontSize: "9.5px", color: "#3E5A46", fontWeight: "700" }}>Reading detected</div>
                      </div>
                      <div style={{ marginTop: "9px", fontSize: "10.5px", fontFamily: "var(--mono)", color: "var(--ink)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                          <span>Free Cl</span><b>2.4 ppm</b></div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                          <span>pH</span><b>7.3</b></div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                          <span>Alkalinity</span><b>90 ppm</b></div>
                      </div>
                      <div style={{ background: "var(--pine)", color: "var(--paper)", borderRadius: "9px", marginTop: "9px", textAlign: "center", padding: "9px", fontSize: "11.5px", fontWeight: "600" }}>Save reading</div>
                    </div></div></div>
                  </div>
                  <div className="arrow"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"><path d="M4 12h14M13 6l6 6-6 6"/></svg></div>
                  <div className="ui">
                    <div className="uibar"><span className="t">Main Pool · Chemical</span><span className="meta">Open · all clear</span></div>
                    <div className="uibody">
                      <div className="grid2" style={{ marginBottom: "10px" }}>
                        <div className="stat"><span className="pip"></span><div className="lb">Free chlorine</div>
                          <div className="vl">2.4 <span className="un">ppm</span></div><div className="rg">1.0–3.0 ppm</div></div>
                        <div className="stat"><span className="pip"></span><div className="lb">pH</div>
                          <div className="vl">7.3</div><div className="rg">7.2–7.8</div></div>
                        <div className="stat"><span className="pip"></span><div className="lb">Alkalinity</div>
                          <div className="vl">90 <span className="un">ppm</span></div><div className="rg">80–120 ppm</div></div>
                        <div className="stat"><span className="pip"></span><div className="lb">Water temp</div>
                          <div className="vl">78.0 <span className="un">°F</span></div><div className="rg">68–82°F</div></div>
                      </div>
                      <table className="data">
                        <thead><tr><th>Date</th><th>Cl</th><th>pH</th><th>Alk</th><th>By</th></tr></thead>
                        <tbody>
                          <tr><td>Aug 23 · 4:37 PM</td><td>2.4</td><td>7.3</td><td>90</td><td className="n">Priya</td></tr>
                          <tr><td>Aug 23 · 10:37 AM</td><td>3.0</td><td>7.4</td><td>95</td><td className="n">Priya</td></tr>
                          <tr><td>Aug 23 · 4:37 AM</td><td>3.0</td><td>7.2</td><td>100</td><td className="n">Luis</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                  <ul className="caps">
                    <li><span className="tick">✓</span><span>Scan a test strip with the camera, no typing</span></li>
                    <li><span className="tick">✓</span><span>Out-of-range flagged the moment it's entered</span></li>
                    <li><span className="tick">✓</span><span>Every pool and waterfront in one place</span></li>
                    <li><span className="tick">✓</span><span>Exportable log, signed with who took the reading</span></li>
                  </ul>
              </div>

              {/* ── COMMISSARY ── */}
              <div className={panelClass('com')} id="p-com">
                <div className="panel-head">
                  <h3>Plan the menu, and the order writes itself</h3>
                  <p className="blurb">
                    Build the week's menu and the system works backwards to the shopping list, using your
                    real headcount and what's already on the shelf. You order what the menu needs, which
                    is the whole point: less bought twice, less thrown away.
                  </p>
                  <div className="subs">
                    <span className="sub-pill">Menu builder</span>
                    <span className="sub-pill">Suggested ordering</span>
                    <span className="sub-pill">Inventory</span>
                    <span className="sub-pill">Allergy program</span>
                  </div>
                </div>

                <div className="flow" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="ui">
                    <div className="uibar"><span className="t">Menu builder · Week 1</span><span className="meta">300 portions</span></div>
                    <div className="uibody">
                      <div className="menugrid">
                        <div className="hd"></div><div className="hd">Mon</div><div className="hd">Tue</div><div className="hd">Wed</div>
                        <div className="ml">Break</div><div>Pancakes</div><div>Oatmeal bar</div><div>Eggs &amp; toast</div>
                        <div className="ml">Lunch</div><div>Grilled cheese</div><div>Taco bar</div><div>Chicken wraps</div>
                        <div className="ml">Dinner</div><div>Spaghetti</div><div>BBQ chicken</div><div>Stir fry</div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "14px 0 10px", fontSize: "10px", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: "700", color: "var(--sage)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2"><path d="M12 5v14M6 13l6 6 6-6"/></svg>
                        Suggested order
                      </div>

                      <table className="data">
                        <thead><tr><th>Item</th><th>Menu needs</th><th>On hand</th><th>Order</th></tr></thead>
                        <tbody>
                          <tr><td className="n">Wheat bread</td><td>96 loaf</td><td>40 loaf</td>
                              <td style={{ color: "var(--pine)", fontWeight: "700" }}>56 loaf</td></tr>
                          <tr><td className="n">Ground beef</td><td>84 lb</td><td>65 lb</td>
                              <td style={{ color: "var(--pine)", fontWeight: "700" }}>19 lb</td></tr>
                          <tr><td className="n">American cheese</td><td>18 lb</td><td>20 lb</td>
                              <td style={{ color: "var(--sage)" }}>none</td></tr>
                          <tr><td className="n">Romaine</td><td>14 case</td><td>18 case</td>
                              <td style={{ color: "var(--sage)" }}>none</td></tr>
                        </tbody>
                      </table>
                      <div className="callout save">
                        2 items already covered. Not re-ordered, not wasted.
                      </div>
                    </div>
                  </div>
                </div>

                  <ul className="caps">
                    <li><span className="tick">✓</span><span>Menus drive the order list automatically</span></li>
                    <li><span className="tick">✓</span><span>Suggested quantities net of what you already hold</span></li>
                    <li><span className="tick">✓</span><span>Counted in the units your kitchen actually speaks</span></li>
                    <li><span className="tick">✓</span><span>Allergy and dietary needs tracked per camper</span></li>
                  </ul>
              </div>

              {/* ── RETREATS ── */}
              <div className={panelClass('ret')} id="p-ret">
                <div className="panel-head">
                  <h3>Rental groups that run themselves</h3>
                  <p className="blurb">
                    Every booking gets its own guest portal. The group signs the agreement, confirms
                    headcount, and sorts their own people into rooms. Documents, invoices and every
                    message live on the booking instead of in somebody's inbox.
                  </p>
                  <div className="subs">
                    <span className="sub-pill">Guest portal</span>
                    <span className="sub-pill">Documents &amp; invoices</span>
                    <span className="sub-pill">Rooming</span>
                    <span className="sub-pill">Change requests</span>
                  </div>
                </div>

                <div className="flow">
                  <div className="phone">
                    <span className="btn-vol v1"></span><span className="btn-vol v2"></span><span className="btn-vol v3"></span>
                    <span className="btn-pwr"></span>
                    <div className="frame"><div className="screen">
                    <div className="island"></div><div className="home"></div>
                    <div className="pscreen">
                      <div className="pbar"><span>10:04</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span className="sig"><i style={{ height: "3px" }}></i><i style={{ height: "5px" }}></i><i style={{ height: "6.5px" }}></i><i style={{ height: "8px" }}></i></span>
                          <svg width="11" height="9" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true"><path d="M8 11.2 5.9 8.9a3 3 0 0 1 4.2 0zM3.6 6.6 2 4.9a8.6 8.6 0 0 1 12 0l-1.6 1.7a6.3 6.3 0 0 0-8.8 0z"/></svg>
                          <span className="batt"><i></i></span>
                        </span></div>
                      <div className="ptitle">Retreat · Oct 1–4</div>
                      <div style={{ background: "var(--sage-pale)", borderRadius: "5px", padding: "7px 8px", fontSize: "9.5px", color: "#3E5A46", fontWeight: "700", marginBottom: "8px" }}>
                        ✓ Agreement signed</div>
                      <div style={{ fontSize: "10px", color: "var(--soft)", marginBottom: "4px" }}>Your checklist</div>
                      <div style={{ fontSize: "10px", padding: "4px 0", borderBottom: "1px solid var(--rule)" }}>
                        ✓ Deposit paid</div>
                      <div style={{ fontSize: "10px", padding: "4px 0", borderBottom: "1px solid var(--rule)" }}>
                        ✓ Headcount · 50</div>
                      <div style={{ fontSize: "10px", padding: "4px 0", color: "var(--amber-text)", fontWeight: "600" }}>
                        → Rooming, 34 to place</div>
                      <div style={{ background: "var(--pine)", color: "var(--paper)", borderRadius: "9px", marginTop: "10px", textAlign: "center", padding: "9px", fontSize: "11.5px", fontWeight: "600" }}>Open rooming</div>
                    </div></div></div>
                  </div>
                  <div className="arrow"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"><path d="M4 12h14M13 6l6 6-6 6"/></svg></div>
                  <div className="ui">
                    <div className="uibar"><span className="t">Retreat · Oct 1–4</span><span className="meta">50 guests · 3 nights</span></div>
                    <div className="uibody">
                      <div className="progress" style={{ marginBottom: "12px" }}>
                        <div className="step"><div className="lb">Contract</div><div className="cl done">✓</div></div>
                        <div className="step"><div className="lb">Deposit</div><div className="cl done">✓</div></div>
                        <div className="step"><div className="lb">Headcount</div><div className="cl done">✓</div></div>
                        <div className="step"><div className="lb">Housing</div><div className="cl now">→</div></div>
                        <div className="step"><div className="lb">Menu</div><div className="cl todo"></div></div>
                        <div className="step"><div className="lb">COI</div><div className="cl todo"></div></div>
                        <div className="step"><div className="lb">Invoice</div><div className="cl todo"></div></div>
                      </div>
                      <div className="row"><span className="chip ok">Signed</span><div className="grow">
                        <div className="title">Retreat agreement</div>
                        <div className="sub">Eric R · Aug 24 · code verified</div></div></div>
                      <div className="row"><span className="chip high">Sent</span><div className="grow">
                        <div className="title">Invoice INV-260824-01</div>
                        <div className="sub">$17,400 · due Aug 27</div></div></div>
                      <div className="row"><span className="chip grey">Reply sent</span><div className="grow">
                        <div className="title">"Can we add a late bus Friday?"</div>
                        <div className="sub">Change request · answered in portal</div></div></div>
                      <div className="callout save">Every document, invoice and message on the booking. No inbox archaeology.</div>
                    </div>
                  </div>
                </div>

                  <ul className="caps">
                    <li><span className="tick">✓</span><span>A private link for the coordinator, no password to forget</span></li>
                    <li><span className="tick">✓</span><span>Agreement signed and stored, with an audit trail</span></li>
                    <li><span className="tick">✓</span><span>The group names their own guests and picks their own beds</span></li>
                    <li><span className="tick">✓</span><span>Deposits, invoices and balance in one place per group</span></li>
                  </ul>
              </div>

              {/* ── SAFETY ── */}
              <div className={panelClass('saf')} id="p-saf">
                <div className="panel-head">
                  <h3>Compliance that's already done when they ask</h3>
                  <p className="blurb">
                    Extinguishers, alarms, drills, kitchen temperatures and staff certifications, each on
                    its own schedule and each telling you before it lapses. The binder assembles itself as
                    the season runs.
                  </p>
                  <div className="subs">
                    <span className="sub-pill">Inspections</span>
                    <span className="sub-pill">Drills</span>
                    <span className="sub-pill">Kitchen temps</span>
                    <span className="sub-pill">Certifications</span>
                  </div>
                </div>

                <div className="flow" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="ui">
                    <div className="uibar"><span className="t">Safety &amp; Compliance</span>
                      <span className="meta">38% · 8 overdue</span></div>
                    <div className="uibody">
                      <div className="grid2" style={{ marginBottom: "10px" }}>
                        <div className="stat"><div className="lb">Inspections due</div>
                          <div className="vl" style={{ color: "var(--flame)" }}>8</div><div className="rg">this week</div></div>
                        <div className="stat"><div className="lb">Certifications</div>
                          <div className="vl">24</div><div className="rg">2 expiring soon</div></div>
                      </div>
                      <div className="row"><span className="chip urgent">Overdue</span><div className="grow">
                        <div className="title">Extinguisher 1 · Health Center</div>
                        <div className="sub">Monthly check · 6 days late</div></div></div>
                      <div className="row"><span className="chip urgent">Overdue</span><div className="grow">
                        <div className="title">Smoke alarm / CO · Dining Hall</div>
                        <div className="sub">Monthly check · 3 days late</div></div></div>
                      <div className="row"><span className="chip ok">Logged</span><div className="grow">
                        <div className="title">Fire drill · all cabins</div>
                        <div className="sub">4 min 12 s · 214 accounted for · Priya</div></div></div>
                      <div className="row"><span className="chip high">Expiring</span><div className="grow">
                        <div className="title">Lifeguard cert · 2 staff</div>
                        <div className="sub">Renew before Sep 14</div></div></div>
                    </div>
                  </div>
                </div>

                  <ul className="caps">
                    <li><span className="tick">✓</span><span>Every item on a schedule, overdue surfaced early</span></li>
                    <li><span className="tick">✓</span><span>Drills logged with who ran them and how long they took</span></li>
                    <li><span className="tick">✓</span><span>Staff certifications with expiry dates you'll be warned about</span></li>
                    <li><span className="tick">✓</span><span>ACA and health-department records, exportable</span></li>
                  </ul>
              </div>
        </div>
      </section>

      {/* ═══ A DAY AT CAMP ═══ */}
      <section className="day" id="day">
        <div className="wrap">
          <div className="sechead rv">
            <p className="eyebrow">A day at camp</p>
            <h2>One cracked window, followed all the way through.</h2>
          </div>
          <div className="timeline">
            <div className="beats">
              {/* 1 · The phone she is holding, cropped by the frame. */}
              <div className="beat rv"><div className="dot"></div>
                <div className="scene">
                  <div className="sc-phone">
                    <div className="fr"><div className="sc">
                      <div className="isl"></div>
                      <div style={{ fontFamily: "Bitter,serif", fontSize: "9px", fontWeight: "600", color: "var(--pine)", marginBottom: "5px" }}>Log an issue</div>
                      <div style={{ borderRadius: "5px", overflow: "hidden", height: "46px", marginBottom: "5px" }}>
                        <svg viewBox="0 0 200 124" preserveAspectRatio="xMidYMid slice" style={{ width: "100%", height: "100%", display: "block" }} role="img" aria-label="Cracked window pane">
                    <defs>
                      <linearGradient id="c-sky" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#9dc4d8"/><stop offset="1" stopColor="#cfe0e6"/>
                      </linearGradient>
                      <linearGradient id="c-glare" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#fff" stopOpacity=".5"/>
                        <stop offset="1" stopColor="#fff" stopOpacity="0"/>
                      </linearGradient>
                      <linearGradient id="c-vig" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#000" stopOpacity=".16"/>
                        <stop offset=".35" stopColor="#000" stopOpacity="0"/>
                        <stop offset="1" stopColor="#000" stopOpacity=".22"/>
                      </linearGradient>
                    </defs>
                    <rect width="200" height="124" fill="#8a6a4a"/>
                    <g fill="#7d5f42"><rect y="8" width="200" height="2"/><rect y="26" width="200" height="2"/>
                      <rect y="44" width="200" height="2"/><rect y="62" width="200" height="2"/>
                      <rect y="80" width="200" height="2"/><rect y="98" width="200" height="2"/>
                      <rect y="116" width="200" height="2"/></g>
                    <g opacity=".28" fill="#5e462f"><rect x="16" width="1.5" height="124"/><rect x="132" width="1.5" height="124"/></g>
                    <rect x="44" y="18" width="112" height="88" rx="2" fill="#f2ede1"/>
                    <rect x="49" y="23" width="102" height="78" fill="url(#c-sky)"/>
                    <path d="M49 78 L74 56 L92 72 L112 44 L151 78 Z" fill="#5E7A61" opacity=".55"/>
                    <rect x="98" y="23" width="4" height="78" fill="#f2ede1"/>
                    <rect x="49" y="59" width="102" height="4" fill="#f2ede1"/>
                    <path d="M49 23 L92 23 L49 62 Z" fill="url(#c-glare)"/>
                    <g stroke="#fdfdfd" strokeWidth="1.1" fill="none" opacity=".95">
                      <path d="M70 44 L58 27 M70 44 L52 52 M70 44 L64 66 M70 44 L88 34 M70 44 L86 58 M70 44 L74 78"/>
                      <path d="M62 36 L57 44 M76 39 L80 47 M67 55 L60 59"/>
                    </g>
                    <circle cx="70" cy="44" r="2.4" fill="#fff" opacity=".9"/>
                    <rect width="200" height="124" fill="url(#c-vig)"/>
                  </svg>
                      </div>
                      <div style={{ fontSize: "8.5px", fontWeight: "600", color: "var(--ink)", lineHeight: "1.3" }}>Cabin 12 window cracked</div>
                      <div style={{ display: "flex", gap: "3px", marginTop: "4px" }}>
                        <span className="sc-chip" style={{ background: "var(--flame-bg)", color: "#8A3D1E" }}>Urgent</span>
                        <span className="sc-chip" style={{ background: "var(--rule)", color: "var(--soft)" }}>Cabin 12</span>
                      </div>
                      <div style={{ background: "var(--pine)", color: "var(--paper)", borderRadius: "6px", textAlign: "center", padding: "5px", fontSize: "8.5px", fontWeight: "600", marginTop: "7px" }}>Submit</div>
                    </div></div>
                  </div>
                </div>
                <div className="time">7:02 AM</div><div className="who">Counsellor</div>
                <div className="what">Photographs a cracked pane in Cabin 12 on her phone. Two taps, no account needed.</div></div>

              {/* 2 · It lands at the top of the board, unread. */}
              <div className="beat rv" style={{ transitionDelay: ".1s" }}><div className="dot"></div>
                <div className="scene">
                  <div className="sc-ui">
                    <div className="sc-bar"><b>Issues &amp; Repairs</b><span>9 open · 3 urgent</span></div>
                    <div className="sc-row sc-new">
                      <span className="sc-chip" style={{ background: "var(--flame-bg)", color: "#8A3D1E" }}>Urgent</span>
                      <div className="g"><div className="t">Cabin 12 window cracked</div>
                        <div className="s">Cabin 12 · just now · from phone</div></div>
                    </div>
                    <div className="sc-row">
                      <span className="sc-chip" style={{ background: "var(--flame-bg)", color: "#8A3D1E" }}>Urgent</span>
                      <div className="g"><div className="t">Kitchen breakers tripping</div>
                        <div className="s">Kitchen · yesterday</div></div><span className="sc-av">S</span>
                    </div>
                    <div className="sc-row">
                      <span className="sc-chip" style={{ background: "var(--amber-bg)", color: "var(--amber-text)" }}>High</span>
                      <div className="g"><div className="t">Swim dock ladder loose</div>
                        <div className="s">Waterfront · yesterday</div></div><span className="sc-av">PS</span>
                    </div>
                  </div>
                </div>
                <div className="time">7:04 AM</div><div className="who">Facilities</div>
                <div className="what">It appears as urgent, tagged to Cabin 12.</div></div>

              {/* 3 · The same card, now with a name against it. */}
              <div className="beat rv" style={{ transitionDelay: ".2s" }}><div className="dot"></div>
                <div className="scene">
                  <div className="sc-ui">
                    <div className="sc-bar"><b>Cabin 12 window cracked</b><span>#418</span></div>
                    <div style={{ padding: "8px 9px 7px" }}>
                      <div style={{ display: "flex", gap: "3px", marginBottom: "6px" }}>
                        <span className="sc-chip" style={{ background: "var(--flame-bg)", color: "#8A3D1E" }}>Urgent</span>
                        <span className="sc-chip" style={{ background: "var(--rule)", color: "var(--soft)" }}>Cabin 12</span>
                      </div>
                      <div style={{ fontSize: "8.5px", color: "var(--soft)", lineHeight: "1.45" }}>
                        Back bunkroom, lower left pane. Sharp edge, taped off for now.
                      </div>
                    </div>
                    <div className="sc-row" style={{ borderTop: "1px solid var(--rule)" }}>
                      <span className="sc-av">MT</span>
                      <div className="g"><div className="t">Marcus Torres</div>
                        <div className="s">Maintenance · notified 8:15 AM</div></div>
                      <span className="sc-chip" style={{ background: "var(--sage-pale)", color: "#3E5A46" }}>Assigned</span>
                    </div>
                  </div>
                </div>
                <div className="time">8:15 AM</div><div className="who">Director</div>
                <div className="what">Assigns it to Marcus, who sees it on his phone right away.</div></div>

              {/* 4 · Closed, with the proof attached. */}
              <div className="beat rv last" style={{ transitionDelay: ".3s" }}><div className="dot"></div>
                <div className="scene">
                  <div className="sc-ui">
                    <div className="sc-bar"><b>Cabin 12 window cracked</b>
                      <span style={{ color: "#3E5A46", fontWeight: "700" }}>Closed</span></div>
                    <div style={{ height: "54px", overflow: "hidden" }}><svg viewBox="0 0 200 124" preserveAspectRatio="xMidYMid slice" style={{ width: "100%", height: "100%", display: "block" }} role="img" aria-label="Replaced window pane">
                    <defs>
                      <linearGradient id="f-sky" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#9dc4d8"/><stop offset="1" stopColor="#cfe0e6"/>
                      </linearGradient>
                      <linearGradient id="f-glare" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#fff" stopOpacity=".5"/>
                        <stop offset="1" stopColor="#fff" stopOpacity="0"/>
                      </linearGradient>
                      <linearGradient id="f-vig" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#000" stopOpacity=".16"/>
                        <stop offset=".35" stopColor="#000" stopOpacity="0"/>
                        <stop offset="1" stopColor="#000" stopOpacity=".22"/>
                      </linearGradient>
                    </defs>
                    <rect width="200" height="124" fill="#8a6a4a"/>
                    <g fill="#7d5f42"><rect y="8" width="200" height="2"/><rect y="26" width="200" height="2"/>
                      <rect y="44" width="200" height="2"/><rect y="62" width="200" height="2"/>
                      <rect y="80" width="200" height="2"/><rect y="98" width="200" height="2"/>
                      <rect y="116" width="200" height="2"/></g>
                    <g opacity=".28" fill="#5e462f"><rect x="16" width="1.5" height="124"/><rect x="132" width="1.5" height="124"/></g>
                    <rect x="44" y="18" width="112" height="88" rx="2" fill="#f2ede1"/>
                    <rect x="49" y="23" width="102" height="78" fill="url(#f-sky)"/>
                    <path d="M49 78 L74 56 L92 72 L112 44 L151 78 Z" fill="#5E7A61" opacity=".55"/>
                    <rect x="98" y="23" width="4" height="78" fill="#f2ede1"/>
                    <rect x="49" y="59" width="102" height="4" fill="#f2ede1"/>
                    <path d="M49 23 L92 23 L49 62 Z" fill="url(#f-glare)"/>

                    <rect width="200" height="124" fill="url(#f-vig)"/>
                  </svg></div>
                    <div className="sc-row">
                      <span className="sc-av">MT</span>
                      <div className="g"><div className="t">Pane replaced</div>
                        <div className="s">Marcus Torres · 2:40 PM · 1.5 hrs</div></div>
                    </div>
                    <div className="sc-note">Fixed and logged. Nobody sent a status email.</div>
                  </div>
                </div>
                <div className="time">2:40 PM</div><div className="who">Maintenance</div>
                <div className="what">Marcus replaces the pane and marks it fixed. Closed and logged.</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CLOSE ═══ */}
      <section className="close" id="pricing">
        <div className="wrap">
          <h2>See how CampCommand can help your operations team.</h2>
          <p>
            Book a 30-minute demo so we can learn more about your camp and show you how your
            operational processes could look using CampCommand.
          </p>
          <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={onBookDemo}>Book a demo →</button>
          </div>
        </div>
      </section>

      <footer>
        <div className="inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(246,241,228,.75)' }}>
            <svg viewBox="0 0 64 64" width="24" height="24" aria-hidden="true">
              <circle cx="32" cy="32" r="31" fill="#F6F1E4" />
              <path d="M 28.863 17.965A7 7 0 1 0 28.863 28.035L 26.779 25.877A4 4 0 1 1 26.779 20.123Z" fill="#1D3A2E" />
              <path d="M 44.863 17.965A7 7 0 1 0 44.863 28.035L 42.779 25.877A4 4 0 1 1 42.779 20.123Z" fill="#1D3A2E" />
              <path d="M32 32C35 37 38 40 38 44A6 6 0 0 1 26 44C26 40.8 27.8 38.6 29 36C29.8 38.6 30.7 40 31.6 40.7C31.3 37.6 31.5 34.6 32 32Z" fill="#1D3A2E" />
              <path d="M18 51 46 45.5" stroke="#1D3A2E" strokeWidth="3" />
              <path d="M18 45.5 46 51" stroke="#1D3A2E" strokeWidth="3" />
            </svg>
            CampCommand
          </div>
          <div style={{ display: 'flex', gap: '22px' }}>
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
            <a href="/security" target="_blank" rel="noopener noreferrer">Security</a>
            <a href="/support" target="_blank" rel="noopener noreferrer">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
