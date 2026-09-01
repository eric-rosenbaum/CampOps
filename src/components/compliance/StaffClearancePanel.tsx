import { useMemo, useState } from 'react';
import { Check, X, AlertTriangle, Plus, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAuth } from '@/lib/auth';
import { todayStr, toDateStr, parseDateStr } from '@/lib/utils';
import type { ScreeningKind } from '@/lib/types';

/**
 * Whether each person is clear to work on day one.
 *
 * This is the module's highest-volume surface and the one an inspector opens first, because
 * almost everything New York attaches to a camp attaches to the act of hiring somebody: two
 * written non-relative references before employment begins (§873.1804), a registry check before
 * their first day and again every year before arrival (7-2.5(l)), working papers on file for
 * anyone 14 to 17 (Labor Law §132), certifications with real expiry dates, and a code of conduct
 * acknowledged annually where the Justice Center regime applies. A camp with sixty seasonal staff
 * is carrying several hundred obligations here, and every one of them resets in the spring.
 *
 * What this screen deliberately does not hold is any result. We record that a check was run and
 * when. The DCJS response letter stays in the camp's filing cabinet, which is where the
 * regulation puts it and where it should stay.
 */
export function StaffClearancePanel() {
  const { screenings, trainings, clearanceFor, saveScreening } = useComplianceStore();
  const staff = useSafetyStore((s) => s.staff);
  const certs = useSafetyStore((s) => s.certifications);
  const { currentUser, can } = useAuth();
  const canManage = can('manageSafetyStaff');
  const [busy, setBusy] = useState<string | null>(null);

  const roster = useMemo(
    () => staff.filter((m) => m.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [staff],
  );

  // `clearanceFor` reads screenings and trainings out of the store, so the memo has to see the
  // arrays themselves change — the selector identity alone would not tell it.
  const rows = useMemo(() => roster.map((m) => ({
    member: m,
    clearance: clearanceFor(m.id),
    certs: certs.filter((c) => c.staffId === m.id),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [roster, certs, screenings, trainings]);

  const clear = rows.filter((r) => r.clearance.clear === true).length;
  const blocked = rows.filter((r) => r.clearance.clear === false).length;
  const untouched = rows.filter((r) => r.clearance.clear === null).length;

  const today = todayStr();
  // A season's worth of ahead: a card that lapses mid-August is a problem in March.
  const soon = toDateStr(new Date(parseDateStr(today).getTime() + 180 * 86400000));
  const expiring = rows.filter((r) =>
    r.certs.some((c) => c.expiryDate && c.expiryDate >= today && c.expiryDate <= soon)).length;

  async function record(staffId: string, kind: ScreeningKind) {
    setBusy(`${staffId}:${kind}`);
    try {
      await saveScreening(
        { staffId, kind, performedOn: today, cleared: true }, currentUser.name || null,
      );
    } finally { setBusy(null); }
  }

  // The roster itself is edited in Camp Info. This screen is the regulator's view of it, so the
  // way to fix anything it reports is a link out rather than a second editor.
  const rosterLink = (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
      <p className="text-[12px] text-ink-soft leading-relaxed max-w-[70ch]">
        Who is on the roster, and their certifications, live in Camp Info. This page is what your
        county makes of them.
      </p>
      <Link to="/settings/staff?from=compliance"
        className="text-[12.5px] font-semibold text-sage hover:text-forest inline-flex items-center gap-1 flex-shrink-0">
        Edit the roster <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );

  if (roster.length === 0) {
    return (
      <div>
        {rosterLink}
        <p className="text-[13px] text-ink-faint italic py-8 text-center">
          No active staff on the roster yet. Add or import people in Camp Info, and their
          clearance appears here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {rosterLink}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Tile k="Roster" v={roster.length} />
        <Tile k="Clear for day one" v={clear} tone="ok" />
        <Tile k="Blocked" v={blocked} tone="stop" />
        <Tile k="Certs expiring" v={expiring} tone="warn" />
      </div>

      {untouched > 0 && (
        <p className="text-[11.5px] text-ink-soft mb-3 leading-relaxed">
          {untouched} {untouched === 1 ? 'person has' : 'people have'} nothing recorded either way,
          so they are neither clear nor blocked.
        </p>
      )}

      <div className="bg-white rounded-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border">
                <Th>Person</Th><Th>Registry check</Th><Th>References</Th>
                <Th>Working papers</Th><Th>Certifications</Th><Th>Day one</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ member, clearance, certs: mine }) => {
                const expiringCert = mine.find(
                  (c) => c.expiryDate && c.expiryDate >= today && c.expiryDate <= soon);
                const expired = mine.find((c) => c.expiryDate && c.expiryDate < today);
                return (
                  <tr key={member.id} className="border-b border-cream-dark last:border-b-0 hover:bg-paper-raised">
                    <Td>
                      <div className="font-semibold text-ink">{member.name}</div>
                      <div className="text-[11px] text-ink-soft">{member.title}</div>
                    </Td>
                    <Td>
                      {clearance.dcjs ? (
                        <span className="font-mono text-[11.5px]">{clearance.dcjs.performedOn}</span>
                      ) : canManage ? (
                        <Button size="sm" variant="ghost" disabled={busy !== null}
                          onClick={() => void record(member.id, 'dcjs_sor')}>
                          <Plus className="w-3 h-3" /> Record
                        </Button>
                      ) : <span className="text-[11.5px] text-red-text font-semibold">Not run</span>}
                      {clearance.dcjs?.expiresOn && (
                        <div className="text-[10.5px] text-ink-faint font-mono">
                          expires {clearance.dcjs.expiresOn}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <span className={clearance.references >= 2
                        ? 'text-green-muted-text font-semibold' : 'text-amber-text font-semibold'}>
                        {clearance.references} of 2
                      </span>
                      {canManage && clearance.references < 2 && (
                        <Button size="sm" variant="ghost" className="ml-2" disabled={busy !== null}
                          onClick={() => void record(member.id, 'reference_check')}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      )}
                    </Td>
                    <Td>
                      {clearance.workingPapers
                        ? <span className="font-mono text-[11.5px]">{clearance.workingPapers.performedOn}</span>
                        : <span className="text-[11.5px] text-ink-faint">n/a or not needed</span>}
                    </Td>
                    <Td>
                      {mine.length === 0
                        ? <span className="text-ink-faint">—</span>
                        : <span className="font-mono text-[11.5px]">{mine.length} on file</span>}
                      {expired && (
                        <div className="text-[10.5px] text-red-text font-semibold">
                          {expired.certName} expired {expired.expiryDate}
                        </div>
                      )}
                      {!expired && expiringCert && (
                        <div className="text-[10.5px] text-amber-text font-semibold">
                          {expiringCert.certName} expires {expiringCert.expiryDate}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {clearance.clear === true && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-tag bg-green-muted-bg text-green-muted-text">
                          <Check className="w-3 h-3" /> Clear
                        </span>
                      )}
                      {clearance.clear === false && (
                        <span title={clearance.blockers.join(' · ')}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-tag bg-red-bg text-red-text">
                          <X className="w-3 h-3" /> Blocked
                        </span>
                      )}
                      {clearance.clear === null && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-tag bg-cream-dark text-ink-soft">
                          <AlertTriangle className="w-3 h-3" /> Nothing recorded
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[11.5px] text-ink-soft leading-relaxed border-l-2 border-red pl-3">
            We record that a check was run and when — never the result. The registry response stays
            in your files.
          </p>
        </div>
      </div>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left text-[10px] uppercase tracking-[0.11em] text-ink-soft font-bold px-3 py-2 whitespace-nowrap">
    {children}
  </th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2.5 align-top">{children}</td>
);

function Tile({ k, v, tone }: { k: string; v: number; tone?: 'ok' | 'warn' | 'stop' }) {
  const colour = tone === 'ok' ? 'text-green-muted-text'
    : tone === 'warn' ? 'text-amber-text'
    : tone === 'stop' ? 'text-red-text' : 'text-forest';
  return (
    <div className="bg-white border border-border rounded-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.11em] text-ink-soft font-bold">{k}</div>
      <div className={`font-display text-[24px] font-semibold mt-1.5 tabular-nums ${colour}`}>{v}</div>
    </div>
  );
}
