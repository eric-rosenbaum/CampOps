import { useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useLocationStore } from '@/store/locationStore';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { CampLocation } from '@/lib/types';

/** One dorm row. Toggles retreat-availability + edits bed capacity / accessible on the location. */
function DormRow({ dorm, canManage }: { dorm: CampLocation; canManage: boolean }) {
  const { updateLocation } = useLocationStore();
  const [bedCapacity, setBedCapacity] = useState(String(dorm.bedCapacity ?? 0));

  function commit(patch: Partial<CampLocation>) {
    if (!canManage) return;
    updateLocation({ ...dorm, ...patch });
  }

  return (
    <div className={`rounded-card border px-3.5 py-3 ${dorm.retreatAvailable ? 'border-sage/40 bg-sage-pale/30' : 'border-border bg-white'}`}>
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[13px] font-medium text-forest truncate px-1">{dorm.name}</p>
        <div className="flex items-center gap-1">
          <input
            type="number" min="0" step="1"
            value={bedCapacity}
            onChange={(e) => setBedCapacity(e.target.value)}
            onBlur={() => commit({ bedCapacity: Math.max(0, Math.round(Number(bedCapacity) || 0)) })}
            disabled={!canManage}
            className="w-16 text-[13px] text-center bg-white border border-border rounded-btn px-1.5 py-1 focus:outline-none focus:border-sage"
          />
          <span className="text-[11px] text-forest/45">beds</span>
        </div>
        <button
          type="button"
          disabled={!canManage}
          onClick={() => commit({ retreatAvailable: !dorm.retreatAvailable })}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-pill border transition-colors ${
            dorm.retreatAvailable
              ? 'bg-sage text-white border-sage'
              : 'bg-white text-forest/50 border-border hover:border-forest/30'
          }`}
        >
          {dorm.retreatAvailable && <Check className="w-3 h-3" />} Available to retreats
        </button>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          disabled={!canManage}
          onClick={() => commit({ accessible: !dorm.accessible })}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-pill border transition-colors ${
            dorm.accessible
              ? 'bg-blue-bg text-blue-text border-blue/30'
              : 'bg-white text-forest/50 border-border hover:border-forest/30'
          }`}
        >
          {dorm.accessible && <Check className="w-3 h-3" />} Accessible / ADA
        </button>
      </div>
    </div>
  );
}

export function SpacesModal() {
  const { closeModal } = useRetreatStore();
  const dorms = useLocationStore((s) => s.locations.filter((l) => l.isDorm));
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const sorted = [...dorms].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return (
    <Modal title="Retreat dorms" onClose={closeModal} width="560px">
      <p className="text-[12px] text-forest/50 -mt-2 mb-4">
        Dorms come from your camp's Locations (Camp Info). Toggle which are available to retreat groups.
      </p>

      <div className="flex flex-col gap-2 mb-5">
        {sorted.length === 0 && (
          <p className="bg-cream rounded-card border border-border px-4 py-6 text-center text-[13px] text-forest/45">
            No dorms yet. Add dorm locations from Camp Info, then toggle their retreat availability here.
          </p>
        )}
        {sorted.map((d) => <DormRow key={d.id} dorm={d} canManage={canManage} />)}
      </div>

      <div className="flex justify-end pt-4">
        <Button variant="ghost" onClick={closeModal}>Done</Button>
      </div>
    </Modal>
  );
}
