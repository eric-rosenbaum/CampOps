import { useMemo } from 'react';
import { Ban, Check, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useLocationStore } from '@/store/locationStore';
import { useCabinTypes } from '@/components/rooming/useCabinTypes';
import { useRetreatStore } from '@/store/retreatStore';
import type { CampLocation } from '@/lib/types';

/**
 * What groups can book, at a glance.
 *
 * This used to be a second editor for beds, availability and descriptions -- all three of which
 * Camp Info > Locations already owned, under different labels. One column (`locations.notes`) had
 * two screens telling two different stories about who reads it: "Notes, optional" in settings,
 * "shown to the group" here. A camp had no way to know which one mattered.
 *
 * So it stopped being an editor. While you are working a booking this is the useful half -- what
 * is open, how many beds, what the group will be shown -- and the pencil lives in exactly one
 * place, next to where the rooms were created in the first place.
 */
export function SpacesModal() {
  const { closeModal } = useRetreatStore();
  const navigate = useNavigate();
  const locations = useLocationStore((s) => s.locations);

  const buildings = useMemo(
    () => locations
      .filter((l) => l.isDorm && l.parentId == null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [locations],
  );
  const roomsOf = useMemo(() => {
    const m = new Map<string, CampLocation[]>();
    for (const l of locations) {
      if (!l.parentId) continue;
      (m.get(l.parentId) ?? m.set(l.parentId, []).get(l.parentId)!).push(l);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    return m;
  }, [locations]);

  // What the GROUP will actually read for this room: the saved description it points at, plus
  // anything the camp wrote about this one. Showing only the second would tell a camp its
  // cabins are undescribed when eight of them share a paragraph.
  const [cabinTypes] = useCabinTypes();
  const typeById = useMemo(() => new Map(cabinTypes.map((t) => [t.id, t])), [cabinTypes]);
  const roomBlurb = (r: CampLocation) => [
    r.cabinTypeId ? typeById.get(r.cabinTypeId)?.description?.trim() : '',
    r.notes?.trim(),
  ].filter(Boolean).join(' ');

  const meetingSpaces = useMemo(
    () => locations
      .filter((l) => l.isActive && !l.isDorm && l.programSpace)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [locations],
  );

  function edit() {
    closeModal();
    navigate('/settings?tab=locations');
  }

  return (
    <Modal title="What groups can book" onClose={closeModal} width="640px">
      <div className="-mt-2 mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-md text-[12.5px] leading-relaxed text-ink-soft">
          The same for every group. Beds, availability and the descriptions guests read are all set
          on the location itself.
        </p>
        <Button size="sm" variant="ghost" onClick={edit}>
          <ExternalLink className="h-3.5 w-3.5" /> Edit in Camp Info
        </Button>
      </div>

      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">
        Where groups sleep
      </p>
      {buildings.length === 0 ? (
        <p className="rounded-card border border-border bg-cream px-4 py-5 text-center text-[13px] text-ink-faint">
          No dorms yet. Mark a location as sleeping quarters in Camp Info &rsaquo; Locations.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {buildings.map((b) => {
            const rooms = roomsOf.get(b.id) ?? [];
            // What a group would actually be offered: a cabin shut since June is not open, however
            // it is flagged for retreats. Counting it here told the camp 25 beds while the portal
            // showed 24.
            const open = rooms.filter((r) => r.retreatAvailable && r.serviceStatus !== 'out_of_service');
            const beds = open.reduce((s, r) => s + (r.bedCapacity ?? 0), 0);
            return (
              <div
                key={b.id}
                className={`rounded-card border px-4 py-3 ${
                  b.retreatAvailable ? 'border-sage/40 bg-sage-pale/25' : 'border-border bg-white opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-forest">{b.name}</p>
                    <p className="text-[11.5px] text-ink-faint">
                      {open.length} of {rooms.length} room{rooms.length === 1 ? '' : 's'} open · {beds} bed{beds === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Availability on={b.retreatAvailable} />
                </div>

                {b.notes?.trim() ? (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink">{b.notes}</p>
                ) : (
                  <p className="mt-1.5 text-[11.5px] italic text-amber-text">
                    No description — groups see only the name.
                  </p>
                )}

                {rooms.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {rooms.map((r) => (
                      <li key={r.id} className="flex items-baseline justify-between gap-3 text-[12px]">
                        {/* Strike the NAME, not the line: text-decoration is inherited and a child
                            cannot take it back off, so the reason would be struck through too. */}
                        <span className={open.includes(r) ? 'text-ink' : 'text-ink-faint'}>
                          <span className={open.includes(r) ? '' : 'line-through'}>{r.name}</span>
                          {r.serviceStatus === 'out_of_service' && (
                            <span className="text-amber-text"> · out of service</span>
                          )}
                          {roomBlurb(r) && <span className="text-ink-faint"> · {roomBlurb(r)}</span>}
                        </span>
                        <span className="flex-none text-[11.5px] text-ink-faint">
                          {r.bedCapacity ?? 0} bed{(r.bedCapacity ?? 0) === 1 ? '' : 's'}
                          {r.accessible ? ' · step-free' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">
        Where groups meet
      </p>
      {meetingSpaces.length === 0 ? (
        <p className="rounded-card border border-border bg-cream px-4 py-5 text-center text-[13px] text-ink-faint">
          None yet. Open a location in Camp Info &rsaquo; Locations and tick &ldquo;Groups can book
          this to meet in&rdquo;.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {meetingSpaces.map((s) => (
            <div key={s.id} className="rounded-card border border-border bg-white px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-semibold text-forest">{s.name}</p>
                <span className="flex-none text-[11.5px] text-ink-faint">
                  {s.capacitySeated != null ? `seats ${s.capacitySeated}` : 'seating not set'}
                </span>
              </div>
              {s.notes?.trim() ? (
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink">{s.notes}</p>
              ) : (
                <p className="mt-0.5 text-[11.5px] italic text-amber-text">
                  No description — groups see only the name.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-5">
        <Button variant="ghost" onClick={closeModal}>Done</Button>
      </div>
    </Modal>
  );
}

function Availability({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-flex flex-none items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-medium ${
        on ? 'border-sage bg-sage text-white' : 'border-border bg-white text-ink-faint'
      }`}
    >
      {on ? <><Check className="h-3 w-3" /> Open</> : <><Ban className="h-3 w-3" /> Closed</>}
    </span>
  );
}
