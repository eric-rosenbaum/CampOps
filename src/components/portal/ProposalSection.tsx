// The proposal, in the group's own portal, with one button on it.
//
// Reading it here is what writes `viewed_at` — the RPC marks it as a side effect, which is the
// entire reason the camp can tell the difference between "they are thinking about it" and "that
// email went to the wrong address". Accepting takes a typed name and nothing else: a coordinator
// on a phone should not need an account, a password or a PDF reader to say yes.
import { useEffect, useState } from 'react';
import { FileText, Check, Loader2, AlertTriangle } from 'lucide-react';
import { supabasePublic, cardClass, inputClass, labelClass, btnPrimary } from '@/pages/portal/portalShared';
import { AgreementDownloadButton, type PortalProposal } from './SignedAgreement';
import { DocumentFrame } from '@/components/shared/DocumentFrame';
import { agreementHtml } from '@/lib/agreementHtml';
import { fmtDateFull } from '@/components/retreats/retreatUi';
import { todayStr } from '@/lib/utils';

/**
 * `accepted_at` is an instant, not a calendar day, so it is formatted from the timestamp rather
 * than sliced to ten characters — slicing a UTC stamp reports tomorrow from 8pm Eastern onwards.
 */
function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

interface Props {
  token: string;
  /** Called after a successful accept, so the page can reload the rest of the booking. */
  onAccepted?: () => void;
  /** True when this group has an agreement to sign; signing it is what accepts the quote. */
  hasAgreement?: boolean;
  /** Take them to the documents section, where the agreement is. */
  onGoToAgreement?: () => void;
  /** The agreement text itself, so they can read what the button commits them to. */
  agreementBody?: string | null;
}

export function ProposalSection({ token, onAccepted, hasAgreement, onGoToAgreement, agreementBody }: Props) {
  const [proposal, setProposal] = useState<PortalProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reading it here is the side effect that matters: `portal_proposal` stamps `viewed_at`. The
  // guarded async continuation keeps setState out of the effect body itself.
  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabasePublic.rpc('portal_proposal', { p_token: token });
      if (!live) return;
      setProposal((data as PortalProposal | null) ?? null);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [token]);

  async function accept() {
    if (!proposal || !name.trim()) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabasePublic.rpc('portal_accept_proposal', {
      p_token: token, p_proposal_id: proposal.id, p_name: name.trim(),
    });
    setSaving(false);
    if (err) {
      // The RPC raises the human sentence itself (expired, wrong booking, empty name), so it is
      // shown as written rather than translated into something vaguer.
      setError(err.message || 'That could not be accepted. Please contact the camp.');
      return;
    }
    const { data } = await supabasePublic.rpc('portal_proposal', { p_token: token });
    setProposal((data as PortalProposal | null) ?? null);
    onAccepted?.();
  }

  // Nothing sent yet is not an error state — most of a booking's life has no live proposal.
  if (loading || !proposal) return null;

  const expired = Boolean(
    proposal.valid_until && proposal.valid_until < todayStr() && proposal.status !== 'accepted',
  );
  const accepted = proposal.status === 'accepted';

  /** The agreement, exactly as it prints and exactly as they will download it. */
  const documentHtml = agreementHtml({
    campName: proposal.camp_name ?? '',
    groupName: proposal.group_name,
    coordinatorName: proposal.coordinator_name,
    version: proposal.version,
    arrivalDate: proposal.arrival,
    departureDate: proposal.departure,
    headcount: proposal.headcount,
    lineItems: proposal.line_items ?? [],
    total: proposal.total,
    intro: proposal.intro,
    // The prop is the same text by another route; the proposal's own copy is the frozen one.
    agreementBody: proposal.agreement_body ?? agreementBody ?? null,
    terms: proposal.terms,
    validUntil: proposal.valid_until,
    signedBy: accepted ? proposal.accepted_by_name : null,
    signedAt: accepted ? proposal.accepted_at : null,
  });

  return (
    <section id="proposal" className="scroll-mt-20">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-sage-pale text-forest flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-forest leading-tight">Your retreat agreement</h2>
          <p className="text-[12px] text-ink-soft leading-tight">
            {proposal.version > 1 ? `Version ${proposal.version} · ` : ''}
            {proposal.valid_until ? `Valid until ${fmtDateFull(proposal.valid_until)}` : 'No expiry date'}
          </p>
        </div>
      </div>

      {/* ── The document ──
          Not a summary of the agreement and a box of contract text underneath it: the agreement,
          rendered by the same `agreementHtml` the camp prints and the group downloads. The price,
          the terms and the wording were three separate panels saying three parts of one document,
          and the part that legally mattered was in a monospaced scroll box that read like a
          terminal. */}
      <DocumentFrame html={documentHtml} title="Your retreat agreement" minHeight={420} className="mb-3" />

      <div className={cardClass}>
        {accepted ? (
          /* Signed, and still here. The checklist used to drop this step the instant it was
             accepted, which took the contract off the page at the exact moment the group had
             just agreed to it -- and the line under it told them to ask the camp for a copy of
             something this page was already holding. */
          <div className="px-5 py-4 bg-green-muted-bg rounded-2xl">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-green-muted-text">
              <Check className="w-4 h-4" /> Signed
              {proposal.accepted_by_name && ` by ${proposal.accepted_by_name}`}
              {proposal.accepted_at && ` on ${fmtStamp(proposal.accepted_at)}`}
            </p>
            <p className="text-[13px] text-green-muted-text mt-1">
              Thank you — your booking is confirmed. Keep a copy for your records.
            </p>
            <div className="mt-3">
              <AgreementDownloadButton proposal={proposal} />
            </div>
          </div>
        ) : expired ? (
          // Never let someone accept a price the camp is no longer offering. Saying so plainly,
          // with what to do next, beats a disabled button with no explanation.
          <div className="px-5 py-4 bg-amber-bg rounded-2xl">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-amber-text">
              <AlertTriangle className="w-4 h-4" /> This agreement has expired
            </p>
            <p className="text-[13px] text-amber-text mt-1">
              It was valid until {fmtDateFull(proposal.valid_until)}. Please ask the camp for a new
              one — they can send an updated version to this same link.
            </p>
          </div>
        ) : (
          hasAgreement ? (
          /* An agreement is the stronger act of agreement -- an emailed code, an IP, a hash of
             the file -- so it is the one that counts. Typing a name into a second box days later
             added nothing and left the camp checking two places to know it had a booking. */
          <div className="px-5 py-4">
            <p className="text-[13px] text-ink leading-relaxed">
              To accept this, sign the retreat agreement in your documents. Signing it is what
              confirms the quote — there is nothing else to send back.
            </p>
            <button
              type="button"
              onClick={onGoToAgreement}
              className={`${btnPrimary} w-full mt-3`}
            >
              <FileText className="w-4 h-4" /> Go to the agreement
            </button>
          </div>
          ) : (
          <div className="px-5 py-4">
            <label className={labelClass} htmlFor="proposal-accept-name">Type your name to accept</label>
            <input
              id="proposal-accept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Your full name"
              autoComplete="name"
            />
            <button
              type="button"
              onClick={accept}
              disabled={!name.trim() || saving}
              className={`${btnPrimary} w-full mt-3`}
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Accepting…</>
                : <><Check className="w-4 h-4" /> Sign and confirm the booking</>}
            </button>
            <p className="text-[12px] text-ink-soft mt-2 text-center">
              Typing your name signs the agreement above and confirms your booking. You can
              download a copy from here afterwards.
            </p>
            {error && <p className="text-[13px] text-red mt-2 text-center">{error}</p>}
          </div>
          )
        )}
      </div>
    </section>
  );
}
