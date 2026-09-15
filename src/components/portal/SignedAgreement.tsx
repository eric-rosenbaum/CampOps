// The group's own copy of what they signed.
//
// Signing the agreement used to make it disappear: the checklist drops the step the moment it is
// accepted, and the agreement is not a `retreat_documents` row, so it was in neither the to-do
// list nor Your documents. The one paper a group is actually bound by was the one paper they
// could not get back, and the portal's own advice was "keep a copy, your camp can send you one".
//
// So the signed agreement stays, in two places: as a finished row on the checklist where they
// signed it, and in Your documents where somebody looks for it three months later.
import { useEffect, useState } from 'react';
import { FileCheck2, Download, ChevronRight, Loader2 } from 'lucide-react';
import { supabasePublic, cardClass } from '@/pages/portal/portalShared';
import { agreementHtml, printAgreement, type AgreementRenderData } from '@/lib/agreementHtml';
import { DocumentFrame } from '@/components/shared/DocumentFrame';

export interface PortalProposal {
  id: string;
  version: number;
  line_items: { description: string; amount: number }[];
  total: number;
  valid_until: string | null;
  terms: string | null;
  intro: string | null;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
  accepted_at: string | null;
  group_name: string;
  arrival: string | null;
  departure: string | null;
  // ── Added so the group can print what they signed ──
  agreement_body: string | null;
  accepted_by_name: string | null;
  camp_name: string | null;
  coordinator_name: string | null;
  headcount: number | null;
}

/** "September 14, 2026 at 4:04 PM" — an instant, formatted from the timestamp, never sliced. */
function fmtSignedAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function toAgreementRender(p: PortalProposal): AgreementRenderData {
  return {
    campName: p.camp_name ?? '',
    groupName: p.group_name,
    coordinatorName: p.coordinator_name,
    version: p.version,
    arrivalDate: p.arrival,
    departureDate: p.departure,
    headcount: p.headcount,
    lineItems: p.line_items ?? [],
    total: p.total,
    intro: p.intro,
    agreementBody: p.agreement_body,
    terms: p.terms,
    validUntil: p.valid_until,
    signedBy: p.status === 'accepted' ? p.accepted_by_name : null,
    signedAt: p.status === 'accepted' ? p.accepted_at : null,
  };
}

/**
 * Download is a print window, the same one the invoices use. A pop-up blocker is the only way
 * this fails, and it fails silently, so the refusal has to be said out loud.
 */
export function AgreementDownloadButton({ proposal, className = '', label = 'Download your signed agreement' }: {
  proposal: PortalProposal;
  className?: string;
  label?: string;
}) {
  const [blocked, setBlocked] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setBlocked(!printAgreement(toAgreementRender(proposal)))}
        className={className || 'inline-flex items-center justify-center gap-2 bg-white border border-border text-forest text-[13px] font-semibold rounded-xl px-4 py-2.5 hover:bg-cream transition-colors'}
      >
        <Download className="w-4 h-4" /> {label}
      </button>
      {blocked && (
        <p className="text-[12px] text-red mt-2">
          Your browser blocked the new tab. Allow pop-ups for this site, then try again.
        </p>
      )}
    </>
  );
}

/**
 * The standalone card for Your documents. Renders nothing at all until there is a signature —
 * an "agreement: none" row tells a group nothing they can act on.
 */
export function SignedAgreementCard({ token }: { token: string }) {
  const [proposal, setProposal] = useState<PortalProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

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

  if (loading) {
    return (
      <div className={`${cardClass} p-4 flex items-center gap-2.5 text-[13px] text-ink-soft`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Looking for your agreement…
      </div>
    );
  }
  if (!proposal || proposal.status !== 'accepted') return null;

  return (
    <div className={`${cardClass} p-4`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-green-muted-bg text-green-muted-text">
          <FileCheck2 className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-forest leading-tight">Retreat agreement</p>
            <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-green-muted-bg text-green-muted-text">
              Signed
            </span>
          </div>
          <p className="text-[12px] text-ink-faint mt-0.5">
            {proposal.accepted_by_name ? `Signed by ${proposal.accepted_by_name}` : 'Signed'}
            {proposal.accepted_at ? ` · ${fmtSignedAt(proposal.accepted_at)}` : ''}
            {proposal.version > 1 ? ` · version ${proposal.version}` : ''}
          </p>

          {proposal.agreement_body && (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-forest hover:text-forest-mid"
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
                {open ? 'Hide the agreement' : 'Read what you signed'}
              </button>
              {open && (
                <DocumentFrame
                  html={agreementHtml(toAgreementRender(proposal))}
                  title="Your signed agreement"
                  minHeight={420}
                  className="mt-2"
                />
              )}
            </>
          )}

          <div className="mt-3">
            <AgreementDownloadButton proposal={proposal} />
          </div>
          <p className="text-[11px] text-ink-faint mt-2">
            Opens a printable copy. Choose &ldquo;Save as PDF&rdquo; to keep it.
          </p>
        </div>
      </div>
    </div>
  );
}
