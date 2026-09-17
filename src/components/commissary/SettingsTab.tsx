import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, Trash2, AlertTriangle, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import { WEEKDAYS } from '@/lib/commissaryUnits';
import type { CommissarySession } from '@/lib/types';
import { FoodProgramsSettings } from '@/components/foodRequests/FoodProgramsSettings';

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const cap = (d: string | null) => (d ? d[0].toUpperCase() + d.slice(1) : '');

// Plain-language ordering cadence for a session row. Delivery day falls back to the
// start date's weekday when unset (which is what the ordering math assumes).
function cadenceSummary(s: CommissarySession) {
  const deliveryDay = s.deliveryDay ?? WEEKDAYS[new Date(`${s.startDate}T00:00:00`).getDay()];
  const parts = [`order every ${s.orderFrequencyDays}d`];
  if (s.countDay) parts.push(`count ${cap(s.countDay)}`);
  if (s.orderDay) parts.push(`order ${cap(s.orderDay)}`);
  parts.push(`deliver ${cap(deliveryDay)}`);
  return parts.join(' · ');
}

export function SettingsTab() {
  const {
    sessions, activeSessionId, setActiveSession, openModal, deleteSession, wipeAllData,
  } = useCommissaryStore();
  const { can } = useAuth();
  const canManage = can('manageCommissary');

  const [confirmText, setConfirmText] = useState('');
  // /commissary?tab=settings&section=programs (the Requests tab's "Programs & links") lands on the
  // programs, not on Sessions with the delete-everything box one scroll below.
  const [searchParams] = useSearchParams();
  const section = searchParams.get('section');
  const programsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (section !== 'programs' || !programsRef.current) return;
    programsRef.current.scrollIntoView({ block: 'start' });
    programsRef.current.focus({ preventScroll: true });
  }, [section]);
  const [wiping, setWiping] = useState(false);
  const [wiped, setWiped] = useState(false);

  async function handleWipe() {
    if (confirmText !== 'DELETE') return;
    setWiping(true);
    const ok = await wipeAllData();
    setWiping(false);
    if (ok) { setWiped(true); setConfirmText(''); }
    else alert('Could not delete the data. You may not have permission.');
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 pt-4 pb-24 sm:pt-6">
      <div className="max-w-2xl space-y-8">
        {/* ── Sessions ─────────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[15px] font-semibold text-forest">Sessions</h2>
              <p className="text-[12px] text-ink-soft">Head counts and dates that everything else scales from.</p>
            </div>
            {canManage && (
              <Button size="sm" onClick={() => openModal({ kind: 'session' })}>+ New session</Button>
            )}
          </div>

          <div className="bg-white rounded-card border border-border overflow-hidden">
            {sessions.length === 0 && (
              <p className="px-4 py-4 sm:py-6 text-center text-[13px] text-ink-faint">
                No sessions yet. Create one to start planning menus and orders.
              </p>
            )}
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                <CalendarDays className="w-4 h-4 text-ink-faint flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-forest truncate">{s.name}</p>
                    {s.id === activeSessionId && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-pill text-[10px] font-medium bg-green-muted-bg text-green-muted-text border border-sage/25">Active</span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-faint truncate">
                    {fmtDate(s.startDate)} – {fmtDate(s.endDate)} · {s.camperCount + s.staffCount} people ({s.camperCount} campers + {s.staffCount} staff)
                  </p>
                  <p className="text-[11px] text-ink-faint truncate">{cadenceSummary(s)}</p>
                </div>
                {s.id !== activeSessionId && (
                  <Button size="sm" variant="ghost" onClick={() => setActiveSession(s.id)}>Set active</Button>
                )}
                {canManage && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'session', editId: s.id })}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red hover:bg-red-bg"
                      onClick={() => { if (confirm(`Delete session "${s.name}"? Its menu entries are removed too.`)) deleteSession(s.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <div ref={programsRef} tabIndex={-1} id="food-programs" className="scroll-mt-4 rounded-card outline-none">
          <FoodProgramsSettings />
        </div>

        {/* ── Danger zone ──────────────────────────────────────────────────── */}
        {canManage && (
          // Last on the page and closed by default: it sat open directly under the program links,
          // one scroll from where a kitchen manager copies a link.
          <details className="group border-t border-border pt-6" data-testid="danger-zone">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-red [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" /> Danger zone
            </summary>
            <div className="mt-3 rounded-card border-2 border-red/30 bg-red-bg/40 px-4 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-body font-semibold text-forest">Delete all commissary data</p>
                  <p className="text-[12px] text-ink-soft mt-0.5 leading-relaxed">
                    Permanently removes this camp's inventory, vendors, recipes, menus, orders, production plans,
                    campers, and allergy records. The shared product catalog is <strong>not</strong> affected.
                    Great for clearing sample data before uploading a fresh inventory. This cannot be undone.
                  </p>

                  {wiped ? (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-green-muted-text font-medium">
                      <Check className="w-4 h-4" /> All commissary data deleted.
                    </p>
                  ) : (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="Type DELETE to confirm"
                        className="text-body bg-white border border-red/30 rounded-btn px-3 py-2 focus:outline-none focus:border-red w-52"
                      />
                      <Button
                        variant="ghost"
                        className="text-red hover:bg-red-bg border border-red/30"
                        disabled={confirmText !== 'DELETE' || wiping}
                        onClick={handleWipe}
                      >
                        {wiping ? 'Deleting…' : 'Delete everything'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
