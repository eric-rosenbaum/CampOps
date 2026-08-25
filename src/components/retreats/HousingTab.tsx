import { useMemo, useState } from 'react';
import { Home, Lock, Unlock, History, Download, Plus, Settings2, Users } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useLocationStore } from '@/store/locationStore';
import { useAuth } from '@/lib/auth';
import type { Retreat, CampLocation, RetreatHousing, RetreatGuest } from '@/lib/types';
import { fmtDate, fmtDateFull } from './retreatUi';
import { BuildingAccordion, type BuildingVM } from '@/components/rooming/BuildingAccordion';

/**
 * 1 nothing yet · 2 the group is still working · 2.5 the group says they are done · 3 the camp
 * has locked it.
 *
 * The middle state is the point of this. "Some rooms have people in them" and "the coordinator
 * considers this finished" look identical from the camp's side otherwise, so the camp either
 * chased them or assumed. The group's sign-off is theirs to give and does not lock anything:
 * approving and locking is still the camp's call.
 */
type Phase = 1 | 2 | 25 | 3;

function derivePhase(rows: RetreatHousing[], submittedAt: string | null | undefined): Phase {
  if (rows.length > 0 && rows.every((h) => h.locked)) return 3;
  if (submittedAt) return 25;
  if (rows.length === 0) return 1;
  return 2;
}


function exportMap(
  retreat: Retreat,
  rows: RetreatHousing[],
  locById: Map<string, CampLocation>,
  guests: RetreatGuest[],
) {
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const byRoom = new Map<string, RetreatGuest[]>();
  guests.forEach((g) => {
    if (!g.locationId) return;
    const list = byRoom.get(g.locationId) ?? [];
    list.push(g);
    byRoom.set(g.locationId, list);
  });

  const sections = rows.map((h) => {
    const loc = h.locationId ? locById.get(h.locationId) : undefined;
    const cap = loc?.bedCapacity ?? h.peopleCount;
    const building = loc?.parentId ? locById.get(loc.parentId)?.name ?? null : null;
    const occupants = h.locationId ? byRoom.get(h.locationId) ?? [] : [];
    const unnamed = Math.max(0, h.peopleCount - occupants.length);
    const people = occupants.length > 0
      ? `<ol>${occupants.map((g) => `<li>${esc(g.fullName)}${g.needsAccessible ? ' <span class="tag">step-free</span>' : ''}${g.subgroup ? ` <span class="sub">${esc(g.subgroup)}</span>` : ''}</li>`).join('')}</ol>`
        + (unnamed > 0 ? `<p class="sub">+ ${unnamed} not yet named</p>` : '')
      : `<p class="sub">${h.peopleCount} ${h.peopleCount === 1 ? 'person' : 'people'}, no names submitted</p>`;
    return `<section>
      <h3>${esc(loc?.name ?? h.spaceName ?? 'Space')}${building ? ` <span class="sub">${esc(building)}</span>` : ''}
        <span class="count">${h.peopleCount}/${cap}</span></h3>
      ${h.subgroupName ? `<p class="sub">${esc(h.subgroupName)}</p>` : ''}
      ${people}
      ${h.notes ? `<p class="note">${esc(h.notes)}</p>` : ''}
    </section>`;
  }).join('');

  // Named guests plus anyone booked as a bare number. The figure the kitchen and the front
  // desk actually need.
  const totalPeople = rows.reduce((sum, h) => sum + h.peopleCount, 0) || guests.length;
  const unplaced = guests.filter((g) => !g.locationId);
  const unplacedHtml = unplaced.length > 0
    ? `<section class="warn"><h3>Not yet placed <span class="count">${unplaced.length}</span></h3>
       <p>${unplaced.map((g) => esc(g.fullName)).join(', ')}</p></section>`
    : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Rooming sheet · ${esc(retreat.groupName)}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#1a2e1a;max-width:900px;margin:0 auto}
      h1{font-size:20px;margin:0 0 2px}
      h2{font-size:13px;color:#7a9472;font-weight:400;margin:0 0 20px}
      section{border:1px solid #ded3bb;border-radius:6px;padding:12px 14px;margin-bottom:10px;break-inside:avoid}
      section.warn{border-color:#c4863a;background:#fdf6ec}
      h3{font-size:14px;margin:0 0 6px;display:flex;align-items:baseline;gap:8px}
      .count{margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b7c6b}
      .sub{color:#6b7c6b;font-size:12px;font-weight:400;margin:0}
      .tag{font-size:10px;background:#eaf0e4;border-radius:99px;padding:1px 6px;color:#2f4a2f}
      .note{font-size:12px;color:#6b7c6b;font-style:italic;margin:6px 0 0}
      ol{margin:6px 0 0;padding-left:22px;font-size:13px;columns:2;column-gap:28px}
      li{margin:2px 0;break-inside:avoid}
      @media print{body{padding:12px}section{break-inside:avoid}}
    </style></head><body>
    <h1>${esc(retreat.groupName)} · rooming sheet</h1>
    <h2>${fmtDateFull(retreat.arrivalDate)} – ${fmtDateFull(retreat.departureDate)} · ${totalPeople || retreat.headcount} people</h2>
    ${unplacedHtml}
    ${sections}
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Enable pop-ups to print the rooming sheet.'); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 250);
}

export function HousingTab() {
  const {
    selectedRetreat,
    housingFor, guestsFor, assignGuests, openModal, setHousingLocked, saveHousingVersion,
  } = useRetreatStore();
  // Subscribe to the stable `locations` array, then derive, returning a fresh array
  // straight from a selector infinite-loops under React 19 + zustand v5.
  const locations = useLocationStore((s) => s.locations);
  const dorms = useMemo(
    () => locations.filter((l) => l.isDorm && l.retreatAvailable && l.isActive && l.parentId == null).sort((a, b) => a.name.localeCompare(b.name)),
    [locations],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = selectedRetreat();

  if (!retreat) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <Home className="w-7 h-7 text-forest/30" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No retreats yet</h3>
          <p className="text-[13px] text-ink-soft leading-relaxed">
            Add a retreat, then assign its subgroups to cabins and lock the housing plan here.
          </p>
        </div>
      </div>
    );
  }

  const rows = retreat ? housingFor(retreat.id) : [];
  const guests = retreat ? guestsFor(retreat.id) : [];
  const guestsByRoom = new Map<string, RetreatGuest[]>();
  guests.forEach((g) => {
    if (!g.locationId) return;
    const list = guestsByRoom.get(g.locationId) ?? [];
    list.push(g);
    guestsByRoom.set(g.locationId, list);
  });
  const unplaced = guests.filter((g) => !g.locationId);
  const locById = new Map(locations.map((l) => [l.id, l]));

  // Rooms grouped under their building, with the housing row's own notes folded in.
  const rowByLocation = new Map(rows.filter((h) => h.locationId).map((h) => [h.locationId as string, h]));
  const buildingVMs: BuildingVM[] = dorms.map((b) => {
    const rms = locations
      .filter((l) => l.parentId === b.id && l.retreatAvailable && l.isActive)
      .sort((a, c) => a.sortOrder - c.sortOrder || a.name.localeCompare(c.name));
    const asRooms = rms.length > 0 ? rms : [b];
    return {
      id: b.id,
      name: b.name,
      rooms: asRooms.map((rm) => {
        const h = rowByLocation.get(rm.id);
        return {
          id: rm.id,
          name: rm.name,
          capacity: rm.bedCapacity ?? 0,
          accessible: rm.accessible ?? false,
          unnamed: h?.unnamedCount ?? 0,
          note: h?.notes ?? null,
          subgroup: h?.subgroupName ?? null,
          occupants: (guestsByRoom.get(rm.id) ?? []).map((g) => ({
            id: g.id, name: g.fullName, needsAccessible: g.needsAccessible,
          })),
        };
      }),
    };
  }).filter((b) => b.rooms.length > 0);

  const phase = derivePhase(rows, retreat?.housingSubmittedAt);
  const allLocked = phase === 3;
  const assigned = rows.reduce((sum, h) => sum + h.peopleCount, 0);

  const banner = {
    1: {
      wrap: 'bg-blue-bg border-blue/25',
      title: 'text-blue-text', body: 'text-blue-text',
      titleText: 'Phase 1, Awaiting group housing submission',
      bodyText: retreat?.housingDeadline
        ? `The guest portal housing section is open. The coordinator has been notified to submit preferences. Submission deadline is ${fmtDateFull(retreat.housingDeadline)}. Available cabins are shown below.`
        : 'The guest portal housing section is open. The coordinator has been notified to submit their housing preferences. Available cabins are shown below.',
    },
    2: {
      wrap: 'bg-amber-bg border-amber/30',
      title: 'text-amber-text', body: 'text-amber-text',
      titleText: 'Phase 2, Housing in progress',
      bodyText: 'Assignments are being built. Review each cabin, then lock the plan to finalize it and snapshot a version the group can rely on.',
    },
    25: {
      wrap: 'bg-sage-pale border-sage/50',
      title: 'text-forest', body: 'text-forest/80',
      titleText: 'The group says their rooming is complete',
      bodyText: retreat?.housingSubmittedAt
        ? `${retreat.housingSubmittedBy ?? 'The coordinator'} marked it complete on ${fmtDateFull(retreat.housingSubmittedAt.slice(0, 10))}. Review it and lock the plan when you are happy. They can still reopen it until you do.`
        : 'Review it and lock the plan when you are happy.',
    },
    3: {
      wrap: 'bg-green-muted-bg border-sage/40',
      title: 'text-green-muted-text', body: 'text-green-muted-text',
      titleText: 'Phase 3 · Housing locked',
      bodyText: 'Housing is finalized. Any changes must be requested through the change requests tab and approved by the ops director before the plan is unlocked.',
    },
  }[phase];

  function toggleLock() {
    if (!retreat) return;
    const next = !allLocked;
    setHousingLocked(retreat.id, next);
    if (next) {
      const summary = rows.map((h) => `${h.spaceName}: ${h.subgroupName ?? 'group'} (${h.peopleCount})`).join(' · ');
      saveHousingVersion(retreat.id, 'Locked', summary || 'Housing finalized', currentUser.name || null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">

      {retreat && (
        <>
          <div className={`rounded-card border px-5 py-4 mb-5 ${banner.wrap}`}>
            <p className={`text-[13px] font-semibold mb-1 ${banner.title}`}>{banner.titleText}</p>
            <p className={`text-[12px] leading-relaxed ${banner.body}`}>{banner.bodyText}</p>
          </div>

          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 className="text-[14px] font-semibold text-forest">
              Housing assignments · {retreat.groupName} · {assigned || retreat.headcount} people ·{' '}
              <span className="font-mono text-ink-soft">{fmtDate(retreat.arrivalDate)}–{fmtDate(retreat.departureDate)}</span>
            </h3>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'housingHistory', retreatId: retreat.id })}>
                <History className="w-3.5 h-3.5" /> View version history
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportMap(retreat, rows, locById, guests)}>
                <Download className="w-3.5 h-3.5" /> Rooming sheet
              </Button>
              {canManage && (
                <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'spaces' })}>
                  <Settings2 className="w-3.5 h-3.5" /> Manage spaces
                </Button>
              )}
              {canManage && rows.length > 0 && (
                <Button size="sm" variant={allLocked ? 'ghost' : 'primary'} onClick={toggleLock}>
                  {allLocked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock housing</>}
                </Button>
              )}
              {canManage && (
                <Button size="sm" onClick={() => openModal({ kind: 'housingAssign', retreatId: retreat.id })}>
                  <Plus className="w-3.5 h-3.5" /> Assign
                </Button>
              )}
            </div>
          </div>

          {guests.length > 0 && (
            <div className="rounded-card border border-border bg-white px-5 py-4 mb-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[13px] font-semibold text-forest inline-flex items-center gap-2">
                  <Users className="w-4 h-4 text-sage" />
                  {guests.length} {guests.length === 1 ? 'name' : 'names'} submitted by the group
                </p>
                <span className={`text-[12px] font-semibold ${unplaced.length > 0 ? 'text-amber-text' : 'text-green-muted-text'}`}>
                  {unplaced.length > 0 ? `${unplaced.length} not yet in a room` : 'Everyone has a bed'}
                </span>
              </div>

              {/* Staging tray. Pick people here, then open a building and drop them in a room.
                  The same select-then-place model the group uses in their portal, so a room
                  swap the camp makes and one the coordinator makes work identically. */}
              {canManage && !allLocked && (unplaced.length > 0 || selected.size > 0) && (
                <>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {unplaced.map((g) => {
                      const on = selected.has(g.id);
                      return (
                        <button
                          key={g.id}
                          onClick={() => setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                            return next;
                          })}
                          className={`text-[11.5px] rounded-full px-2.5 py-1 border transition-colors ${
                            on ? 'bg-forest text-white border-forest' : 'bg-cream-dark text-ink border-transparent hover:border-sage'
                          }`}
                        >
                          {g.fullName}
                        </button>
                      );
                    })}
                  </div>
                  {unplaced.length > 1 && (
                    <button
                      onClick={() => setSelected(new Set(unplaced.map((g) => g.id)))}
                      className="text-[12px] font-semibold text-forest hover:text-forest-mid mt-2"
                    >
                      Select all {unplaced.length}
                    </button>
                  )}
                </>
              )}

              {selected.size > 0 && (
                <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-cream-dark">
                  <p className="text-[12.5px] font-semibold text-forest">
                    {selected.size} selected. Open a building below and pick a room.
                  </p>
                  <button onClick={() => setSelected(new Set())} className="text-[12px] text-ink-soft hover:text-forest">
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          <BuildingAccordion
            buildings={buildingVMs}
            selectedCount={selected.size}
            editable={canManage && !allLocked}
            onPlace={(roomId) => {
              assignGuests(Array.from(selected), roomId);
              setSelected(new Set());
            }}
            onRemove={(guestId) => assignGuests([guestId], null)}
            emptyMessage="No cabins defined yet. Add your camp's spaces first, then assign this group."
          />

        </>
      )}
    </div>
  );
}
