// Build the document that wins the booking.
//
// The lines are built for you from the rate card and whatever charges already exist, because
// asking a director to retype "48 people × 2 nights @ $85" is how proposals end up going out as
// a paragraph in an email instead. Everything stays editable — the generated lines are a
// starting point, not a contract.
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatInvoiceLine, RetreatProposal } from '@/lib/types';
import { dbAddProposal, dbUpdateProposal, fetchProposalLines } from '@/lib/retreatsDb';
import { generateId, parseDateStr, todayStr } from '@/lib/utils';
import { money, inputClass, labelClass, fmtRange } from './retreatUi';

const now = () => new Date().toISOString();

/** Add days to a calendar day without going through UTC. */
function addDays(d: string, days: number): string {
  const dt = parseDateStr(d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const DEFAULT_TERMS = [
  'A signed agreement and a deposit hold the dates. Until both are in, the dates stay open to other groups.',
  'The final headcount is due by the cutoff on your agreement; the balance is billed on that number.',
  'A certificate of insurance naming the camp as additional insured is required before arrival.',
].join('\n');

interface Props {
  retreatId: string;
  /** Editing an existing draft. Sent proposals are never edited — a change is a new version. */
  proposalId?: string;
  onClose: () => void;
}

export function ProposalModal({ retreatId, proposalId, onClose }: Props) {
  const { proposals, setProposals, retreatById } = useRetreatStore();
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = retreatById(retreatId);
  const existing = proposalId ? proposals.find((p) => p.id === proposalId) ?? null : null;

  const [lines, setLines] = useState<RetreatInvoiceLine[]>(existing?.lineItems ?? []);
  const [intro, setIntro] = useState(existing?.intro ?? '');
  const [terms, setTerms] = useState(existing?.terms ?? DEFAULT_TERMS);
  const [validUntil, setValidUntil] = useState(existing?.validUntil ?? addDays(todayStr(), 30));
  const [loading, setLoading] = useState(!existing);

  // Seed a new proposal from the rate card. One round trip, in Postgres, so the arithmetic
  // matches what the invoice will later say rather than being computed twice in two places.
  useEffect(() => {
    if (existing) return;
    let live = true;
    fetchProposalLines(retreatId).then((seed) => {
      if (!live) return;
      setLines(seed);
      setLoading(false);
    });
    return () => { live = false; };
  }, [existing, retreatId]);

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0),
    [lines],
  );

  const nextVersion = useMemo(() => {
    if (existing) return existing.version;
    const mine = proposals.filter((p) => p.retreatId === retreatId);
    return mine.reduce((m, p) => Math.max(m, p.version), 0) + 1;
  }, [existing, proposals, retreatId]);

  function setLine(i: number, patch: Partial<RetreatInvoiceLine>) {
    setLines((xs) => xs.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function build(status: RetreatProposal['status']): RetreatProposal {
    const ts = now();
    return {
      id: existing?.id ?? generateId(),
      campId: existing?.campId ?? '',
      retreatId,
      version: nextVersion,
      lineItems: lines.filter((l) => l.description.trim() !== ''),
      total,
      validUntil: validUntil || null,
      terms: terms.trim() || null,
      intro: intro.trim() || null,
      status,
      sentAt: status === 'sent' ? (existing?.sentAt ?? ts) : existing?.sentAt ?? null,
      // viewedAt / acceptedAt are the group's to write, through the portal RPC, and are never
      // touched here. A camp that could mark its own proposal "viewed" would destroy the one
      // signal this whole table exists to carry.
      viewedAt: existing?.viewedAt ?? null,
      acceptedAt: existing?.acceptedAt ?? null,
      acceptedByName: existing?.acceptedByName ?? null,
      declinedAt: existing?.declinedAt ?? null,
      declineReason: existing?.declineReason ?? null,
      createdBy: existing?.createdBy ?? (currentUser.id || null),
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
  }

  function save(status: RetreatProposal['status']) {
    if (!canManage) return;
    const p = build(status);
    if (existing) {
      setProposals(proposals.map((x) => (x.id === p.id ? p : x)));
      void dbUpdateProposal(p);
    } else {
      setProposals([p, ...proposals]);
      void dbAddProposal(p);
    }
    onClose();
  }

  const title = existing
    ? `Proposal v${existing.version} · ${retreat?.groupName ?? ''}`
    : `New proposal${nextVersion > 1 ? ` · v${nextVersion}` : ''}`;

  return (
    <Modal title={title} onClose={onClose} width="min(680px, 94vw)">
      {retreat && (
        <p className="text-[12.5px] text-ink-soft mb-4">
          {retreat.groupName} · {fmtRange(retreat.arrivalDate, retreat.departureDate)}
          {retreat.headcount > 0 && ` · ${retreat.headcount} people`}
        </p>
      )}

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Opening</label>
          <textarea
            value={intro} onChange={(e) => setIntro(e.target.value)} rows={3}
            className={`${inputClass} resize-y`}
            placeholder="Thank you for thinking of us. Here is what a weekend for your group would look like and what it would cost."
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelClass}>Lines</label>
            {loading && (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                <Loader2 className="w-3 h-3 animate-spin" /> Building from the rate card…
              </span>
            )}
          </div>
          <div className="border border-border rounded-card divide-y divide-border">
            {lines.length === 0 && !loading && (
              <p className="px-3 py-4 text-[12.5px] text-ink-faint text-center">
                No lines yet. Add one, or set a rate on the booking first.
              </p>
            )}
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-2">
                <input
                  value={l.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                  className="flex-1 min-w-0 text-body bg-transparent px-1 py-1 focus:outline-none focus:bg-cream-dark/40 rounded"
                  placeholder="Description"
                />
                <input
                  type="number" value={Number.isFinite(l.amount) ? l.amount : 0}
                  onChange={(e) => setLine(i, { amount: Number(e.target.value) })}
                  className="w-28 text-body text-right bg-transparent px-1 py-1 tabular-nums focus:outline-none focus:bg-cream-dark/40 rounded"
                />
                <button
                  type="button" aria-label="Remove line"
                  onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}
                  className="p-1 text-ink-faint hover:text-red transition-colors flex-shrink-0"
                ><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 bg-cream-dark/40">
              <button
                type="button"
                onClick={() => setLines((xs) => [...xs, { description: '', amount: 0 }])}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-forest hover:underline"
              ><Plus className="w-3.5 h-3.5" /> Add a line</button>
              <span className="text-[14px] font-bold text-forest tabular-nums">{money(total)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Valid until</label>
            <input
              type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
              className={inputClass}
            />
            <p className="text-[11px] text-ink-soft mt-1">
              After this date they cannot accept it.
            </p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Terms</label>
          <textarea
            value={terms} onChange={(e) => setTerms(e.target.value)} rows={4}
            className={`${inputClass} resize-y`}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-2 mt-5 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="ghost" onClick={() => save('draft')} disabled={!canManage || loading}>
          Save draft
        </Button>
        <Button onClick={() => save('sent')} disabled={!canManage || loading || lines.length === 0}>
          <Send className="w-4 h-4" /> Mark sent
        </Button>
      </div>
    </Modal>
  );
}
