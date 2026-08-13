import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { Badge } from './retreatUi';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatChangeRequest, RetreatRequestKind } from '@/lib/types';

const KIND_LABELS: Record<RetreatRequestKind, string> = {
  housing: 'housing',
  menu: 'menu',
  headcount: 'headcount',
  other: 'general',
};

/** ISO timestamp → "Jul 6" */
function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ChangeRequestsTab() {
  const { changeRequests, retreatById, openModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const pending = changeRequests.filter((r) => r.status === 'pending');
  const approvedCount = changeRequests.filter((r) => r.status === 'approved').length;
  const declinedCount = changeRequests.filter((r) => r.status === 'declined').length;
  const resolved = changeRequests.filter((r) => r.status !== 'pending');

  const groupName = (r: RetreatChangeRequest) => retreatById(r.retreatId)?.groupName ?? 'Unknown group';

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <StatCard label="Pending review" value={pending.length} hint="Awaiting your response" variant={pending.length > 0 ? 'amber' : 'default'} />
        <StatCard label="Approved" value={approvedCount} hint="Across all retreats" />
        <StatCard label="Declined" value={declinedCount} hint="With explanation" variant={declinedCount > 0 ? 'red' : 'default'} />
        <StatCard label="Total requests" value={changeRequests.length} hint="All retreats" />
      </div>

      {/* Pending */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-forest">Pending requests — requires your response</h3>
      </div>

      {pending.length === 0 ? (
        <div className="bg-white rounded-card border border-border px-5 py-4 sm:py-6 text-center text-[13px] text-forest/45 italic mb-8">
          No pending change requests. You're all caught up.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 mb-8">
          {pending.map((r) => (
            <div key={r.id} className="bg-white rounded-card border border-border border-l-[3px] border-l-amber px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-forest">
                    {groupName(r)} — {KIND_LABELS[r.kind]} change request
                  </p>
                  <p className="text-[11px] text-forest/45 mt-0.5">
                    Submitted by {r.submittedBy ?? 'group'} · {fmtWhen(r.submittedAt)}
                  </p>
                </div>
                <Badge tone="warn">Pending</Badge>
              </div>
              <p className="text-[13px] text-forest/70 mt-2.5 leading-relaxed">{r.body}</p>
              {canManage && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" onClick={() => openModal({ kind: 'respondRequest', requestId: r.id })}>
                    Approve &amp; respond
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'respondRequest', requestId: r.id })}>
                    Counter-propose
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red hover:bg-red-bg" onClick={() => openModal({ kind: 'respondRequest', requestId: r.id })}>
                    Decline
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Resolved */}
      <h3 className="text-[14px] font-semibold text-forest mb-3">Resolved requests</h3>

      {resolved.length === 0 ? (
        <div className="bg-white rounded-card border border-border px-5 py-4 sm:py-6 text-center text-[13px] text-forest/45 italic">
          No resolved requests yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {resolved.map((r) => {
            const border =
              r.status === 'declined' ? 'border-l-red'
                : r.status === 'countered' ? 'border-l-amber'
                  : 'border-l-sage';
            const tone = r.status === 'declined' ? 'alert' : r.status === 'countered' ? 'warn' : 'ok';
            const statusLabel = r.status === 'countered' ? 'Countered' : r.status === 'declined' ? 'Declined' : 'Approved';
            return (
              <div key={r.id} className={`bg-white rounded-card border border-border border-l-[3px] ${border} px-5 py-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-forest">
                      {groupName(r)} — {KIND_LABELS[r.kind]} change
                    </p>
                    <p className="text-[11px] text-forest/45 mt-0.5">
                      Submitted {fmtWhen(r.submittedAt)} · {statusLabel} {fmtWhen(r.respondedAt)}
                    </p>
                  </div>
                  <Badge tone={tone}>{statusLabel}</Badge>
                </div>
                <p className="text-[13px] text-forest/70 mt-2.5 leading-relaxed">{r.body}</p>
                {r.responseMessage && (
                  <p className="text-[12px] text-forest/55 mt-2.5 pt-2.5 border-t border-cream-dark italic leading-relaxed">
                    Ops response: {r.responseMessage}
                    {(r.respondedBy || r.respondedAt) && (
                      <span className="not-italic"> · {r.respondedBy ?? 'Ops'} · {fmtWhen(r.respondedAt)}</span>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
