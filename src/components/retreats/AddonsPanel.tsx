// The camp's add-on catalogue — the only upsell surface in the product.
//
// Linens, boat rental, AV, campfire wood, extra staffing. Two things make it worth building:
// a group can tick them in the portal without an email thread, and the camp can finally see
// WHICH extras actually sell. A catalogue with no sales figures beside it is a price list, and
// camps already have one of those in a drawer.
import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { AddonUnit, RetreatAddon, RetreatCharge } from '@/lib/types';
import { ADDON_UNIT_LABELS } from '@/lib/types';
import { dbAddAddon, dbUpdateAddon, dbDeleteAddon } from '@/lib/retreatsDb';
import { generateId } from '@/lib/utils';
import { money, inputClass, labelClass, Badge } from './retreatUi';

const now = () => new Date().toISOString();
const UNIT_OPTIONS = Object.entries(ADDON_UNIT_LABELS) as [AddonUnit, string][];

/**
 * `retreat_charges.addon_id` exists in the database (the portal writes it when a group requests
 * an extra) but is not carried on the `RetreatCharge` type, so this widens locally rather than
 * pretending it is there. When the column is not present on a row — an extra a member added by
 * hand as a free-text line — the description is the only link back to the catalogue, and an
 * exact name match is the honest join. Both paths are counted, neither is guessed at.
 */
type ChargeMaybeAddon = RetreatCharge & { addonId?: string | null };

export function AddonsPanel() {
  const { addons, setAddons, charges } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const [editing, setEditing] = useState<RetreatAddon | 'new' | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Derived from the raw slices with useMemo. A selector returning a fresh array would loop.
  const sales = useMemo(() => {
    const byId = new Map<string, { count: number; revenue: number }>();
    const byName = new Map<string, { count: number; revenue: number }>();
    for (const raw of charges as ChargeMaybeAddon[]) {
      const bucket = raw.addonId ? byId : byName;
      const key = raw.addonId ?? raw.description.trim().toLowerCase();
      const cur = bucket.get(key) ?? { count: 0, revenue: 0 };
      bucket.set(key, { count: cur.count + 1, revenue: cur.revenue + raw.amount });
    }
    const out = new Map<string, { count: number; revenue: number }>();
    for (const a of addons) {
      const linked = byId.get(a.id);
      const named = byName.get(a.name.trim().toLowerCase());
      out.set(a.id, {
        count: (linked?.count ?? 0) + (named?.count ?? 0),
        revenue: (linked?.revenue ?? 0) + (named?.revenue ?? 0),
      });
    }
    return out;
  }, [charges, addons]);

  const list = useMemo(
    () => addons
      .filter((a) => showInactive || a.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [addons, showInactive],
  );

  const totalRevenue = useMemo(
    () => list.reduce((s, a) => s + (sales.get(a.id)?.revenue ?? 0), 0),
    [list, sales],
  );

  function save(a: RetreatAddon, isNew: boolean) {
    setAddons(isNew ? [...addons, a] : addons.map((x) => (x.id === a.id ? a : x)));
    if (isNew) void dbAddAddon(a); else void dbUpdateAddon(a);
    setEditing(null);
  }

  function remove(a: RetreatAddon) {
    // Deleting an add-on that has already been sold would orphan the charge lines it produced,
    // so retiring is offered first and deletion is confirmed hard.
    const sold = sales.get(a.id)?.count ?? 0;
    const msg = sold
      ? `“${a.name}” has been sold ${sold} ${sold === 1 ? 'time' : 'times'}. Deleting it leaves those charges in place but breaks the link. Retire it instead?\n\nOK to delete anyway.`
      : `Delete “${a.name}”?`;
    if (!window.confirm(msg)) return;
    setAddons(addons.filter((x) => x.id !== a.id));
    void dbDeleteAddon(a.id);
  }

  return (
    <div className="bg-white border border-border rounded-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-[13px] font-semibold text-forest">Add-ons</h3>
          <p className="text-[11.5px] text-ink-soft">
            Extras groups can buy. Ones marked for the portal appear as a checklist in their link.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button" onClick={() => setShowInactive((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft hover:text-forest transition-colors"
          >
            {showInactive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showInactive ? 'Hide retired' : 'Show retired'}
          </button>
          {canManage && (
            <Button size="sm" variant="ghost" onClick={() => setEditing('new')}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          )}
        </div>
      </div>

      {editing != null && (
        <AddonForm
          key={editing === 'new' ? 'new' : editing.id}
          existing={editing === 'new' ? null : editing}
          nextSort={addons.length}
          onCancel={() => setEditing(null)}
          onSave={(a) => save(a, editing === 'new')}
        />
      )}

      {list.length === 0 && editing == null ? (
        <p className="px-4 py-6 text-[12.5px] text-ink-faint text-center">
          No add-ons yet. Linens, boat rental, AV, campfire wood, extra staffing.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((a) => {
            const s = sales.get(a.id) ?? { count: 0, revenue: 0 };
            return (
              <li key={a.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-forest">{a.name}</span>
                    {a.guestSelectable
                      ? <Badge tone="sage">In the portal</Badge>
                      : <Badge tone="neutral">Camp only</Badge>}
                    {!a.isActive && <Badge tone="warn">Retired</Badge>}
                  </p>
                  {a.description && <p className="text-[11.5px] text-ink-soft mt-0.5">{a.description}</p>}
                  <p className="text-[12px] text-ink mt-1 tabular-nums">
                    {money(a.rate)} <span className="text-ink-soft">· {ADDON_UNIT_LABELS[a.unit]}</span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  {/* Which upsells actually sell. Zero is a finding, not a blank. */}
                  <p className={`text-[13px] font-bold tabular-nums ${s.revenue > 0 ? 'text-forest' : 'text-ink-faint'}`}>
                    {s.revenue > 0 ? money(s.revenue) : '—'}
                  </p>
                  <p className="text-[11px] text-ink-soft">
                    {s.count === 0 ? 'never sold' : `sold ${s.count}×`}
                  </p>
                  {canManage && (
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <button
                        type="button" title="Edit" onClick={() => setEditing(a)}
                        className="p-1 text-ink-faint hover:text-forest transition-colors"
                      ><Pencil className="w-3.5 h-3.5" /></button>
                      <button
                        type="button" title={a.isActive ? 'Retire' : 'Bring back'}
                        onClick={() => save({ ...a, isActive: !a.isActive, updatedAt: now() }, false)}
                        className="p-1 text-ink-faint hover:text-amber transition-colors"
                      ><ArrowUpDown className="w-3.5 h-3.5" /></button>
                      <button
                        type="button" title="Delete" onClick={() => remove(a)}
                        className="p-1 text-ink-faint hover:text-red transition-colors"
                      ><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalRevenue > 0 && (
        <p className="px-4 py-2.5 border-t border-border text-[12px] text-ink-soft">
          <strong className="text-forest tabular-nums">{money(totalRevenue)}</strong> of add-on revenue
          across every group on record.
        </p>
      )}
    </div>
  );
}

function AddonForm({ existing, nextSort, onCancel, onSave }: {
  existing: RetreatAddon | null;
  nextSort: number;
  onCancel: () => void;
  onSave: (a: RetreatAddon) => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [unit, setUnit] = useState<AddonUnit>(existing?.unit ?? 'per_person');
  const [rate, setRate] = useState(existing ? String(existing.rate) : '');
  const [guestSelectable, setGuestSelectable] = useState(existing?.guestSelectable ?? true);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const ts = now();
    onSave({
      id: existing?.id ?? generateId(),
      campId: existing?.campId ?? '',
      name: name.trim(),
      description: description.trim() || null,
      unit,
      rate: rate.trim() === '' ? 0 : Number(rate),
      guestSelectable,
      isActive: existing?.isActive ?? true,
      sortOrder: existing?.sortOrder ?? nextSort,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    });
  }

  return (
    <form onSubmit={submit} className="px-4 py-4 bg-cream-dark/40 border-b border-border space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)} className={inputClass}
            placeholder="e.g. Linen set" autoFocus
          />
        </div>
        <div>
          <label className={labelClass}>Rate</label>
          <input
            type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)}
            className={inputClass} placeholder="0"
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Description</label>
        <input
          value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass}
          placeholder="What the group actually gets"
        />
      </div>
      <div className="sm:max-w-[280px]">
        <label className={labelClass}>Charged</label>
        <select value={unit} onChange={(e) => setUnit(e.target.value as AddonUnit)} className={inputClass}>
          {UNIT_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <p className="text-[11px] text-ink-soft mt-1">
          Per-person and per-night rates multiply out against the group's numbers.
        </p>
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-ink cursor-pointer">
        <input
          type="checkbox" checked={guestSelectable}
          onChange={(e) => setGuestSelectable(e.target.checked)} className="accent-forest"
        />
        Offer this in the guest portal
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="submit" disabled={!name.trim()}>{existing ? 'Save' : 'Add add-on'}</Button>
      </div>
    </form>
  );
}
