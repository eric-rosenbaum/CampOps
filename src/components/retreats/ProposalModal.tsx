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
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import type { RetreatInvoiceLine, RetreatProposal } from '@/lib/types';
import { dbAddProposal, dbUpdateProposal, fetchProposalLines } from '@/lib/retreatsDb';
import { generateId, parseDateStr, todayStr } from '@/lib/utils';
import { money, inputClass, labelClass, fmtRange, fmtDateFull } from './retreatUi';
import { sendEmail } from '@/lib/email';

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
  const currentCamp = useCampStore((s) => s.currentCamp);
  const setRentalDefaults = useCampStore((s) => s.setRentalDefaults);
  const { proposals, setProposals, retreatById, portalUrl } = useRetreatStore();
  const campName = currentCamp?.name ?? 'the camp';
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = retreatById(retreatId);
  const existing = proposalId ? proposals.find((p) => p.id === proposalId) ?? null : null;

  const [lines, setLines] = useState<RetreatInvoiceLine[]>(existing?.lineItems ?? []);
  const [intro, setIntro] = useState(existing?.intro ?? '');
  const [terms, setTerms] = useState(existing?.terms ?? currentCamp?.proposalTerms ?? DEFAULT_TERMS);
  const [validUntil, setValidUntil] = useState(
    existing?.validUntil ?? addDays(todayStr(), currentCamp?.proposalValidDays ?? 30));
  const [deposit, setDeposit] = useState(() => {
    const v = existing?.depositAmount ?? currentCamp?.defaultDepositAmount;
    return v != null ? String(v) : '';
  });
  const [loading, setLoading] = useState(!existing);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [termsSaved, setTermsSaved] = useState(false);

  const savedTerms = (currentCamp?.proposalTerms ?? '').trim();
  const termsIsDefault = savedTerms !== '' && terms.trim() === savedTerms;

  async function saveTermsAsDefault() {
    if (!currentCamp || !terms.trim()) return;
    await setRentalDefaults(currentCamp.id, { proposalTerms: terms.trim() });
    setTermsSaved(true);
    setTimeout(() => setTermsSaved(false), 2500);
  }

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
      // The quote records the price it was built on, so accepting can write it onto the booking
      // and every later invoice agrees with what the group actually said yes to.
      depositAmount: deposit.trim() === '' ? null : Number(deposit),
      pricingModel: retreat?.pricingModel ?? currentCamp?.defaultPricingModel ?? null,
      ratePerPersonNight: retreat?.ratePerPersonNight ?? currentCamp?.defaultRatePerPersonNight ?? null,
      flatRate: retreat?.flatRate ?? currentCamp?.defaultFlatRate ?? null,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
  }

  /** The quote as an email: the lines, the total, the deposit, and the link to accept it. */
  function proposalEmailHtml(p: RetreatProposal, url: string): string {
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const rows = p.lineItems.map((l) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e7e2d6">${esc(l.description)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e7e2d6;text-align:right;white-space:nowrap">${money(l.amount)}</td>
      </tr>`).join('');
    return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a2e1a;max-width:560px">
      <p>Hello,</p>
      <p>${esc(campName)} has put together a quote for <strong>${esc(retreat?.groupName ?? 'your stay')}</strong>${
        retreat ? `, ${esc(fmtRange(retreat.arrivalDate, retreat.departureDate))}` : ''}.</p>
      ${p.intro ? `<p>${esc(p.intro).replace(/\n/g, '<br>')}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;margin:18px 0">
        ${rows}
        <tr>
          <td style="padding:10px 0;font-weight:700">Total</td>
          <td style="padding:10px 0;text-align:right;font-weight:700">${money(p.total)}</td>
        </tr>
        ${p.depositAmount ? `<tr>
          <td style="padding:2px 0;color:#5a6b5a">Deposit to hold the dates</td>
          <td style="padding:2px 0;text-align:right;color:#5a6b5a">${money(p.depositAmount)}</td>
        </tr>` : ''}
      </table>
      ${p.validUntil ? `<p style="color:#5a6b5a;font-size:13px">This quote stands until ${esc(fmtDateFull(p.validUntil))}.</p>` : ''}
      <p style="margin:24px 0">
        <a href="${url}" style="background:#2f4f2f;color:#fdfcf7;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">
          Review and accept
        </a>
      </p>
      ${p.terms ? `<p style="font-size:13px;color:#5a6b5a;border-top:1px solid #e7e2d6;padding-top:14px">${esc(p.terms).replace(/\n/g, '<br>')}</p>` : ''}
    </div>`;
  }

  /** Save it as sent, then actually send it. */
  async function sendToGroup() {
    if (!canManage || !retreat) return;
    const to = retreat.coordinatorEmail?.trim();
    if (!to) {
      setSendResult({ ok: false, text: 'No coordinator email on this booking. Add one under Contacts.' });
      return;
    }
    setSending(true);
    setSendResult(null);
    const p = build('sent');
    if (existing) { setProposals(proposals.map((x) => (x.id === p.id ? p : x))); await dbUpdateProposal(p); }
    else { setProposals([p, ...proposals]); await dbAddProposal(p); }

    const res = await sendEmail({
      to,
      subject: `Your quote from ${campName}`,
      html: proposalEmailHtml(p, portalUrl(retreat)),
      fromName: campName,
      replyTo: currentUser.email || undefined,
    });
    setSending(false);
    if (!res.ok) {
      // The proposal is saved and marked sent either way; only the email failed, and saying so
      // beats leaving the camp to guess whether the group got it.
      setSendResult({ ok: false, text: `Saved, but the email did not go: ${res.error}` });
      return;
    }
    setSendResult({ ok: true, text: `Sent to ${to}.` });
    setTimeout(onClose, 1200);
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
            <label className={labelClass}>Deposit to hold the dates</label>
            <input
              inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)}
              className={inputClass} placeholder="0"
            />
            <p className="text-[11px] text-ink-soft mt-1">
              Set on the booking when they accept.
            </p>
          </div>
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
          <div className="flex items-baseline justify-between gap-2">
            <label className={labelClass}>Terms</label>
            {/* Written once, reused. Same affordance the invoice note already has. */}
            {!termsIsDefault && (
              <button
                type="button"
                onClick={saveTermsAsDefault}
                className="text-[11.5px] font-semibold text-forest underline"
              >
                {termsSaved ? 'Saved as your default' : 'Save as our default'}
              </button>
            )}
          </div>
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
        <Button variant="ghost" onClick={() => save('sent')} disabled={!canManage || loading || lines.length === 0}>
          Mark sent
        </Button>
        <Button onClick={sendToGroup} disabled={!canManage || loading || sending || lines.length === 0}>
          <Send className="w-4 h-4" /> {sending ? 'Sending…' : 'Send to the group'}
        </Button>
      </div>
      {sendResult && (
        <p className={`text-[12.5px] mt-2 text-right ${sendResult.ok ? 'text-green-muted-text' : 'text-red-text'}`}>
          {sendResult.text}
        </p>
      )}
    </Modal>
  );
}
