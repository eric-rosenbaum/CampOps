import { useMemo } from 'react';
import { Home, Lock, Unlock, History, Download, Plus, Pencil, Settings2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { FilterPill } from '@/components/shared/FilterPill';
import { useRetreatStore } from '@/store/retreatStore';
import { useLocationStore } from '@/store/locationStore';
import { useAuth } from '@/lib/auth';
import type { Retreat, CampLocation, RetreatHousing } from '@/lib/types';
import { Badge, fmtDate, fmtDateFull } from './retreatUi';

type Phase = 1 | 2 | 3;

function derivePhase(rows: RetreatHousing[]): Phase {
  if (rows.length === 0) return 1;
  if (rows.every((h) => h.locked)) return 3;
  return 2;
}

function BedDots({ taken, capacity }: { taken: number; capacity: number }) {
  const filled = Math.min(taken, capacity);
  const empty = Math.max(0, capacity - filled);
  const over = Math.max(0, taken - capacity);
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {Array.from({ length: filled }).map((_, i) => <span key={`t${i}`} className="w-2.5 h-2.5 rounded-full bg-sage" title="Occupied" />)}
      {Array.from({ length: empty }).map((_, i) => <span key={`e${i}`} className="w-2.5 h-2.5 rounded-full bg-cream-dark" title="Empty" />)}
      {Array.from({ length: over }).map((_, i) => <span key={`o${i}`} className="w-2.5 h-2.5 rounded-full bg-red" title="Over capacity" />)}
    </div>
  );
}

function exportMap(retreat: Retreat, rows: RetreatHousing[], dormById: Map<string, CampLocation>) {
  const lines = rows.map((h) => {
    const cap = (h.locationId ? dormById.get(h.locationId)?.bedCapacity : null) ?? h.peopleCount;
    return `<tr><td>${h.spaceName ?? '—'}</td><td>${h.subgroupName ?? '—'}</td><td>${h.peopleCount} / ${cap}</td><td>${h.notes ?? ''}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><head><title>Housing map — ${retreat.groupName}</title>
    <style>body{font-family:sans-serif;padding:32px;color:#1a2e1a}h1{font-size:18px}h2{font-size:13px;color:#7a9472;font-weight:400}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th{text-align:left;background:#ede9df;padding:8px 10px}
    td{padding:8px 10px;border-bottom:1px solid #ede9df}</style></head><body>
    <h1>${retreat.groupName} — housing map</h1>
    <h2>${fmtDateFull(retreat.arrivalDate)} – ${fmtDateFull(retreat.departureDate)} · ${retreat.headcount} people</h2>
    <table><thead><tr><th>Space</th><th>Subgroup</th><th>People / beds</th><th>Notes</th></tr></thead><tbody>${lines}</tbody></table>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Enable pop-ups to export the housing map.'); return; }
  w.document.write(html); w.document.close(); w.focus(); w.print();
}

export function HousingTab() {
  const {
    retreats, activeRetreatId, setActiveRetreat, selectedRetreat,
    housingFor, openModal, setHousingLocked, saveHousingVersion,
  } = useRetreatStore();
  // Subscribe to the stable `locations` array, then derive — returning a fresh array
  // straight from a selector infinite-loops under React 19 + zustand v5.
  const locations = useLocationStore((s) => s.locations);
  const dorms = useMemo(
    () => locations.filter((l) => l.isDorm && l.retreatAvailable && l.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [locations],
  );
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = selectedRetreat();

  if (retreats.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <Home className="w-7 h-7 text-forest/30" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No retreats yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed">
            Add a retreat, then assign its subgroups to cabins and lock the housing plan here.
          </p>
        </div>
      </div>
    );
  }

  const rows = retreat ? housingFor(retreat.id) : [];
  const dormById = new Map(dorms.map((d) => [d.id, d]));
  const usedDormIds = new Set(rows.map((h) => h.locationId).filter(Boolean) as string[]);
  const inactiveSpaces = dorms.filter((d) => !usedDormIds.has(d.id));

  const phase = derivePhase(rows);
  const allLocked = phase === 3;
  const assigned = rows.reduce((sum, h) => sum + h.peopleCount, 0);

  const banner = {
    1: {
      wrap: 'bg-blue-bg border-blue/25',
      title: 'text-blue-text', body: 'text-blue-text',
      titleText: 'Phase 1 — Awaiting group housing submission',
      bodyText: retreat?.housingDeadline
        ? `The guest portal housing section is open. The coordinator has been notified to submit preferences. Submission deadline is ${fmtDateFull(retreat.housingDeadline)}. Available cabins are shown below.`
        : 'The guest portal housing section is open. The coordinator has been notified to submit their housing preferences. Available cabins are shown below.',
    },
    2: {
      wrap: 'bg-amber-bg border-amber/30',
      title: 'text-amber-text', body: 'text-amber-text',
      titleText: 'Phase 2 — Housing in progress',
      bodyText: 'Assignments are being built. Review each cabin, then lock the plan to finalize it and snapshot a version the group can rely on.',
    },
    3: {
      wrap: 'bg-green-muted-bg border-sage/40',
      title: 'text-green-muted-text', body: 'text-green-muted-text',
      titleText: 'Phase 3 — Housing locked',
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
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <div className="flex flex-wrap gap-2 mb-5">
        {retreats.map((r) => (
          <FilterPill
            key={r.id}
            label={r.groupName}
            active={(activeRetreatId ?? retreat?.id) === r.id}
            onClick={() => setActiveRetreat(r.id)}
          />
        ))}
      </div>

      {retreat && (
        <>
          <div className={`rounded-card border px-5 py-4 mb-5 ${banner.wrap}`}>
            <p className={`text-[13px] font-semibold mb-1 ${banner.title}`}>{banner.titleText}</p>
            <p className={`text-[12px] leading-relaxed ${banner.body}`}>{banner.bodyText}</p>
          </div>

          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 className="text-[14px] font-semibold text-forest">
              Housing assignments — {retreat.groupName} · {assigned || retreat.headcount} people ·{' '}
              <span className="font-mono text-forest/60">{fmtDate(retreat.arrivalDate)}–{fmtDate(retreat.departureDate)}</span>
            </h3>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'housingHistory', retreatId: retreat.id })}>
                <History className="w-3.5 h-3.5" /> View version history
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportMap(retreat, rows, dormById)}>
                <Download className="w-3.5 h-3.5" /> Export map
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {rows.map((h) => {
              const dorm = h.locationId ? dormById.get(h.locationId) : undefined;
              const capacity = dorm?.bedCapacity ?? h.peopleCount;
              return (
                <div
                  key={h.id}
                  className={`rounded-card border px-4 py-4 ${h.locked ? 'border-sage bg-sage-pale/50' : 'border-border bg-white'} ${canManage ? 'cursor-pointer hover:shadow-sm' : ''}`}
                  onClick={canManage ? () => openModal({ kind: 'housingAssign', retreatId: retreat.id, housingId: h.id }) : undefined}
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-forest truncate">{h.spaceName ?? 'Unassigned space'}</p>
                      <p className="text-[11px] text-forest/45 mt-0.5">
                        {capacity} bed{capacity === 1 ? '' : 's'}{dorm?.accessible ? ' · Accessible' : ''}
                      </p>
                    </div>
                    {h.locked
                      ? <Badge tone="ok">Locked</Badge>
                      : canManage && <Pencil className="w-3.5 h-3.5 text-forest/30 flex-shrink-0" />}
                  </div>
                  <p className="text-[12px] font-medium text-forest mb-1">
                    {h.subgroupName ?? 'Group'} · {h.peopleCount} {h.peopleCount === 1 ? 'person' : 'people'}
                  </p>
                  {h.notes && <p className="text-[11px] text-forest/50 italic leading-relaxed">{h.notes}</p>}
                  <BedDots taken={h.peopleCount} capacity={capacity} />
                  <p className="text-[10px] text-forest/45 mt-1.5">
                    {Math.min(h.peopleCount, capacity)} of {capacity} beds occupied
                    {h.peopleCount > capacity && <span className="text-red font-medium"> · {h.peopleCount - capacity} over</span>}
                  </p>
                </div>
              );
            })}

            {inactiveSpaces.map((s) => (
              <div key={s.id} className="rounded-card border border-border bg-white px-4 py-4 opacity-40">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-forest truncate">{s.name}</p>
                    <p className="text-[11px] text-forest/45 mt-0.5">Not activated for this retreat</p>
                  </div>
                  <Badge tone="neutral">Inactive</Badge>
                </div>
                <p className="text-[11px] text-forest/50 italic">
                  {s.bedCapacity ?? 0} beds{s.accessible ? ' · Accessible' : ''}. Not part of this retreat's housing plan.
                </p>
              </div>
            ))}

            {rows.length === 0 && inactiveSpaces.length === 0 && (
              <div className="col-span-full bg-white rounded-card border border-border px-4 py-8 text-center">
                <p className="text-[13px] text-forest/50 mb-3">
                  No cabins defined yet. Add your camp's spaces first, then assign this group.
                </p>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'spaces' })}>
                    <Settings2 className="w-3.5 h-3.5" /> Manage spaces
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
