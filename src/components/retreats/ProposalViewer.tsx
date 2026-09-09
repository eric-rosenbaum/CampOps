// Read a proposal back after it has gone out.
//
// Once a quote is sent it is never edited — a change is a new version — so the only thing left to
// do with it is look at it. When a group calls about a number, the camp needs the words and the
// figures exactly as the group received them, not a re-rendered approximation.
import { Printer, Send, EyeOff, Eye } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import type { Retreat, RetreatProposal } from '@/lib/types';
import { money } from './retreatUi';
import { proposalEmailHtml } from './proposalEmail';

/** "Tue, Sep 9 3:12pm" */
function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '')}`;
}

interface Props {
  proposal: RetreatProposal;
  retreat: Retreat | null;
  campName: string;
  portalUrl: string;
  onPrint: () => void;
  onClose: () => void;
}

export function ProposalViewer({ proposal, retreat, campName, portalUrl, onPrint, onClose }: Props) {
  const html = proposalEmailHtml(proposal, retreat, campName, portalUrl);

  return (
    <Modal title={`Proposal v${proposal.version}`} onClose={onClose} width="640px">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-ink-soft">
          <span className="text-[15px] font-semibold text-ink tabular-nums">{money(proposal.total)}</span>
          {proposal.depositAmount ? (
            <span>{money(proposal.depositAmount)} deposit</span>
          ) : null}
          {proposal.sentAt && (
            <span className="inline-flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-ink-faint" /> Sent {fmtWhen(proposal.sentAt)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            {proposal.viewedAt
              ? <><Eye className="w-3.5 h-3.5 text-blue" /> Opened {fmtWhen(proposal.viewedAt)}</>
              : <><EyeOff className="w-3.5 h-3.5 text-ink-faint" /> Not opened yet</>}
          </span>
        </div>

        {/* An iframe, so the email's own styles cannot leak into the app or inherit from it —
            this is the group's inbox, not a CampCommand screen. */}
        <iframe
          title={`Proposal v${proposal.version} as sent`}
          srcDoc={`<body style="margin:0;padding:20px;background:#fff">${html}</body>`}
          sandbox=""
          className="w-full h-[420px] border border-border rounded-xl bg-white"
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onPrint}>
            <Printer className="w-3.5 h-3.5" /> Print / save as PDF
          </Button>
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
