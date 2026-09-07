import { useMemo, useState } from 'react';
import { Plus, Phone, Mail, ShieldAlert, ShieldCheck, Shield, Trash2, Hash } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Modal } from '@/components/shared/Modal';
import { StatCard } from '@/components/shared/StatCard';
import { useCampgroundStore } from '@/store/campgroundStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useAuth } from '@/lib/auth';
import { isOpen } from '@/lib/workOrder';
import { generateId, todayStr, toDateStr, parseDateStr, formatDate } from '@/lib/utils';
import { TRADES, TRADE_LABELS } from '@/lib/types';
import type { ServiceVendor } from '@/lib/types';

/**
 * The people a camp phones when it cannot fix the thing itself.
 *
 * The septic pumper, the well contractor, the elevator inspector. Two fields here are not
 * address-book fields and are the reason this list is in the product rather than in somebody's
 * phone: `insuranceExpiry`, which Compliance reads because several obligations are satisfied by
 * a third party's annual visit, and the count of work currently dispatched to each one — which
 * is the difference between "waiting on the septic guy" and knowing what is waiting on him.
 */

const inputClass =
  'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-widest text-ink-soft mb-1';

type InsuranceState = 'none' | 'expired' | 'soon' | 'ok';

/** Expired, or expiring inside a month — the window in which a camp can still do something. */
function insuranceState(expiry: string | null): InsuranceState {
  if (!expiry) return 'none';
  const today = todayStr();
  if (expiry < today) return 'expired';
  const soon = new Date(parseDateStr(today));
  soon.setDate(soon.getDate() + 30);
  return expiry <= toDateStr(soon) ? 'soon' : 'ok';
}

function blankVendor(): ServiceVendor {
  const now = new Date().toISOString();
  return {
    id: generateId(), campId: '', name: '', trade: null, contactName: null,
    phone: null, email: null, website: null, accountNumber: null,
    insuranceExpiry: null, notes: null, lastUsedOn: null, isActive: true,
    createdAt: now, updatedAt: now,
  };
}

export function VendorsPanel() {
  // Raw slices — never a filtering selector, which allocates a new array each render.
  const vendors = useCampgroundStore((s) => s.vendors);
  const issues = useIssuesStore((s) => s.issues);
  const { role } = useAuth();
  const canEdit = role !== 'viewer';

  const [editing, setEditing] = useState<ServiceVendor | null>(null);
  const [creating, setCreating] = useState(false);

  /** Open work currently dispatched to each vendor. Derived here, not in a selector. */
  const openByVendor = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of issues) {
      if (!i.vendorId || !isOpen(i)) continue;
      map.set(i.vendorId, (map.get(i.vendorId) ?? 0) + 1);
    }
    return map;
  }, [issues]);

  const sorted = useMemo(
    () => [...vendors].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    }),
    [vendors],
  );

  const dispatched = useMemo(
    () => [...openByVendor.values()].reduce((a, b) => a + b, 0),
    [openByVendor],
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-1 mb-5">
        <div className="flex flex-wrap">
          <StatCard label="Vendors" value={vendors.filter((v) => v.isActive).length} />
          <StatCard
            label="Work out with them" value={dispatched}
            hint={dispatched === 1 ? 'open work order' : 'open work orders'}
          />
        </div>
        {canEdit && (
          <div className="pb-4">
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add a vendor
            </Button>
          </div>
        )}
      </div>

      {vendors.length === 0 ? (
        <div className="rounded-card border border-border bg-white px-6 py-10 text-center">
          <Shield className="w-6 h-6 text-sage mx-auto mb-3" aria-hidden="true" />
          <p className="font-display text-[16px] font-bold text-forest">No vendors yet</p>
          <p className="text-[12.5px] text-ink-soft leading-relaxed max-w-md mx-auto mt-2">
            The septic pumper, the well contractor, the elevator inspector.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((v) => (
            <VendorRow
              key={v.id}
              vendor={v}
              openCount={openByVendor.get(v.id) ?? 0}
              onOpen={canEdit ? () => setEditing(v) : undefined}
            />
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <VendorModal
          vendor={editing}
          openCount={editing ? (openByVendor.get(editing.id) ?? 0) : 0}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── One vendor ───────────────────────────────────────────────────────────────

const INSURANCE_STYLE: Record<InsuranceState, { className: string; icon: typeof Shield }> = {
  expired: { className: 'bg-red-bg text-red-text', icon: ShieldAlert },
  soon: { className: 'bg-amber-bg text-amber-text', icon: ShieldAlert },
  ok: { className: 'bg-green-muted-bg text-green-muted-text', icon: ShieldCheck },
  none: { className: 'bg-cream-dark text-ink-soft', icon: Shield },
};

function insuranceLabel(v: ServiceVendor, state: InsuranceState): string {
  if (state === 'none') return 'No insurance date on file';
  if (state === 'expired') return `Insurance expired ${formatDate(v.insuranceExpiry!)}`;
  if (state === 'soon') return `Insurance expires ${formatDate(v.insuranceExpiry!)}`;
  return `Insured to ${formatDate(v.insuranceExpiry!)}`;
}

function VendorRow({ vendor: v, openCount, onOpen }: {
  vendor: ServiceVendor;
  openCount: number;
  onOpen?: () => void;
}) {
  const state = insuranceState(v.insuranceExpiry);
  const { className, icon: Icon } = INSURANCE_STYLE[state];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <b className="text-[14px] font-semibold text-forest">{v.name}</b>
            {v.trade && (
              <span className="rounded-tag bg-cream-dark px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                {TRADE_LABELS[v.trade as keyof typeof TRADE_LABELS] ?? v.trade}
              </span>
            )}
            {!v.isActive && (
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                Not used any more
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[11.5px] text-ink-soft">
            {v.contactName && <span>{v.contactName}</span>}
            {v.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3 text-sage" aria-hidden="true" />{v.phone}
              </span>
            )}
            {v.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="w-3 h-3 text-sage" aria-hidden="true" />{v.email}
              </span>
            )}
            {v.accountNumber && (
              <span className="inline-flex items-center gap-1">
                <Hash className="w-3 h-3 text-sage" aria-hidden="true" />{v.accountNumber}
              </span>
            )}
            {v.lastUsedOn && <span>Last used {formatDate(v.lastUsedOn)}</span>}
          </div>
          {v.notes && <p className="text-[12px] text-ink-soft mt-1.5 leading-relaxed">{v.notes}</p>}
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`inline-flex items-center gap-1 rounded-tag px-2 py-0.5 text-[11px] font-semibold ${className}`}>
            <Icon className="w-3 h-3" aria-hidden="true" />
            {insuranceLabel(v, state)}
          </span>
          <span className="text-[11.5px] text-ink-soft">
            {openCount === 0
              ? 'Nothing out with them'
              : `${openCount} open work order${openCount === 1 ? '' : 's'} dispatched`}
          </span>
        </div>
      </div>
    </>
  );

  const shell = `w-full text-left block rounded-card border border-border bg-white px-4 py-3.5 transition-colors ${
    onOpen ? 'cursor-pointer hover:border-sage' : ''
  } ${v.isActive ? '' : 'opacity-60'}`;

  return (
    <li>
      {onOpen
        ? <button type="button" onClick={onOpen} className={shell}>{body}</button>
        : <div className={shell}>{body}</div>}
    </li>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function VendorModal({ vendor, openCount, onClose }: {
  vendor: ServiceVendor | null;
  openCount: number;
  onClose: () => void;
}) {
  const addVendor = useCampgroundStore((s) => s.addVendor);
  const updateVendor = useCampgroundStore((s) => s.updateVendor);
  const deleteVendor = useCampgroundStore((s) => s.deleteVendor);

  const [draft, setDraft] = useState<ServiceVendor>(() => vendor ?? blankVendor());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = vendor == null;

  const set = (patch: Partial<ServiceVendor>) => setDraft((d) => ({ ...d, ...patch }));
  const trim = (v: string) => (v.trim() ? v.trim() : null);

  function save() {
    if (!draft.name.trim()) return;
    const row: ServiceVendor = {
      ...draft,
      name: draft.name.trim(),
      contactName: trim(draft.contactName ?? ''),
      phone: trim(draft.phone ?? ''),
      email: trim(draft.email ?? ''),
      accountNumber: trim(draft.accountNumber ?? ''),
      notes: trim(draft.notes ?? ''),
      updatedAt: new Date().toISOString(),
    };
    if (isNew) addVendor(row); else updateVendor(row);
    onClose();
  }

  return (
    <Modal
      title={isNew ? 'Add a vendor' : draft.name || 'Vendor'}
      onClose={onClose}
      width="min(560px, 94vw)"
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="vendor-name">Name</label>
          <input
            id="vendor-name" className={inputClass} value={draft.name}
            placeholder="Hilltop Septic Service"
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="vendor-trade">Trade</label>
            <select
              id="vendor-trade" className={inputClass} value={draft.trade ?? ''}
              onChange={(e) => set({ trade: e.target.value || null })}
            >
              <option value="">Not set</option>
              {TRADES.map((t) => <option key={t} value={t}>{TRADE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="vendor-contact">Who we ask for</label>
            <input
              id="vendor-contact" className={inputClass} value={draft.contactName ?? ''}
              onChange={(e) => set({ contactName: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="vendor-phone">Phone</label>
            <input
              id="vendor-phone" type="tel" className={inputClass} value={draft.phone ?? ''}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="vendor-email">Email</label>
            <input
              id="vendor-email" type="email" className={inputClass} value={draft.email ?? ''}
              onChange={(e) => set({ email: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="vendor-account">Account number</label>
            <input
              id="vendor-account" className={inputClass} value={draft.accountNumber ?? ''}
              onChange={(e) => set({ accountNumber: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="vendor-insurance">Insurance expires</label>
            <input
              id="vendor-insurance" type="date" className={inputClass}
              value={draft.insuranceExpiry ?? ''}
              onChange={(e) => set({ insuranceExpiry: e.target.value || null })}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="vendor-last-used">Last used</label>
          <input
            id="vendor-last-used" type="date" className={`${inputClass} sm:w-56`}
            value={draft.lastUsedOn ?? ''}
            onChange={(e) => set({ lastUsedOn: e.target.value || null })}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="vendor-notes">Notes</label>
          <textarea
            id="vendor-notes" className={`${inputClass} min-h-[64px]`} value={draft.notes ?? ''}
            placeholder="Two weeks' notice in August. Invoices net 30."
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox" className="mt-0.5 accent-forest"
            checked={!draft.isActive}
            onChange={(e) => set({ isActive: !e.target.checked })}
          />
          <span className="text-body text-ink">
            We do not use them any more
            <span className="block text-[11.5px] text-ink-soft">
              Hides them from the dispatch picker. History keeps their name.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={save} disabled={!draft.name.trim()}>
            {isNew ? 'Add vendor' : 'Save changes'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!isNew && (
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-ink-soft">
                    {openCount > 0 ? `${openCount} open work order(s) point here.` : 'Delete them?'}
                  </span>
                  <Button
                    variant="danger" size="sm"
                    onClick={() => { deleteVendor(draft.id); onClose(); }}
                  >
                    Yes, delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-faint hover:text-red transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
