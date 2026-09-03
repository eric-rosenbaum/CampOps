// The proposal, in the group's own portal, with one button on it.
//
// Reading it here is what writes `viewed_at` — the RPC marks it as a side effect, which is the
// entire reason the camp can tell the difference between "they are thinking about it" and "that
// email went to the wrong address". Accepting takes a typed name and nothing else: a coordinator
// on a phone should not need an account, a password or a PDF reader to say yes.
import { useEffect, useState } from 'react';
import { FileText, Check, Loader2, AlertTriangle } from 'lucide-react';
import { supabasePublic, cardClass, inputClass, labelClass, btnPrimary } from '@/pages/portal/portalShared';
import { money, fmtDateFull } from '@/components/retreats/retreatUi';
import { todayStr } from '@/lib/utils';

interface PortalProposal {
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
}

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
}

export function ProposalSection({ token, onAccepted }: Props) {
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

  return (
    <section id="proposal" className="scroll-mt-20">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-sage-pale text-forest flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-forest leading-tight">Your proposal</h2>
          <p className="text-[12px] text-ink-soft leading-tight">
            {proposal.version > 1 ? `Version ${proposal.version} · ` : ''}
            {proposal.valid_until ? `Valid until ${fmtDateFull(proposal.valid_until)}` : 'No expiry date'}
          </p>
        </div>
      </div>

      <div className={cardClass}>
        {proposal.intro && (
          <p className="px-5 pt-5 text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
            {proposal.intro}
          </p>
        )}

        <div className="px-5 py-5">
          <ul className="divide-y divide-border">
            {proposal.line_items.map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="text-[14px] text-ink">{l.description}</span>
                <span className="text-[14px] text-forest tabular-nums flex-shrink-0">{money(l.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-4 pt-3 mt-1 border-t-2 border-forest">
            <span className="text-[15px] font-bold text-forest">Total</span>
            <span className="text-[19px] font-bold text-forest tabular-nums">{money(proposal.total)}</span>
          </div>
        </div>

        {proposal.terms && (
          <div className="px-5 py-4 bg-cream border-t border-border">
            <p className={labelClass}>Terms</p>
            <p className="text-[13px] text-ink-soft leading-relaxed whitespace-pre-wrap">{proposal.terms}</p>
          </div>
        )}

        {accepted ? (
          <div className="px-5 py-4 border-t border-border bg-green-muted-bg">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-green-muted-text">
              <Check className="w-4 h-4" /> Accepted
              {proposal.accepted_at && ` on ${fmtStamp(proposal.accepted_at)}`}
            </p>
            <p className="text-[13px] text-green-muted-text mt-1">
              Thank you. The camp will be in touch with your agreement and deposit.
            </p>
          </div>
        ) : expired ? (
          // Never let someone accept a price the camp is no longer offering. Saying so plainly,
          // with what to do next, beats a disabled button with no explanation.
          <div className="px-5 py-4 border-t border-border bg-amber-bg">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-amber-text">
              <AlertTriangle className="w-4 h-4" /> This proposal has expired
            </p>
            <p className="text-[13px] text-amber-text mt-1">
              It was valid until {fmtDateFull(proposal.valid_until)}. Please ask the camp for a new
              one — they can send an updated version to this same link.
            </p>
          </div>
        ) : (
          <div className="px-5 py-4 border-t border-border">
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
                : <><Check className="w-4 h-4" /> Accept this proposal</>}
            </button>
            <p className="text-[12px] text-ink-soft mt-2 text-center">
              Accepting holds the dates while the agreement and deposit are sorted out.
            </p>
            {error && <p className="text-[13px] text-red mt-2 text-center">{error}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
