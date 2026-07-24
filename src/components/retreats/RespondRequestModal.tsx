import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatRequestStatus } from '@/lib/types';
import { inputClass, labelClass } from './retreatUi';

type Decision = 'approved' | 'approved_mod' | 'countered' | 'declined';

const DECISIONS: { value: Decision; label: string; status: RetreatRequestStatus }[] = [
  { value: 'approved', label: 'Approved', status: 'approved' },
  { value: 'approved_mod', label: 'Approved with modification', status: 'approved' },
  { value: 'countered', label: 'Counter-proposal', status: 'countered' },
  { value: 'declined', label: 'Declined', status: 'declined' },
];

export function RespondRequestModal({ requestId }: { requestId: string }) {
  const { changeRequests, retreatById, respondToRequest, closeModal } = useRetreatStore();
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
        <p className="text-[13px] text-forest/50">This change request could not be found.</p>
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
    <Modal title={`Respond — ${groupName}`} onClose={closeModal} width="520px">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Read-only request body */}
        <div>
          <label className={labelClass}>Group's request</label>
          <div className="bg-cream-dark/50 border border-border rounded-btn px-3 py-2.5 text-[13px] text-forest/75 leading-relaxed">
            {request.body}
          </div>
          {request.submittedBy && (
            <p className="text-[11px] text-forest/45 mt-1">Submitted by {request.submittedBy}</p>
          )}
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
          <p className="text-[11px] text-forest/45 mt-1">Visible to the group.</p>
        </div>

        <div>
          <label className={labelClass}>Internal note</label>
          <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2}
                    className={`${inputClass} resize-y`}
                    placeholder="For your team only…" />
          <p className="text-[11px] text-forest/45 mt-1">Not visible to the group.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!canManage}>Send response</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
