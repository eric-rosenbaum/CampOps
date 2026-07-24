import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { fmtDateFull } from './retreatUi';

export function HousingHistoryModal({ retreatId }: { retreatId: string }) {
  const { versionsFor, retreatById, closeModal } = useRetreatStore();
  const retreat = retreatById(retreatId);
  const versions = versionsFor(retreatId); // sorted newest first by the store

  return (
    <Modal title="Housing version history" onClose={closeModal} width="520px">
      {retreat && <p className="text-[12px] text-forest/50 -mt-2 mb-4">{retreat.groupName}</p>}

      {versions.length === 0 ? (
        <p className="bg-cream rounded-card border border-border px-4 py-8 text-center text-[13px] text-forest/45">
          No saved versions yet. A version is snapshotted each time housing is locked.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {versions.map((v, i) => {
            const latest = i === 0;
            return (
              <div
                key={v.id}
                className={`rounded-card border px-4 py-3 ${latest ? 'bg-green-muted-bg border-sage/40' : 'bg-cream border-border'}`}
              >
                <div className={`flex items-center justify-between text-[12px] font-semibold ${latest ? 'text-green-muted-text' : 'text-forest/60'}`}>
                  <span>v{v.version}{v.label ? ` — ${v.label}` : ''}{latest ? ' (current)' : ''}</span>
                  <span className="font-mono">{fmtDateFull(v.createdAt.slice(0, 10))}</span>
                </div>
                {v.summary && (
                  <p className={`text-[12px] mt-1 leading-relaxed ${latest ? 'text-green-muted-text' : 'text-forest/55'}`}>
                    {v.summary}
                  </p>
                )}
                {v.createdBy && (
                  <p className={`text-[11px] mt-1 ${latest ? 'text-green-muted-text/80' : 'text-forest/40'}`}>
                    Saved by {v.createdBy}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end pt-4">
        <Button variant="ghost" onClick={closeModal}>Close</Button>
      </div>
    </Modal>
  );
}
