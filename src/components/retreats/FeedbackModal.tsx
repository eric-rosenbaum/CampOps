import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatFeedback } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { stars, inputClass, labelClass } from './retreatUi';

const now = () => new Date().toISOString();

const SCORE_FIELDS = [
  { key: 'overall', label: 'Overall' },
  { key: 'accommodations', label: 'Accommodations' },
  { key: 'food', label: 'Food & dining' },
  { key: 'communication', label: 'Communication' },
] as const;

type ScoreKey = (typeof SCORE_FIELDS)[number]['key'];

/** Record a group's post-retreat feedback (four 0–5 scores + comment + returning status). */
export function FeedbackModal({ retreatId }: { retreatId: string }) {
  const { addFeedback, retreatById, closeModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = retreatById(retreatId);

  const [scores, setScores] = useState<Record<ScoreKey, string>>({
    overall: '', accommodations: '', food: '', communication: '',
  });
  const [comment, setComment] = useState('');
  const [returningStatus, setReturningStatus] = useState('');

  function num(v: string): number | null {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    const row: RetreatFeedback = {
      id: generateId(),
      campId: '',
      retreatId,
      overall: num(scores.overall),
      accommodations: num(scores.accommodations),
      food: num(scores.food),
      communication: num(scores.communication),
      comment: comment.trim() || null,
      returningStatus: returningStatus.trim() || null,
      receivedAt: now(),
      createdAt: now(),
    };
    addFeedback(row);
    closeModal();
  }

  return (
    <Modal title="Record feedback" onClose={closeModal} width="500px">
      <form onSubmit={handleSubmit} className="space-y-4">
        {retreat && (
          <p className="text-[12px] text-ink-soft leading-relaxed">
            Post-retreat scores for <span className="font-semibold text-forest/75">{retreat.groupName}</span>.
            Enter a 0–5 rating for each dimension — leave blank to skip.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SCORE_FIELDS.map((f) => {
            const val = num(scores[f.key]);
            return (
              <div key={f.key}>
                <label className={labelClass}>{f.label}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={scores[f.key]}
                  onChange={(e) => setScores((s) => ({ ...s, [f.key]: e.target.value }))}
                  className={inputClass}
                  placeholder="0–5"
                />
                <p className="text-[13px] text-amber mt-1 h-4">{val != null ? stars(val) : ''}</p>
              </div>
            );
          })}
        </div>
        <div>
          <label className={labelClass}>Comment</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className={`${inputClass} min-h-[80px] resize-y`}
            placeholder="What the group said about their stay…"
          />
        </div>
        <div>
          <label className={labelClass}>Returning status</label>
          <select value={returningStatus} onChange={(e) => setReturningStatus(e.target.value)} className={inputClass}>
            <option value="">— Not specified —</option>
            <option value="Returning next year">Returning next year</option>
            <option value="Already booked again">Already booked again</option>
            <option value="Likely to return">Likely to return</option>
            <option value="Not yet confirmed for next year">Not yet confirmed</option>
            <option value="Not returning">Not returning</option>
          </select>
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!canManage}>Record feedback</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
