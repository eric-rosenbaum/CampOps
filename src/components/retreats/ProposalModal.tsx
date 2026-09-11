// Build the document that wins the booking.
//
// The lines are built for you from the rate card and whatever charges already exist, because
// asking a director to retype "48 people × 2 nights @ $85" is how proposals end up going out as
// a paragraph in an email instead. Everything stays editable — the generated lines are a
// starting point, not a contract.
import { useEffect, useMemo, useState } from 'react';
import { FileSignature, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import type { RetreatInvoiceLine, RetreatProposal } from '@/lib/types';
import { dbAddProposal, dbUpdateProposal, fetchProposalLines, dbAttachAgreementFromTemplate } from '@/lib/retreatsDb';
import { generateId, parseDateStr, todayStr } from '@/lib/utils';
import { money, inputClass, labelClass, fmtRange, nights as nightsBetween } from './retreatUi';
import { sendEmail } from '@/lib/email';
import { proposalEmailHtml } from './proposalEmail';

const now = () => new Date().toISOString();

/**
 * The rate-card line, which is derived rather than typed.
 *
 * It is stored in line_items so the document, the invoice and the portal all read the same
 * arithmetic -- but the editor computes it from the three inputs, so it has to be lifted back
 * out when an existing quote is reopened or it would be counted twice.
 */
const BASE_LINE = /people\s*×.*night.*@.*\/person\/night/i;
const withoutBase = (xs: RetreatInvoiceLine[]) => xs.filter((l) => !BASE_LINE.test(l.description));

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
  const { proposals, setProposals, retreatById, portalUrl, openModal } = useRetreatStore();
  const campName = currentCamp?.name ?? 'the camp';
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = retreatById(retreatId);
  /**
   * The agreement that goes out with this quote.
   *
   * A proposal and its agreement are one send -- the quote says what it costs and the agreement is
   * what makes it binding, and signing the agreement is how the group accepts. Which one is going
   * belongs HERE, at the moment of sending, not on a documents tab somebody has to know to open.
   *
   * Three cases, in order of precedence: this group has their own uploaded (negotiated terms win),
   * else the camp's standing template attaches itself on send, else there is none and the camp
   * should be told rather than left to find out from the group.
   */
  const agreementDoc = useRetreatStore((s) => s.documents)
    .find((d) => d.retreatId === retreatId && d.docType === 'agreement');
  const campTemplateName = useCampStore((s) => s.currentCamp?.agreementTemplateName) ?? null;
  const hasAgreement = Boolean(agreementDoc) || Boolean(campTemplateName);
  const existing = proposalId ? proposals.find((p) => p.id === proposalId) ?? null : null;

  /**
   * A per-person quote is three numbers and everything else is an extra.
   *
   * `lines` used to be the whole quote, each amount typed freely, which is how a proposal ended
   * up saying "50 people × 3 nights @ $120" beside a total that was not 50 × 3 × 120. The base
   * is now derived from the three inputs and cannot be typed over; `lines` keeps only the
   * extras and discounts, which genuinely are free-form.
   */
  const perPerson = (retreat?.pricingModel ?? 'per_person_night') === 'per_person_night';
  const [rate, setRate] = useState(() =>
    String(existing?.ratePerPersonNight ?? retreat?.ratePerPersonNight
      ?? currentCamp?.defaultRatePerPersonNight ?? ''));
  const [people, setPeople] = useState(() =>
    String(existing?.peopleCount ?? retreat?.finalHeadcount ?? retreat?.headcount ?? ''));
  const [nights, setNights] = useState(() =>
    String(existing?.nights ?? nightsBetween(retreat?.arrivalDate ?? null, retreat?.departureDate ?? null)));

  const [lines, setLines] = useState<RetreatInvoiceLine[]>(
    perPerson ? withoutBase(existing?.lineItems ?? []) : (existing?.lineItems ?? []));
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
      setLines(perPerson ? withoutBase(seed) : seed);
      setLoading(false);
    });
    return () => { live = false; };
  }, [existing, retreatId, perPerson]);

  const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const base = useMemo(
    () => (perPerson ? num(rate) * num(people) * num(nights) : 0),
    [perPerson, rate, people, nights],
  );
  const baseLabel = `${num(people)} people × ${num(nights)} night${num(nights) === 1 ? '' : 's'} @ ${money(num(rate))}/person/night`;

  const extras = useMemo(
    () => lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0),
    [lines],
  );
  const total = useMemo(() => base + extras, [base, extras]);

  /**
   * Is there a quote here to send?
   *
   * NOT `lines.length` -- that was right when `lines` was the whole quote, and stopped being
   * right when per-person pricing became three inputs and the base line was stripped out of the
   * array. A straight rate quote with no add-ons is the commonest proposal there is, and it had
   * an empty `lines`, so Send and Mark sent greyed out on a perfectly good $18,000 booking.
   */
  const quotable = total > 0 || lines.length > 0;

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
      // The derived base rides along as the first line so the document, the invoice and the
      // portal all read the same arithmetic without recomputing it three times.
      lineItems: [
        ...(perPerson && base > 0 ? [{ description: baseLabel, amount: base }] : []),
        ...lines.filter((l) => l.description.trim() !== ''),
      ],
      total,
      peopleCount: perPerson ? num(people) : null,
      nights: perPerson ? num(nights) : null,
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
      // The rate the camp actually quoted, not the booking's. Accepting this writes it onto
      // the booking, so reading it back off the booking made the edit a no-op.
      ratePerPersonNight: perPerson
        ? (rate.trim() === '' ? null : num(rate))
        : (retreat?.ratePerPersonNight ?? currentCamp?.defaultRatePerPersonNight ?? null),
      flatRate: retreat?.flatRate ?? currentCamp?.defaultFlatRate ?? null,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
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

    // The quote and the thing that makes it binding travel together. If the camp keeps an
    // agreement on file and this group has none, they get it now -- signing it is what accepts
    // the quote, so sending one without the other asks them to agree to nothing.
    const agreementId = await dbAttachAgreementFromTemplate(retreatId);

    const res = await sendEmail({
      to,
      subject: `Your quote from ${campName}`,
      html: proposalEmailHtml(p, retreat, campName, portalUrl(retreat), Boolean(agreementId) || hasAgreement),
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
          {/* The price, as three numbers. The camp used to be able to type any total it liked
              beside the arithmetic that was supposed to produce it, and the two disagreed on
              the document the group signs. */}
          {perPerson && (
            <div className="border border-border rounded-card px-3 py-3 mb-2">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className={labelClass}>Rate</label>
                  <input
                    inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)}
                    className={inputClass} placeholder="0"
                  />
                  <p className="text-[10.5px] text-ink-soft mt-1">per person per night</p>
                </div>
                <div>
                  <label className={labelClass}>People</label>
                  <input
                    inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)}
                    className={inputClass} placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelClass}>Nights</label>
                  <input
                    inputMode="numeric" value={nights} onChange={(e) => setNights(e.target.value)}
                    className={inputClass} placeholder="0"
                  />
                </div>
              </div>
              <div className="flex items-baseline justify-between mt-2.5 pt-2.5 border-t border-border">
                <span className="text-[12.5px] text-ink-soft">{baseLabel}</span>
                <span className="text-[13.5px] font-semibold text-forest tabular-nums">{money(base)}</span>
              </div>
            </div>
          )}

          <div className="border border-border rounded-card divide-y divide-border">
            {lines.length === 0 && !loading && (
              <p className="px-3 py-4 text-[12.5px] text-ink-faint text-center">
                {perPerson
                  ? 'No extras. Add a line for firewood, a discount, anything outside the rate.'
                  : 'No lines yet. Add one, or set a rate on the booking first.'}
              </p>
            )}
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-2">
                <input
                  value={l.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                  className="flex-1 min-w-0 text-body bg-transparent px-1 py-1 focus:outline-none focus:bg-cream-dark/40 rounded"
                  placeholder={perPerson ? 'Firewood bundle, shoulder-week discount…' : 'Description'}
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
              ><Plus className="w-3.5 h-3.5" /> {perPerson ? 'Add an extra or a discount' : 'Add a line'}</button>
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

      {/* ── What is actually going in the envelope ── */}
      <div className="mt-5 rounded-card border border-border bg-cream px-4 py-3.5">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-soft">
          Going with this quote
        </p>
        {agreementDoc ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <FileSignature className="h-4 w-4 flex-shrink-0 text-forest" />
            <span className="text-[13px] font-semibold text-forest">Retreat agreement</span>
            <span className="min-w-0 truncate text-[12px] text-ink-soft">{agreementDoc.name}</span>
            {canManage && (
              <button
                onClick={() => openModal({ kind: 'uploadDoc', retreatId, docType: 'agreement' })}
                className="text-[12px] font-semibold text-forest hover:text-forest-mid"
              >
                Use a different one
              </button>
            )}
          </div>
        ) : campTemplateName ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <FileSignature className="h-4 w-4 flex-shrink-0 text-forest" />
            <span className="text-[13px] font-semibold text-forest">Retreat agreement</span>
            <span className="min-w-0 truncate text-[12px] text-ink-soft">
              {campTemplateName} — your standard one, attached when you send
            </span>
            {canManage && (
              <button
                onClick={() => openModal({ kind: 'uploadDoc', retreatId, docType: 'agreement' })}
                className="text-[12px] font-semibold text-forest hover:text-forest-mid"
              >
                Use a different one for this group
              </button>
            )}
          </div>
        ) : (
          <div className="mt-1.5">
            <p className="text-[12.5px] leading-relaxed text-amber-text">
              No agreement will go with this quote. Signing the agreement is how a group accepts,
              so this sends a price with nothing to sign.
            </p>
            {canManage && (
              <button
                onClick={() => openModal({ kind: 'uploadDoc', retreatId, docType: 'agreement' })}
                className="mt-1 text-[12px] font-semibold text-forest hover:text-forest-mid"
              >
                Attach one for this group
              </button>
            )}
            <p className="mt-1 text-[11px] text-ink-faint">
              Keep a standard one under Camp Info &rsaquo; Rentals and it goes with every proposal.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-2 mt-5 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="ghost" onClick={() => save('draft')} disabled={!canManage || loading}>
          Save draft
        </Button>
        <Button variant="ghost" onClick={() => save('sent')} disabled={!canManage || loading || !quotable}>
          Mark sent
        </Button>
        <Button onClick={sendToGroup} disabled={!canManage || loading || sending || !quotable}>
          <Send className="w-4 h-4" />
          {sending ? 'Sending…' : hasAgreement ? 'Send quote and agreement' : 'Send quote'}
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
