import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatRequestStatus } from '@/lib/types';
import { inputClass, labelClass } from './retreatUi';
import { RequestThread } from './RequestThread';

type Decision = 'approved' | 'approved_mod' | 'countered' | 'declined';

const DECISIONS: { value: Decision; label: string; status: RetreatRequestStatus }[] = [
  { value: 'approved', label: 'Approved', status: 'approved' },
  { value: 'approved_mod', label: 'Approved with modification', status: 'approved' },
  { value: 'countered', label: 'Revised agreement', status: 'countered' },
  { value: 'declined', label: 'Declined', status: 'declined' },
];

export function RespondRequestModal({ requestId }: { requestId: string }) {
  const { changeRequests, retreatById, respondToRequest, messagesFor, closeModal } = useRetreatStore();
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const request = changeRequests.find((r) => r.id === requestId) ?? null;
  const groupName = request ? (retreatById(request.retreatId)?.groupName ?? 'group') : 'group';

  const [decision, setDecision] = useState<Decision>('approved');
  const [responseMessage, setResponseMessage] = useState(request?.responseMessage ?? '');
  const [internalNote, setInternalNote] = useState(request?.internalNote ?? '');

  if (!request) {
    return (
      <Modal title="Respond to request" onClose={closeModal} width="520px">
        <p className="text-[13px] text-ink-soft">This change request could not be found.</p>
        <div className="flex justify-end mt-4"><Button variant="ghost" onClick={closeModal}>Close</Button></div>
      </Modal>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    const status = DECISIONS.find((d) => d.value === decision)!.status;
    respondToRequest(requestId, status, responseMessage.trim() || null, internalNote.trim() || null, currentUser.name || null);
    closeModal();
  }

  return (
    <Modal title={`Respond · ${groupName}`} onClose={closeModal} width="520px">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* The whole conversation so far, not just the opening ask. Answering the first
            sentence of a thread that has moved on three messages is how a camp ends up
            approving something the group has since changed. */}
        <div>
          <label className={labelClass}>The conversation</label>
          <div className="max-h-64 overflow-y-auto rounded-btn border border-border bg-cream-dark/30 px-3 py-3">
            <RequestThread request={request} messages={messagesFor(request.id)} compact />
          </div>
        </div>

        <div>
          <label className={labelClass}>Decision</label>
          <select value={decision} onChange={(e) => setDecision(e.target.value as Decision)} className={inputClass}>
            {DECISIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Response message</label>
          <textarea value={responseMessage} onChange={(e) => setResponseMessage(e.target.value)} rows={4}
                    className={`${inputClass} resize-y`}
                    placeholder="What the group will see in their portal…" />
          <p className="text-[11px] text-ink-faint mt-1">
            Visible to the group, and added to the thread above. They can reply to it.
          </p>
        </div>

        <div>
          <label className={labelClass}>Internal note</label>
          <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2}
                    className={`${inputClass} resize-y`}
                    placeholder="For your team only…" />
          <p className="text-[11px] text-ink-faint mt-1">Not visible to the group.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!canManage}>Send response</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
