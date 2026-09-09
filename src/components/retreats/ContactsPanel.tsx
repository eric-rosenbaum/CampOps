// The people on the other end of a group booking.
//
// A synagogue weekend has a coordinator who answers email, a rabbi who decides the schedule and
// a treasurer who pays the invoice — and they are three different people with three different
// phones. One `coordinator_email` column on the retreat cannot hold that, which is why this
// exists; the retreat's own coordinator fields stay as the primary, because the portal link and
// the outbox both send there.
import { useMemo, useState } from 'react';
import { Plus, Star, Pencil, Trash2, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatContact } from '@/lib/types';
import { dbAddContact, dbUpdateContact, dbDeleteContact } from '@/lib/retreatsDb';
import { generateId } from '@/lib/utils';
import { inputClass, labelClass, Badge } from './retreatUi';
import { isValidEmail } from '@/lib/email';

const now = () => new Date().toISOString();

const ROLE_SUGGESTIONS = ['Coordinator', 'Rabbi / clergy', 'Treasurer', 'Programme lead', 'Bus / logistics'];

export function ContactsPanel({ retreatId }: { retreatId: string }) {
  // Raw slice in, derived list out. A selector returning `contacts.filter(...)` allocates a new
  // array every render, which under React 19 + zustand v5 is an infinite loop and a white screen.
  const { contacts, setContacts } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const [editing, setEditing] = useState<RetreatContact | 'new' | null>(null);

  const list = useMemo(
    () => contacts
      .filter((c) => c.retreatId === retreatId)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name)),
    [contacts, retreatId],
  );

  // Optimistic write, then realtime delivers the authoritative rows — the same contract every
  // other writer in this module works under.
  function save(c: RetreatContact, isNew: boolean) {
    // Exactly one primary per group. Promoting somebody demotes whoever held it, in the store
    // AND in the database, rather than leaving two people both marked "the one we email".
    const demoted = c.isPrimary
      ? contacts
        .filter((x) => x.retreatId === retreatId && x.id !== c.id && x.isPrimary)
        .map((x) => ({ ...x, isPrimary: false, updatedAt: now() }))
      : [];
    const demotedIds = new Set(demoted.map((x) => x.id));
    const base = contacts.map((x) => demoted.find((d) => d.id === x.id) ?? x);
    setContacts(isNew ? [...base, c] : base.map((x) => (x.id === c.id ? c : x)));

    if (isNew) void dbAddContact(c); else void dbUpdateContact(c);
    demotedIds.forEach((id) => {
      const row = demoted.find((d) => d.id === id);
      if (row) void dbUpdateContact(row);
    });
    setEditing(null);
  }

  function remove(c: RetreatContact) {
    if (!window.confirm(`Remove ${c.name} from this group?`)) return;
    setContacts(contacts.filter((x) => x.id !== c.id));
    void dbDeleteContact(c.id);
  }

  return (
    <div className="bg-white border border-border rounded-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-[13px] font-semibold text-forest">Contacts</h3>
        </div>
        {canManage && editing == null && (
          <Button size="sm" variant="ghost" onClick={() => setEditing('new')}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        )}
      </div>

      {editing != null && (
        <ContactForm
          key={editing === 'new' ? 'new' : editing.id}
          retreatId={retreatId}
          existing={editing === 'new' ? null : editing}
          hasPrimary={list.some((c) => c.isPrimary)}
          onCancel={() => setEditing(null)}
          onSave={(c) => save(c, editing === 'new')}
        />
      )}

      {list.length === 0 && editing == null ? (
        <p className="px-4 py-6 text-[12.5px] text-ink-faint text-center">
          Nobody on file yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((c) => (
            <li key={c.id} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-forest">{c.name}</span>
                  {c.isPrimary && <Badge tone="sage">Primary</Badge>}
                  {c.role && <span className="text-[11.5px] text-ink-soft">{c.role}</span>}
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 mt-0.5">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-[12px] text-ink hover:text-forest hover:underline break-all">
                      <Mail className="w-3 h-3 flex-shrink-0" />{c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-[12px] text-ink hover:text-forest hover:underline">
                      <Phone className="w-3 h-3 flex-shrink-0" />{c.phone}
                    </a>
                  )}
                </div>
                {c.notes && <p className="text-[11.5px] text-ink-soft mt-1">{c.notes}</p>}
              </div>
              {canManage && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!c.isPrimary && (
                    <button
                      type="button" title="Make primary"
                      onClick={() => save({ ...c, isPrimary: true, updatedAt: now() }, false)}
                      className="p-1.5 text-ink-faint hover:text-sage transition-colors"
                    ><Star className="w-3.5 h-3.5" /></button>
                  )}
                  <button
                    type="button" title="Edit" onClick={() => setEditing(c)}
                    className="p-1.5 text-ink-faint hover:text-forest transition-colors"
                  ><Pencil className="w-3.5 h-3.5" /></button>
                  <button
                    type="button" title="Remove" onClick={() => remove(c)}
                    className="p-1.5 text-ink-faint hover:text-red transition-colors"
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactForm({ retreatId, existing, hasPrimary, onCancel, onSave }: {
  retreatId: string;
  existing: RetreatContact | null;
  hasPrimary: boolean;
  onCancel: () => void;
  onSave: (c: RetreatContact) => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [role, setRole] = useState(existing?.role ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  // The first person on a group is the one we will email, so default to primary rather than
  // making somebody remember to tick it.
  const [isPrimary, setIsPrimary] = useState(existing?.isPrimary ?? !hasPrimary);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // Catch it here, not three screens later when a reminder bounces.
    if (email.trim() && !isValidEmail(email)) {
      setEmailError('That does not look like an email address — check for a missing dot.');
      return;
    }
    setEmailError(null);
    const ts = now();
    onSave({
      id: existing?.id ?? generateId(),
      campId: existing?.campId ?? '',
      retreatId,
      name: name.trim(),
      role: role.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      isPrimary,
      notes: notes.trim() || null,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    });
  }

  return (
    <form onSubmit={submit} className="px-4 py-4 bg-cream-dark/40 border-b border-border space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus />
        </div>
        <div>
          <label className={labelClass}>Role</label>
          <input
            value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}
            list="retreat-contact-roles" placeholder="Coordinator"
          />
          <datalist id="retreat-contact-roles">
            {ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email" value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
            className={`${inputClass} ${emailError ? 'border-red' : ''}`}
          />
          {emailError && <p className="text-[11.5px] text-red mt-1">{emailError}</p>}
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Notes</label>
        <input
          value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass}
          placeholder="e.g. only reachable after 4pm"
        />
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-ink cursor-pointer">
        <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="accent-forest" />
        Primary contact — reminders and the portal link go here
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="submit" disabled={!name.trim()}>{existing ? 'Save' : 'Add contact'}</Button>
      </div>
    </form>
  );
}
