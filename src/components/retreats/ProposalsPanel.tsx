// Proposals for one group, newest version first.
//
// The reason this table exists is `viewedAt`. A camp that knows the proposal was opened on
// Tuesday afternoon makes a different phone call from one that is guessing, and "not opened yet"
// after four days is not a nudge email, it is a wrong address. Everything else here — versions,
// the printable document, the portal link — is in service of that one fact.
import { useMemo, useState } from 'react';
import { Plus, Printer, Trash2, Eye, EyeOff, Check, Copy, Link2, FileText } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import type { Retreat, RetreatProposal } from '@/lib/types';
import { dbDeleteProposal } from '@/lib/retreatsDb';
import { todayStr } from '@/lib/utils';
import { money, fmtDateFull, fmtRange, Badge, type BadgeTone } from './retreatUi';
import { ProposalModal } from './ProposalModal';
import { ProposalViewer } from './ProposalViewer';

/** "Tue 3:12pm" — the day of the week is the part that changes what you do next. */
function fmtOpened(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '')}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDocDate(d: string | null | undefined): string {
  if (!d) return '-';
  const dt = d.length <= 10 ? new Date(`${d}T00:00:00`) : new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * The proposal as a standalone document, deliberately built the same way `invoiceHtml.ts` builds
 * an invoice: one self-contained string, opened in a new window, printed straight to PDF. It is
 * the same camp on the same letterhead, so it should not look like a different company.
 */
function proposalHtml(p: RetreatProposal, r: Retreat, campName: string): string {
  const rows = p.lineItems.length
    ? p.lineItems.map((l) => `<tr><td>${esc(l.description)}</td><td class="amt">${fmtMoney(l.amount)}</td></tr>`).join('')
    : `<tr><td>Your stay</td><td class="amt">${fmtMoney(p.total)}</td></tr>`;
  const stay = r.arrivalDate && r.departureDate
    ? `${fmtDocDate(r.arrivalDate)} – ${fmtDocDate(r.departureDate)}`
    : r.dateFlexibility ?? 'Dates to be confirmed';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Proposal v${p.version} · ${esc(r.groupName)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a2e1a;max-width:720px;margin:0 auto;padding:48px 40px;font-size:14px;line-height:1.5}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2f4a2f;padding-bottom:20px;margin-bottom:28px}
    .camp{font-size:20px;font-weight:700;color:#2f4a2f}
    .doc{text-align:right}
    .doc h1{font-size:22px;margin:0 0 4px;letter-spacing:.02em;text-transform:uppercase;color:#2f4a2f}
    .doc .num{font-family:ui-monospace,Menlo,monospace;color:#6b7c6b;font-size:13px}
    .meta{display:flex;gap:48px;margin-bottom:28px;flex-wrap:wrap}
    .meta .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a9a8a;font-weight:600;margin-bottom:4px}
    .intro{margin-bottom:28px;color:#4a5a4a;white-space:pre-wrap}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a9a8a;border-bottom:1px solid #d9e0d5;padding:8px 0}
    th.amt,td.amt{text-align:right;font-variant-numeric:tabular-nums}
    td{padding:11px 0;border-bottom:1px solid #eef1ea}
    .total{display:flex;justify-content:flex-end;margin-top:16px}
    .total .box{min-width:240px}
    .total .due{display:flex;justify-content:space-between;font-size:18px;font-weight:700;color:#2f4a2f;border-top:2px solid #2f4a2f;padding-top:10px}
    .terms{margin-top:32px;padding:16px;background:#f4f6f1;border-radius:8px;color:#4a5a4a;font-size:13px;white-space:pre-wrap}
    .terms h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a9a8a;margin:0 0 8px}
    .foot{margin-top:40px;text-align:center;color:#9aa89a;font-size:11px}
    @media print{body{padding:24px}}
  </style></head><body>
    <div class="head">
      <div><div class="camp">${esc(campName || 'Camp')}</div><div style="color:#6b7c6b;font-size:12px;margin-top:2px">Group booking proposal</div></div>
      <div class="doc"><h1>Proposal</h1><div class="num">Version ${p.version}</div></div>
    </div>
    <div class="meta">
      <div><div class="label">Prepared for</div><div><strong>${esc(r.groupName)}</strong>${r.coordinatorName ? `<br><span style="color:#4a5a4a">${esc(r.coordinatorName)}</span>` : ''}</div></div>
      <div><div class="label">Stay</div><div>${esc(stay)}</div></div>
      <div><div class="label">People</div><div>${r.headcount || '—'}</div></div>
      <div><div class="label">Valid until</div><div>${fmtDocDate(p.validUntil)}</div></div>
    </div>
    ${p.intro ? `<div class="intro">${esc(p.intro)}</div>` : ''}
    <table><thead><tr><th>Description</th><th class="amt">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="total"><div class="box"><div class="due"><span>Total</span><span>${fmtMoney(p.total)}</span></div></div></div>
    ${p.terms ? `<div class="terms"><h2>Terms</h2>${esc(p.terms)}</div>` : ''}
    <div class="foot">This proposal is not a booking. Dates are held once the agreement is signed and the deposit is received.</div>
  </body></html>`;
}

function printProposal(p: RetreatProposal, r: Retreat, campName: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(proposalHtml(p, r, campName));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
  return true;
}

function statusTone(p: RetreatProposal, expired: boolean): { tone: BadgeTone; label: string } {
  if (p.status === 'accepted') return { tone: 'ok', label: 'Accepted' };
  if (p.status === 'declined') return { tone: 'alert', label: 'Declined' };
  if (expired) return { tone: 'warn', label: 'Expired' };
  if (p.status === 'viewed') return { tone: 'blue', label: 'Opened' };
  if (p.status === 'sent') return { tone: 'purple', label: 'Sent' };
  return { tone: 'neutral', label: 'Draft' };
}

export function ProposalsPanel({ retreatId }: { retreatId: string }) {
  const { proposals, setProposals, retreatById, portalUrl, openModal } = useRetreatStore();
  const { currentCamp } = useCampStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const [modal, setModal] = useState<{ proposalId?: string } | null>(null);
  const [viewing, setViewing] = useState<RetreatProposal | null>(null);
  const [copied, setCopied] = useState(false);

  const retreat = retreatById(retreatId);

  // Derived with useMemo from the raw slice, never inside a zustand selector.
  const list = useMemo(
    () => proposals.filter((p) => p.retreatId === retreatId).sort((a, b) => b.version - a.version),
    [proposals, retreatId],
  );

  const current = list[0] ?? null;
  const url = retreat ? portalUrl(retreat) : '';
  const today = todayStr();

  function copyLink() {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard denied; the link is on screen */ });
  }

  function remove(p: RetreatProposal) {
    if (!window.confirm(`Delete proposal v${p.version}?`)) return;
    setProposals(proposals.filter((x) => x.id !== p.id));
    void dbDeleteProposal(p.id);
  }

  return (
    <div className="bg-white border border-border rounded-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-[13px] font-semibold text-forest">Proposals</h3>
        </div>
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => setModal({})}>
            <Plus className="w-3.5 h-3.5" /> {list.length ? 'New version' : 'New proposal'}
          </Button>
        )}
      </div>

      {/* Opened / not opened, said loudly, for the newest version only — that is the one
          whose answer you are waiting on. */}
      {current && current.status !== 'draft' && (
        <div className={`px-4 py-3 border-b border-border ${current.viewedAt ? 'bg-blue-bg/50' : 'bg-cream-dark/50'}`}>
          <p className="flex items-center gap-2 text-[14px] font-semibold text-forest">
            {current.viewedAt
              ? <><Eye className="w-4 h-4 text-blue" /> Opened {fmtOpened(current.viewedAt)}</>
              : <><EyeOff className="w-4 h-4 text-ink-faint" /> Not opened yet</>}
          </p>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <p className="text-[11.5px] text-ink-soft mt-0.5">
              {current.viewedAt
                ? 'They have read v' + current.version + '. A call converts better than a second email.'
                : current.sentAt
                  ? 'Sent ' + fmtOpened(current.sentAt) + '.'
                  : 'Send it and this will start tracking.'}
            </p>
            {/* The nudge belongs where you learn it is needed. */}
            {canManage && current.sentAt && !current.acceptedAt && !current.declinedAt && (
              <Button
                size="sm" variant="ghost"
                onClick={() => openModal({ kind: 'sendReminder', retreatId, reminderType: 'proposal' })}
              >
                Send reminder
              </Button>
            )}
          </div>
        </div>
      )}

      {/* The portal link. They already have it — the proposal lives at the same address as
          everything else, so there is no second link to lose. */}
      {url && list.some((p) => p.status !== 'draft') && (
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />
          <code className="flex-1 min-w-0 text-[11.5px] font-mono text-ink-soft truncate">{url}</code>
          <button
            type="button" onClick={copyLink}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-forest hover:underline flex-shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="px-4 py-6 text-[12.5px] text-ink-faint text-center">
          No proposal yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((p) => {
            const expired = Boolean(p.validUntil && p.validUntil < today
              && (p.status === 'sent' || p.status === 'viewed'));
            const { tone, label } = statusTone(p, expired);
            return (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-forest">Version {p.version}</span>
                      <Badge tone={tone}>{label}</Badge>
                      <span className="text-[13px] font-semibold text-ink tabular-nums">{money(p.total)}</span>
                    </p>
                    <p className="text-[11.5px] text-ink-soft mt-0.5">
                      {p.lineItems.length} {p.lineItems.length === 1 ? 'line' : 'lines'}
                      {p.validUntil && ` · valid until ${fmtDateFull(p.validUntil)}`}
                      {p.sentAt && ` · sent ${fmtOpened(p.sentAt)}`}
                    </p>
                    {p.acceptedAt && (
                      <p className="text-[12px] text-green-muted-text font-semibold mt-1">
                        Accepted {fmtOpened(p.acceptedAt)}{p.acceptedByName ? ` by ${p.acceptedByName}` : ''}
                      </p>
                    )}
                    {p.declinedAt && (
                      <p className="text-[12px] text-red mt-1">
                        Declined {fmtOpened(p.declinedAt)}{p.declineReason ? ` — ${p.declineReason}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {p.status !== 'draft' && (
                      <button
                        type="button" title="View it as they received it"
                        onClick={() => setViewing(p)}
                        className="p-1.5 text-ink-faint hover:text-forest transition-colors"
                      ><Eye className="w-3.5 h-3.5" /></button>
                    )}
                    <button
                      type="button" title="Print / save as PDF"
                      onClick={() => { if (retreat) printProposal(p, retreat, currentCamp?.name ?? ''); }}
                      className="p-1.5 text-ink-faint hover:text-forest transition-colors"
                    ><Printer className="w-3.5 h-3.5" /></button>
                    {canManage && p.status === 'draft' && (
                      <>
                        <button
                          type="button" title="Edit draft" onClick={() => setModal({ proposalId: p.id })}
                          className="p-1.5 text-ink-faint hover:text-forest transition-colors"
                        ><FileText className="w-3.5 h-3.5" /></button>
                        <button
                          type="button" title="Delete draft" onClick={() => remove(p)}
                          className="p-1.5 text-ink-faint hover:text-red transition-colors"
                        ><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </div>
                {p.intro && (
                  <p className="text-[12px] text-ink-soft mt-2 line-clamp-2 whitespace-pre-wrap">{p.intro}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {retreat && (
        <p className="px-4 py-2.5 border-t border-border text-[11px] text-ink-faint">
          {fmtRange(retreat.arrivalDate, retreat.departureDate)} 
        </p>
      )}

      {viewing && (
        <ProposalViewer
          proposal={viewing}
          retreat={retreat ?? null}
          campName={currentCamp?.name ?? ''}
          portalUrl={url}
          onPrint={() => { if (retreat) printProposal(viewing, retreat, currentCamp?.name ?? ''); }}
          onClose={() => setViewing(null)}
        />
      )}

      {modal && (
        <ProposalModal
          retreatId={retreatId}
          proposalId={modal.proposalId}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
