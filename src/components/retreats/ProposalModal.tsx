// Build the document the group signs.
//
// The lines are built for you from the rate card and whatever charges already exist, because
// asking a director to retype "48 people × 2 nights @ $85" is how agreements end up going out as
// a paragraph in an email instead. Everything stays editable — the generated lines are a
// starting point, not a contract.
//
// The page is the numbers on the left and the document on the right, and the document is the
// real one: the same `agreementHtml` that prints and that the group downloads, in an iframe. It
// used to be a stack of form fields with the contract itself folded away behind a "Read and
// edit" button at the bottom, so the usual way to send one was without having looked at it.
//
// "Opening" and "Terms" are gone. They were a second and third place to write contract language,
// competing with the camp's own agreement wording — three boxes, and the one that legally
// mattered was the one you had to expand.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSignature, Loader2, Plus, Send, Trash2, Pencil, Eye } from 'lucide-react';
import { MissingBookingDetails } from './MissingBookingDetails';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import type { RetreatInvoiceLine, RetreatProposal } from '@/lib/types';
import { dbAddProposal, dbUpdateProposal, fetchProposalLines, dbAgreementForRetreat } from '@/lib/retreatsDb';
import { agreementHtml } from '@/lib/agreementHtml';
import { DocumentFrame } from '@/components/shared/DocumentFrame';
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

interface Props {
  retreatId: string;
  /** Editing an existing draft. Sent agreements are never edited — a change is a new version. */
  proposalId?: string;
  onClose: () => void;
}

export function ProposalModal({ retreatId, proposalId, onClose }: Props) {
  const currentCamp = useCampStore((s) => s.currentCamp);
  const { proposals, setProposals, retreatById, portalUrl } = useRetreatStore();
  const campName = currentCamp?.name ?? 'the camp';
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = retreatById(retreatId);
  /**
   * The agreement that goes out with this quote.
   *
   * A quote and its agreement are one send -- the document says what it costs and what the terms
   * are, and signing it is how the group accepts.
   *
   * Two cases: this group has their own uploaded file (negotiated terms win), else the camp's
   * standing template is rendered with this booking's details below.
   */
  const agreementDoc = useRetreatStore((s) => s.documents)
    .find((d) => d.retreatId === retreatId && d.docType === 'agreement');
  const existing = proposalId ? proposals.find((p) => p.id === proposalId) ?? null : null;

  const campTemplateBody = useCampStore((s) => s.currentCamp?.agreementTemplateBody) ?? null;
  const hasAgreement = Boolean(agreementDoc) || Boolean(campTemplateBody);

  /**
   * The agreement this group will actually receive.
   *
   * Rendered from the camp's template with this booking's details, then EDITABLE -- a camp that
   * has negotiated something for one group changes it here, and what is stored is what was sent
   * rather than what the template happens to say later.
   */
  const [agreementText, setAgreementText] = useState<string | null>(existing?.agreementBody ?? null);
  const [unfilled, setUnfilled] = useState<string[]>([]);
  const [editingWording, setEditingWording] = useState(false);
  const [rendering, setRendering] = useState(false);
  /**
   * Once the camp types in the document, the template stops driving it.
   *
   * Otherwise changing the rate afterwards would silently throw away wording somebody wrote by
   * hand into a contract, which is the single worst thing this screen could do.
   */
  const [handEdited, setHandEdited] = useState(Boolean(existing?.agreementBody));

  /**
   * Every gap this document has EVER had, in the order they appeared.
   *
   * The fields used to be driven straight off `unfilled`, so filling one made its own box vanish
   * under the cursor -- no confirmation, no way to check what you typed, and the remaining boxes
   * jumped up a row each time. They stay now, and show a tick instead.
   */
  const [gapTokens, setGapTokens] = useState<string[]>([]);
  /** Bumped when a gap is filled on the booking, to ask the server for the document again. */
  const [renderNonce, setRenderNonce] = useState(0);

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
  const [validUntil, setValidUntil] = useState(
    existing?.validUntil ?? addDays(todayStr(), currentCamp?.proposalValidDays ?? 30));
  const [deposit, setDeposit] = useState(() => {
    const v = existing?.depositAmount ?? currentCamp?.defaultDepositAmount;
    return v != null ? String(v) : '';
  });
  const [loading, setLoading] = useState(!existing);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Seed a new agreement from the rate card. One round trip, in Postgres, so the arithmetic
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
   * array. A straight rate quote with no add-ons is the commonest agreement there is, and it had
   * an empty `lines`, so Send and Mark sent greyed out on a perfectly good $18,000 booking.
   */
  const quotable = total > 0 || lines.length > 0;

  /**
   * Re-render the agreement whenever the money on this screen changes.
   *
   * It used to render exactly once. Edit the rate afterwards and the document still carried the
   * old total, in the sentence the group signs — the two halves of the same screen disagreed
   * about the price. Debounced, because these are text inputs.
   */
  const moneyKey = `${total}|${num(deposit)}|${perPerson ? num(rate) : ''}|${num(people)}|${num(nights)}`;
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!campTemplateBody || handEdited) return;
    let live = true;
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(() => {
      void (async () => {
        setRendering(true);
        // The figures on THIS screen, not whatever an earlier accepted version said.
        const cents = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const r = await dbAgreementForRetreat(retreatId, campTemplateBody, {
          total: total > 0 ? `$${cents(total)}` : null,
          deposit: num(deposit) > 0 ? `$${cents(num(deposit))}` : null,
          // Flat pricing has no field in this composer; the server token derives it from the
          // booking, so leave it alone rather than blanking it.
          rate: perPerson && num(rate) > 0 ? `$${cents(num(rate))} per person per night` : null,
          headcount: num(people) > 0 ? String(num(people)) : null,
          nights: num(nights) > 0 ? String(num(nights)) : null,
        });
        if (!live || !r) { setRendering(false); return; }
        setAgreementText(r.body);
        setUnfilled(r.unfilled);
        setGapTokens((prev) => [...prev, ...r.unfilled.filter((t) => !prev.includes(t))]);
        setRendering(false);
      })();
    }, 400);
    return () => { live = false; if (renderTimer.current) clearTimeout(renderTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retreatId, campTemplateBody, handEdited, moneyKey, renderNonce]);

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
      agreementBody: agreementText,
      peopleCount: perPerson ? num(people) : null,
      nights: perPerson ? num(nights) : null,
      validUntil: validUntil || null,
      // The agreement wording IS the terms and the covering note now. Two more boxes of contract
      // language beside it meant three places to say the same thing and no answer to which won.
      terms: null,
      intro: null,
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
    // Any token still unfilled becomes a blank line. The camp was shown these and chose to send
    // anyway, which is their call -- but a group reading "{{coordinator_phone}}" in a contract is
    // being shown our internals, and a ruled blank is what a paper form would have had there.
    const p = build('sent');
    if (p.agreementBody) p.agreementBody = p.agreementBody.replace(/\{\{[a-z_]+\}\}/g, '__________');
    if (existing) { setProposals(proposals.map((x) => (x.id === p.id ? p : x))); await dbUpdateProposal(p); }
    else { setProposals([p, ...proposals]); await dbAddProposal(p); }

    // The agreement travels WITH the quote because it is the same document: agreement_body was
    // rendered, reviewed and stored above, and the group reads and signs it in their portal.

    const res = await sendEmail({
      to,
      subject: `Your retreat agreement from ${campName}`,
      html: proposalEmailHtml(p, retreat, campName, portalUrl(retreat), Boolean(agreementText) || hasAgreement),
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

  /** The document, exactly as it will print and exactly as the group will download it. */
  const previewHtml = useMemo(() => agreementHtml({
    campName: currentCamp?.name ?? '',
    groupName: retreat?.groupName ?? '',
    coordinatorName: retreat?.coordinatorName,
    version: nextVersion,
    arrivalDate: retreat?.arrivalDate,
    departureDate: retreat?.departureDate,
    dateNote: retreat?.dateFlexibility,
    headcount: perPerson ? num(people) : retreat?.headcount,
    lineItems: [
      ...(perPerson && base > 0 ? [{ description: baseLabel, amount: base }] : []),
      ...lines.filter((l) => l.description.trim() !== ''),
    ],
    total,
    agreementBody: agreementText,
    validUntil: validUntil || null,
    highlightGaps: true,
  }), [currentCamp?.name, retreat, nextVersion, perPerson, people, base, baseLabel, lines, total, agreementText, validUntil]);

  const title = existing
    ? `Retreat agreement v${existing.version} · ${retreat?.groupName ?? ''}`
    : `New agreement${nextVersion > 1 ? ` · v${nextVersion}` : ''}`;

  /* The document below is a contract and therefore long. The send button used to sit past the end
     of it, so the way to find out how to send was to scroll the whole agreement looking. */
  const footer = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="ghost" onClick={() => save('draft')} disabled={!canManage || loading}>
          Save draft
        </Button>
        <Button variant="ghost" onClick={() => save('sent')} disabled={!canManage || loading || !quotable}>
          Mark sent
        </Button>
        <Button onClick={sendToGroup} disabled={!canManage || loading || sending || !quotable}>
          <Send className="h-4 w-4" />
          {sending ? 'Sending…' : agreementText || hasAgreement ? 'Send the agreement' : 'Send without an agreement'}
        </Button>
      </div>
      {sendResult && (
        <p className={`text-right text-[12.5px] ${sendResult.ok ? 'text-green-muted-text' : 'text-red-text'}`}>
          {sendResult.text}
        </p>
      )}
    </div>
  );

  return (
    <Modal title={title} onClose={onClose} width="min(1120px, 96vw)" footer={footer}>
      {retreat && (
        <p className="mb-4 text-[12.5px] text-ink-soft">
          {retreat.groupName} · {fmtRange(retreat.arrivalDate, retreat.departureDate)}
          {retreat.headcount > 0 && ` · ${retreat.headcount} people`}
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* ── What it costs ──
            The numbers, on their own, beside the document they appear in. */}
        <div className="space-y-4 lg:sticky lg:top-0 lg:z-10 lg:bg-white lg:pb-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={labelClass}>What it costs</label>
              {loading && (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                  <Loader2 className="h-3 w-3 animate-spin" /> Building…
                </span>
              )}
            </div>

            {/* The price, as three numbers. The camp used to be able to type any total it liked
                beside the arithmetic that was supposed to produce it, and the two disagreed on
                the document the group signs. */}
            {perPerson && (
              <div className="mb-2 rounded-card border border-border px-3 py-3">
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className={labelClass}>Rate</label>
                    <input
                      inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)}
                      className={inputClass} placeholder="0"
                    />
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
                <p className="mt-1 text-[10.5px] text-ink-soft">per person per night</p>
                <div className="mt-2.5 flex items-baseline justify-between border-t border-border pt-2.5">
                  <span className="text-[12.5px] text-ink-soft">{baseLabel}</span>
                  <span className="text-[13.5px] font-semibold tabular-nums text-forest">{money(base)}</span>
                </div>
              </div>
            )}

            <div className="divide-y divide-border rounded-card border border-border">
              {lines.length === 0 && !loading && (
                <p className="px-3 py-3.5 text-center text-[12px] text-ink-faint">
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
                    className="min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-body focus:bg-cream-dark/40 focus:outline-none"
                    placeholder={perPerson ? 'Firewood, shoulder-week discount…' : 'Description'}
                  />
                  <input
                    type="number" value={Number.isFinite(l.amount) ? l.amount : 0}
                    onChange={(e) => setLine(i, { amount: Number(e.target.value) })}
                    className="w-20 rounded bg-transparent px-1 py-1 text-right text-body tabular-nums focus:bg-cream-dark/40 focus:outline-none"
                  />
                  <button
                    type="button" aria-label="Remove line"
                    onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}
                    className="flex-shrink-0 p-1 text-ink-faint transition-colors hover:text-red"
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <div className="flex items-center justify-between bg-cream-dark/40 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setLines((xs) => [...xs, { description: '', amount: 0 }])}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-forest hover:underline"
                ><Plus className="h-3.5 w-3.5" /> {perPerson ? 'Add an extra' : 'Add a line'}</button>
                <span className="text-[14px] font-bold tabular-nums text-forest">{money(total)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Deposit</label>
              <input
                inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)}
                className={inputClass} placeholder="0"
              />
              <p className="mt-1 text-[11px] text-ink-soft">Holds the dates.</p>
            </div>
            <div>
              <label className={labelClass}>Valid until</label>
              <input
                type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-ink-soft">Then they cannot accept.</p>
            </div>
          </div>
        </div>

        {/* ── The document ──
            Not a preview of the document: the document. Same renderer as the print button and
            the group's own download, so what is on this screen is what lands in their inbox. */}
        <div className="mt-6 lg:mt-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-forest" />
              <span className={labelClass} style={{ marginBottom: 0 }}>The agreement</span>
              {rendering && <Loader2 className="h-3 w-3 animate-spin text-ink-faint" />}
            </div>
            {agreementText && (
              <button
                type="button"
                onClick={() => setEditingWording((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-btn border border-border px-2.5 py-1.5
                           text-[12.5px] font-semibold text-forest transition-colors hover:border-sage"
              >
                {editingWording
                  ? <><Eye className="h-3.5 w-3.5" /> Done editing</>
                  : <><Pencil className="h-3.5 w-3.5" /> Edit the wording</>}
              </button>
            )}
          </div>

          {/* The gaps, as the fields that close them, above the document they are gaps in. */}
          {gapTokens.length > 0 && retreat && (
            <MissingBookingDetails
              retreat={retreat}
              tokens={gapTokens}
              unfilled={unfilled}
              onFilled={() => setRenderNonce((n) => n + 1)}
            />
          )}

          {agreementText ? (
            editingWording ? (
              <textarea
                value={agreementText}
                onChange={(e) => { setAgreementText(e.target.value); setHandEdited(true); }}
                className="h-[540px] w-full resize-y rounded-card border border-border bg-cream px-4 py-3.5
                           font-mono text-[12px] leading-relaxed text-ink focus:border-sage focus:outline-none"
              />
            ) : (
              <DocumentFrame html={previewHtml} title="Retreat agreement" minHeight={480} />
            )
          ) : (
            <div className="rounded-card border border-amber/40 bg-amber-bg/50 px-4 py-5">
              <p className="text-[12.5px] leading-relaxed text-amber-text">
                You have no agreement on file, so this sends a price with nothing to sign. Write
                one under Camp Info &rsaquo; Rentals and every booking gets it, filled in.
              </p>
            </div>
          )}

          {handEdited && !existing?.agreementBody && (
            <p className="mt-1.5 text-[11px] text-ink-soft">
              You have edited this copy by hand, so changing the numbers no longer rewrites it.
              Your template is untouched.
            </p>
          )}
        </div>
      </div>

    </Modal>
  );
}
