import { useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { CommissaryVendor } from '@/lib/types';
import { inputClass, labelClass } from './commissaryUi';

/**
 * List + editor in one modal. The item form's vendor dropdown reads from this, and
 * the app only ever has one modal open at a time — so a separate "add vendor" modal
 * launched from the item form would blow away the half-filled item.
 */
export function VendorsModal({ editId }: { editId?: string }) {
  const { vendors, itemVendors, closeModal } = useCommissaryStore();
  const [editing, setEditing] = useState<string | null>(editId ?? null);
  const [creating, setCreating] = useState(vendors.length === 0);

  const existing = editing ? vendors.find((v) => v.id === editing) ?? null : null;
  const showForm = creating || Boolean(existing);

  if (!showForm) {
    return (
      <Modal title="Vendors" onClose={closeModal} width="520px">
        <div className="space-y-2">
          {vendors.map((v) => {
            // Count distinct items this vendor carries a pack for (multi-vendor aware).
            const itemCount = new Set(itemVendors.filter((p) => p.vendorId === v.id).map((p) => p.itemId)).size;
            return (
              <button
                key={v.id}
                onClick={() => setEditing(v.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-card border border-border hover:bg-cream-dark/40 text-left"
              >
                <Truck className="w-4 h-4 text-ink-faint flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-forest truncate">{v.name}</p>
                  <p className="text-[11px] text-ink-faint truncate">
                    {v.specialty ?? 'No specialty'} · {itemCount} item{itemCount === 1 ? '' : 's'}
                  </p>
                </div>
              </button>
            );
          })}
          <button
            onClick={() => { setEditing(null); setCreating(true); }}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-card border border-dashed border-border text-[12px] font-medium text-ink-soft hover:text-forest hover:border-forest/30"
          >
            <Plus className="w-3.5 h-3.5" /> Add vendor
          </button>
        </div>
        <div className="flex justify-end pt-4">
          <Button variant="ghost" onClick={closeModal}>Done</Button>
        </div>
      </Modal>
    );
  }

  return <VendorForm key={existing?.id ?? 'new'} existing={existing} onDone={() => { setCreating(false); setEditing(null); }} onClose={closeModal} />;
}

function VendorForm({
  existing, onDone, onClose,
}: { existing: CommissaryVendor | null; onDone: () => void; onClose: () => void }) {
  const { vendors, addVendor, updateVendor, deleteVendor } = useCommissaryStore();

  const [name, setName] = useState(existing?.name ?? '');
  const [specialty, setSpecialty] = useState(existing?.specialty ?? '');
  const [accountNumber, setAccountNumber] = useState(existing?.accountNumber ?? '');
  const [repName, setRepName] = useState(existing?.repName ?? '');
  const [repEmail, setRepEmail] = useState(existing?.repEmail ?? '');
  const [repPhone, setRepPhone] = useState(existing?.repPhone ?? '');
  const [orderCutoff, setOrderCutoff] = useState(existing?.orderCutoff ?? '');
  const [deliveryDay, setDeliveryDay] = useState(existing?.deliveryDay ?? '');
  const [minOrder, setMinOrder] = useState(existing?.minOrder != null ? String(existing.minOrder) : '');
  const [deliveryFee, setDeliveryFee] = useState(existing?.deliveryFee != null ? String(existing.deliveryFee) : '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const shared = {
      name: name.trim(),
      specialty: specialty.trim() || null,
      accountNumber: accountNumber.trim() || null,
      repName: repName.trim() || null,
      repEmail: repEmail.trim() || null,
      repPhone: repPhone.trim() || null,
      orderCutoff: orderCutoff.trim() || null,
      deliveryDay: deliveryDay.trim() || null,
      minOrder: minOrder === '' ? null : Number(minOrder),
      deliveryFee: deliveryFee === '' ? null : Number(deliveryFee),
      notes: existing?.notes ?? null,
    };
    if (existing) {
      updateVendor({ ...existing, ...shared, updatedAt: now });
    } else {
      addVendor({ id: generateId(), ...shared, sortOrder: vendors.length, createdAt: now, updatedAt: now });
    }
    onDone();
  }

  function handleDelete() {
    if (existing && confirm(`Delete vendor "${existing.name}"? Items pointing at it will lose their vendor.`)) {
      deleteVendor(existing.id);
      onDone();
    }
  }

  return (
    <Modal title={existing ? 'Edit vendor' : 'Add vendor'} onClose={onClose} width="560px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Vendor name *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. US Foods" />
          </div>
          <div>
            <label className={labelClass}>Specialty</label>
            <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={inputClass} placeholder="produce & protein" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Account number</label>
            <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputClass} placeholder="USF-44821" />
          </div>
          <div>
            <label className={labelClass}>Rep name</label>
            <input value={repName} onChange={(e) => setRepName(e.target.value)} className={inputClass} placeholder="Dana C." />
          </div>
          <div>
            <label className={labelClass}>Rep phone</label>
            <input value={repPhone} onChange={(e) => setRepPhone(e.target.value)} className={inputClass} placeholder="optional" />
          </div>
        </div>

        <div>
          <label className={labelClass}>Rep email</label>
          <input type="email" value={repEmail} onChange={(e) => setRepEmail(e.target.value)} className={inputClass} placeholder="optional" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Order cutoff</label>
            <input value={orderCutoff} onChange={(e) => setOrderCutoff(e.target.value)} className={inputClass} placeholder="2pm for Wed delivery" />
          </div>
          <div>
            <label className={labelClass}>Delivery day</label>
            <input value={deliveryDay} onChange={(e) => setDeliveryDay(e.target.value)} className={inputClass} placeholder="Wednesday" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Minimum order ($)</label>
            <input type="number" step="0.01" min="0" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} className={inputClass} placeholder="500.00" />
          </div>
          <div>
            <label className={labelClass}>Delivery fee ($)</label>
            <input type="number" step="0.01" min="0" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} className={inputClass} placeholder="85.00" />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center">{existing ? 'Save changes' : 'Add vendor'}</Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={onDone}>Back</Button>
        </div>
      </form>
    </Modal>
  );
}
