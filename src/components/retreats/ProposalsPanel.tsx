// Proposals for one group, newest version first.
//
// The reason this table exists is `viewedAt`. A camp that knows the proposal was opened on
// Tuesday afternoon makes a different phone call from one that is guessing, and "not opened yet"
// after four days is not a nudge email, it is a wrong address. Everything else here — versions,
// the printable document, the portal link — is in service of that one fact.
import { useMemo, useState } from 'react';
import { Plus, Printer, Trash2, Eye, EyeOff, Check, X, Copy, Link2, FileText } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import type { Retreat, RetreatProposal } from '@/lib/types';
import { dbDeleteProposal } from '@/lib/retreatsDb';
import { printAgreement } from '@/lib/agreementHtml';
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

/**
 * The agreement as a standalone document, rendered by the shared `agreementHtml` so the copy the
 * camp prints and the copy the group downloads from their portal are the same document.
 *
 * The version that used to live here omitted `agreementBody` entirely: it printed a price, a
 * validity date and a short terms blurb under the heading "Retreat agreement", with the agreement
 * itself nowhere on the page.
 */
function printProposal(p: RetreatProposal, r: Retreat, campName: string): boolean {
  return printAgreement({
    campName,
    groupName: r.groupName,
    coordinatorName: r.coordinatorName,
    version: p.version,
    arrivalDate: r.arrivalDate,
    departureDate: r.departureDate,
    dateNote: r.dateFlexibility,
    headcount: p.peopleCount ?? r.headcount,
    lineItems: p.lineItems,
    total: p.total,
    intro: p.intro,
    agreementBody: p.agreementBody,
    terms: p.terms,
    validUntil: p.validUntil,
    signedBy: p.status === 'accepted' ? p.acceptedByName : null,
    signedAt: p.status === 'accepted' ? p.acceptedAt : null,
  });
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
          <h3 className="text-[13px] font-semibold text-forest">Retreat agreement</h3>
        </div>
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => setModal({})}>
            <Plus className="w-3.5 h-3.5" /> {list.length ? 'New version' : 'New agreement'}
          </Button>
        )}
      </div>

      {/* Where the newest version has got to, said loudly — that is the one whose answer you are
          waiting on. Signed beats opened: it used to stop at "Opened Mon, Sep 14 10:09pm" on an
          agreement that had been signed an hour later, which is the wrong end of the story. */}
      {current && current.status !== 'draft' && (() => {
        const state = current.acceptedAt ? 'signed'
          : current.declinedAt ? 'declined'
          : current.viewedAt ? 'opened' : 'sent';
        const band = state === 'signed' ? 'bg-green-muted-bg/60'
          : state === 'declined' ? 'bg-red-bg/50'
          : state === 'opened' ? 'bg-blue-bg/50' : 'bg-cream-dark/50';
        return (
          <div className={`px-4 py-3 border-b border-border ${band}`}>
            <p className="flex items-center gap-2 text-[14px] font-semibold text-forest">
              {state === 'signed' ? (
                <><Check className="w-4 h-4 text-green-muted-text" /> Signed {fmtOpened(current.acceptedAt!)}</>
              ) : state === 'declined' ? (
                <><X className="w-4 h-4 text-red" /> Declined {fmtOpened(current.declinedAt!)}</>
              ) : state === 'opened' ? (
                <><Eye className="w-4 h-4 text-blue" /> Opened {fmtOpened(current.viewedAt!)}</>
              ) : (
                <><EyeOff className="w-4 h-4 text-ink-faint" /> Not opened yet</>
              )}
            </p>
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <p className="text-[11.5px] text-ink-soft mt-0.5">
                {state === 'signed'
                  ? `v${current.version}${current.acceptedByName ? ` · by ${current.acceptedByName}` : ''}${current.viewedAt ? ` · opened ${fmtOpened(current.viewedAt)}` : ''}`
                  : state === 'declined'
                    ? current.declineReason ?? `v${current.version}`
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
        );
      })()}

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
