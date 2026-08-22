import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatFeedback } from '@/lib/types';
import { stars, fmtDateFull } from './retreatUi';

const COMM_THRESHOLD = 4.3;

function avg(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function fmtScore(n: number | null): string {
  return n == null ? '—' : n.toFixed(1);
}

export function FeedbackTab() {
  const { feedback, retreatById, selectedRetreat, openModal, deleteFeedback } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const rows = feedback.slice().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  const overallAvg = avg(rows.map((r) => r.overall));
  const accomAvg = avg(rows.map((r) => r.accommodations));
  const foodAvg = avg(rows.map((r) => r.food));
  const commAvg = avg(rows.map((r) => r.communication));

  const recordTarget = selectedRetreat()?.id ?? feedback[0]?.retreatId;

  const summary = [
    { label: 'Overall avg', value: overallAvg },
    { label: 'Accommodations', value: accomAvg },
    { label: 'Food & dining', value: foodAvg },
    { label: 'Communication', value: commAvg },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1" />
        {canManage && recordTarget && (
          <Button size="sm" onClick={() => openModal({ kind: 'feedback', retreatId: recordTarget })}>+ Record feedback</Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="max-w-md mx-auto text-center mt-20">
          <p className="text-[15px] font-semibold text-forest">No feedback yet</p>
          <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">
            Feedback surveys are sent to group coordinators at checkout. Record responses here to
            track satisfaction and spot returning groups.
          </p>
          {canManage && recordTarget && (
            <div className="mt-5">
              <Button onClick={() => openModal({ kind: 'feedback', retreatId: recordTarget })}>+ Record feedback</Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
            {summary.map((s) => (
              <div key={s.label} className="bg-white rounded-card border border-border px-5 py-4 text-center">
                <p className="font-mono text-[32px] font-semibold text-forest leading-none">{fmtScore(s.value)}</p>
                <p className="text-[14px] text-amber mt-1.5">{s.value != null ? stars(s.value) : ''}</p>
                <p className="text-[11px] uppercase tracking-wide text-ink-faint mt-1.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Communication warning */}
          {commAvg != null && commAvg < COMM_THRESHOLD && (
            <div className="flex items-start gap-3 rounded-card border border-amber/40 bg-amber-bg px-4 py-3 mb-5">
              <AlertTriangle className="w-4 h-4 text-amber flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-amber-text leading-relaxed">
                Communication scored {commAvg.toFixed(1)} — below the {COMM_THRESHOLD} target. Groups most often
                flag response time on change requests. Consider a 24-hour response commitment for all portal requests.
              </p>
            </div>
          )}

          {/* Feedback cards */}
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-[14px] font-semibold text-forest">Feedback by retreat</h2>
          </div>
          <div className="flex flex-col gap-2.5">
            {rows.map((f) => (
              <FeedbackCard key={f.id} f={f} groupName={retreatById(f.retreatId)?.groupName ?? 'Retreat'} canManage={canManage} onDelete={() => deleteFeedback(f.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FeedbackCard({ f, groupName, canManage, onDelete }: {
  f: RetreatFeedback; groupName: string; canManage: boolean; onDelete: () => void;
}) {
  const tiles = [
    { label: 'Overall', value: f.overall },
    { label: 'Accommodations', value: f.accommodations },
    { label: 'Food', value: f.food },
    { label: 'Communication', value: f.communication },
  ];
  const returning = (f.returningStatus ?? '').toLowerCase();
  const isReturning = /return|book/.test(returning) && !/not\s+return/.test(returning);

  return (
    <div className="bg-white rounded-card border border-border px-6 py-5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <p className="text-[14px] font-semibold text-forest">{groupName}</p>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] font-mono text-ink-faint">Received {fmtDateFull(f.receivedAt.slice(0, 10))}</span>
          {canManage && (
            <button onClick={() => { if (confirm('Delete this feedback?')) onDelete(); }} className="text-[11px] text-ink-faint hover:text-red">Delete</button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-cream rounded-btn px-2.5 py-2 text-center">
            <p className="font-mono text-[16px] font-semibold text-forest">{t.value == null ? '—' : t.value.toFixed(1)}</p>
            <p className="text-[10px] text-ink-faint mt-0.5">{t.label}</p>
          </div>
        ))}
      </div>
      {f.comment && (
        <p className="text-[13px] text-ink leading-relaxed italic bg-cream rounded-btn px-3.5 py-2.5">"{f.comment}"</p>
      )}
      {f.returningStatus && (
        <p className={`text-[12px] mt-2.5 ${isReturning ? 'text-green-muted-text' : 'text-ink-soft'}`}>
          {isReturning ? '✓ ' : '— '}{f.returningStatus}
        </p>
      )}
    </div>
  );
}
