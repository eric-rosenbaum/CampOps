import { useState } from 'react';
import { Download, Send, Trash2, FileText, Mail, Loader2, X, Plus, Check } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { generateId, todayStr } from '@/lib/utils';
import { printInvoice } from '@/lib/invoiceHtml';
import { sendEmail } from '@/lib/email';
import type { Retreat, RetreatInvoice, RetreatInvoiceKind, RetreatInvoiceLine } from '@/lib/types';
import { money, fmtRange, fmtDateFull, nights, pricingRate, inputClass, labelClass } from './retreatUi';

function invoiceEmailHtml(campName: string, inv: RetreatInvoice, portalUrl: string): string {
  const due = inv.dueDate ? ` by ${fmtDateFull(inv.dueDate)}` : '';
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a2e1a">
    <p>Hello,</p>
    <p>${campName} has sent you ${inv.kind === 'deposit' ? 'a deposit invoice' : 'an invoice'} (<strong>${inv.number}</strong>) for <strong>${money(inv.amount)}</strong>${due}.</p>
    ${inv.note ? `<p>${inv.note.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))}</p>` : ''}
    <p>You can view and download it anytime in your guest portal:<br>
      <a href="${portalUrl}" style="color:#2f4a2f;font-weight:600">${portalUrl}</a></p>
    <p>Thank you,<br>${campName}</p>
  </div>`;
}

const now = () => new Date().toISOString();
const today = () => todayStr();

/** Generate a deposit or balance invoice, deliver it to the guest portal, and/or download a PDF. */
export function InvoiceModal({ retreatId }: { retreatId: string }) {
  const { retreatById, chargesFor, balanceFor, invoicesFor, housingFor, addInvoice, deleteInvoice, portalUrl, closeModal } = useRetreatStore();
  const { currentCamp, setRetreatPaymentNote } = useCampStore();
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = retreatById(retreatId);
  const bal = balanceFor(retreatId);
  const existing = invoicesFor(retreatId);
  const campName = currentCamp?.name ?? 'Camp';
  const coordinatorEmail = retreat?.coordinatorEmail ?? '';

  const [kind, setKind] = useState<RetreatInvoiceKind>(
    retreat && (retreat.depositRequired ?? 0) > 0 && !existing.some((i) => i.kind === 'deposit') ? 'deposit' : 'balance',
  );
  // Note prefills with the camp's saved payment/banking instructions (fill once, reuse everywhere).
  const [note, setNote] = useState(currentCamp?.retreatPaymentNote ?? '');
  const [noteSaved, setNoteSaved] = useState(false);
  // Headcount to bill — defaults to the group's confirmed headcount but is editable per invoice.
  // Kept as a string so the field can be cleared to "" while typing (no forced 0).
  const [headcount, setHeadcount] = useState(retreat ? String(retreat.headcount) : '');
  const headcountNum = Math.max(0, Math.round(Number(headcount) || 0));
  const [dueDate, setDueDate] = useState('');
  const [emailToo, setEmailToo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  // Ad-hoc extra fees added to this invoice (cleaning, damage, late, add-ons…).
  const [fees, setFees] = useState<RetreatInvoiceLine[]>([]);
  const [feeDesc, setFeeDesc] = useState('');
  const [feeAmount, setFeeAmount] = useState('');

  async function emailInvoice(inv: RetreatInvoice, r: Retreat) {
    setEmailingId(inv.id); setBanner(null);
    const res = await sendEmail({
      to: r.coordinatorEmail!, subject: `${inv.kind === 'deposit' ? 'Deposit invoice' : 'Invoice'} ${inv.number} — ${campName}`,
      html: invoiceEmailHtml(campName, inv, portalUrl(r)), fromName: campName, replyTo: currentUser.email || undefined,
    });
    setEmailingId(null);
    setBanner(res.ok ? { tone: 'ok', text: `Emailed to ${r.coordinatorEmail}.` } : { tone: 'err', text: res.error });
    return res.ok;
  }

  if (!retreat) {
    return (
      <Modal title="Invoices" onClose={closeModal} width="560px">
        <p className="text-[13px] text-forest/55">Retreat not found.</p>
      </Modal>
    );
  }

  // Build the base line items + total for the selected invoice kind (before extra fees).
  const charges = chargesFor(retreatId);
  function buildLines(k: RetreatInvoiceKind): { lines: RetreatInvoiceLine[]; amount: number } {
    if (k === 'deposit') {
      const amt = retreat?.depositRequired ?? 0;
      return { lines: [{ description: `Deposit to reserve dates — ${retreat?.groupName ?? ''}`.trim(), amount: amt }], amount: amt };
    }
    // Balance: manual charges if any, else the rate × people × nights facility fee.
    let base: RetreatInvoiceLine[];
    if (charges.length > 0) {
      base = charges.map((c) => ({ description: c.description, amount: c.amount }));
    } else if (retreat) {
      const n = nights(retreat.arrivalDate, retreat.departureDate);
      const rate = pricingRate(retreat) ?? 0;
      const cabinCount = housingFor(retreatId).length;
      let amt: number; let desc: string;
      if (retreat.pricingModel === 'per_person_night') {
        amt = rate * headcountNum * n;
        desc = `Facility — ${money(rate)}/person/night × ${headcountNum} × ${n} night${n === 1 ? '' : 's'}`;
      } else if (retreat.pricingModel === 'per_cabin_night') {
        amt = rate * cabinCount * n;
        desc = `Facility — ${money(rate)}/cabin/night × ${cabinCount} × ${n} night${n === 1 ? '' : 's'}`;
      } else {
        amt = retreat.flatRate ?? 0;
        desc = 'Facility fee';
      }
      base = [{ description: desc, amount: amt }];
    } else {
      base = [];
    }
    const gross = base.reduce((s, l) => s + l.amount, 0);
    if (bal.totalPaid > 0) base.push({ description: 'Less payments received', amount: -bal.totalPaid });
    return { lines: base, amount: gross - bal.totalPaid };
  }
  const base = buildLines(kind);
  const feeSum = fees.reduce((s, f) => s + f.amount, 0);
  const lines: RetreatInvoiceLine[] = [...base.lines, ...fees];
  const amount = base.amount + feeSum;
  const effectiveDue = dueDate || (kind === 'deposit' ? retreat.depositDue ?? '' : '');

  async function saveNoteDefault() {
    if (!currentCamp || !note.trim()) return;
    await setRetreatPaymentNote(currentCamp.id, note.trim());
    setNoteSaved(true); setTimeout(() => setNoteSaved(false), 2500);
  }
  const savedDefaultNote = (currentCamp?.retreatPaymentNote ?? '').trim();
  const isCurrentDefault = savedDefaultNote !== '' && note.trim() === savedDefaultNote;

  function addFee() {
    const amt = Number(feeAmount);
    if (!feeDesc.trim() || !Number.isFinite(amt) || amt === 0) return;
    setFees((f) => [...f, { description: feeDesc.trim(), amount: amt }]);
    setFeeDesc(''); setFeeAmount('');
  }

  function nextNumber(k: RetreatInvoiceKind): string {
    const prefix = k === 'deposit' ? 'DEP' : 'INV';
    const seq = existing.filter((i) => i.kind === k).length + 1;
    return `${prefix}-${today().replace(/-/g, '').slice(2)}-${String(seq).padStart(2, '0')}`;
  }

  function draftFor(inv?: RetreatInvoice) {
    return {
      campName, groupName: retreat!.groupName,
      number: inv?.number ?? nextNumber(kind),
      kind: inv?.kind ?? kind,
      issuedAt: inv?.issuedAt ?? now(),
      dueDate: inv?.dueDate ?? (effectiveDue || null),
      lineItems: inv?.lineItems ?? lines,
      amount: inv?.amount ?? amount,
      note: inv?.note ?? (note.trim() || null),
      arrivalDate: retreat!.arrivalDate, departureDate: retreat!.departureDate,
    };
  }

  async function send() {
    if (!canManage || busy || !retreat) return;
    setBusy(true); setBanner(null);
    const inv: RetreatInvoice = {
      id: generateId(), campId: '', retreatId, kind, number: nextNumber(kind),
      amount, note: note.trim() || null, dueDate: effectiveDue || null, status: 'sent',
      lineItems: lines, issuedAt: now(), createdBy: currentUser.name || null,
      createdAt: now(), updatedAt: now(),
    };
    addInvoice(inv);
    setNote(''); setDueDate(''); setFees([]);
    if (emailToo && coordinatorEmail) {
      await emailInvoice(inv, retreat);
    } else {
      setBanner({ tone: 'ok', text: 'Invoice sent to the guest portal.' });
    }
    setBusy(false);
  }

  return (
    <Modal title="Invoices" onClose={closeModal} width="560px">
      <div className="space-y-5">
        {/* Builder */}
        <div className="rounded-card border border-border bg-cream px-4 py-3.5 space-y-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-forest/40">Create an invoice</p>
          <div>
            <label className={labelClass}>Invoice type</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['deposit', 'balance'] as RetreatInvoiceKind[]).map((k) => (
                <button
                  key={k} type="button" onClick={() => setKind(k)}
                  className={`text-[13px] font-semibold rounded-btn py-2 border transition-colors ${kind === k ? 'border-sage bg-sage-pale text-forest' : 'border-border bg-white text-forest/60 hover:border-sage'}`}
                >
                  {k === 'deposit' ? 'Deposit invoice' : 'Balance invoice'}
                </button>
              ))}
            </div>
          </div>

          {/* Editable headcount — only affects the per-person facility line before extra fees. */}
          {kind === 'balance' && charges.length === 0 && retreat.pricingModel === 'per_person_night' && (
            <div>
              <label className={labelClass}>Headcount to bill</label>
              <input type="number" min={0} value={headcount}
                     onChange={(e) => setHeadcount(e.target.value)}
                     className={`${inputClass} w-32`} />
              <p className="text-[11px] text-forest/45 mt-1">Defaults to the group's confirmed headcount — edit to bill a different number.</p>
            </div>
          )}

          {/* Preview lines */}
          <div className="rounded-btn bg-white border border-border overflow-hidden">
            {lines.length === 0 ? (
              <p className="text-[12px] text-forest/45 px-3 py-3">
                {kind === 'balance' ? 'No charges yet — add charges in Costs & invoice first.' : 'Set a deposit amount on the retreat first.'}
              </p>
            ) : lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-3 px-3 py-2 border-b border-cream-dark last:border-0 text-[13px]">
                <span className="text-forest/70 truncate">{l.description}</span>
                <span className={`font-mono ${l.amount < 0 ? 'text-forest/45' : 'text-forest'}`}>{money(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 px-3 py-2 bg-cream border-t border-border text-[13px] font-semibold">
              <span className="text-forest">{kind === 'deposit' ? 'Deposit due' : 'Total due'}</span>
              <span className="font-mono text-forest">{money(amount)}</span>
            </div>
          </div>

          {/* Extra fees */}
          <div>
            <label className={labelClass}>Extra fees (optional)</label>
            {fees.length > 0 && (
              <div className="space-y-1 mb-2">
                {fees.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-[12px] bg-white border border-border rounded-btn px-2.5 py-1.5">
                    <span className="text-forest/70 truncate">{f.description}</span>
                    <span className="inline-flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-forest">{money(f.amount)}</span>
                      <button type="button" onClick={() => setFees((fs) => fs.filter((_, idx) => idx !== i))} className="text-forest/30 hover:text-red" aria-label="Remove fee"><X className="w-3.5 h-3.5" /></button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <div className="flex-1 min-w-0"><input value={feeDesc} onChange={(e) => setFeeDesc(e.target.value)} className={inputClass} placeholder="e.g. Cleaning fee, Damage, Late checkout" /></div>
              <div className="w-28"><input type="number" step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} className={inputClass} placeholder="0.00" /></div>
              <Button type="button" variant="ghost" onClick={addFee} disabled={!feeDesc.trim() || !Number(feeAmount)}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Due date</label>
              <input type="date" value={effectiveDue} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-end">
              <p className="text-[11px] text-forest/45 leading-snug">
                {fmtRange(retreat.arrivalDate, retreat.departureDate)}
              </p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`${labelClass} mb-0`}>Note (optional)</label>
              <button type="button" onClick={saveNoteDefault} disabled={!note.trim()}
                className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                  noteSaved || isCurrentDefault ? 'text-green-muted-text' : 'text-forest/55 hover:text-forest underline'
                }`}>
                {(noteSaved || isCurrentDefault) && <Check className="w-3 h-3" />}
                {noteSaved ? 'Saved as default' : isCurrentDefault ? 'Saved — update' : 'Save as default'}
              </button>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${inputClass} resize-y`}
                      placeholder="e.g. Please Zelle billing@camp.org, or send ACH to account 12345 / routing 12345." />
          </div>

          <label className={`flex items-center gap-2 text-[13px] ${coordinatorEmail ? 'text-forest/75' : 'text-forest/35'}`}>
            <input type="checkbox" checked={emailToo && !!coordinatorEmail} disabled={!coordinatorEmail} onChange={(e) => setEmailToo(e.target.checked)} className="accent-sage" />
            {coordinatorEmail ? <>Also email {coordinatorEmail}</> : 'No coordinator email on file to send to'}
          </label>

          <div className="flex gap-2">
            <Button className="flex-1 justify-center" onClick={send} disabled={!canManage || amount <= 0 || busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {emailToo && coordinatorEmail ? 'Send to portal & email' : 'Send to portal'}
            </Button>
            <Button variant="ghost" onClick={() => printInvoice(draftFor())} disabled={amount <= 0}>
              <Download className="w-3.5 h-3.5" /> Download PDF
            </Button>
          </div>
          {banner && (
            <p className={`text-[12px] ${banner.tone === 'ok' ? 'text-green-muted-text' : 'text-red'}`}>{banner.text}</p>
          )}
          <p className="text-[11px] text-forest/45 leading-relaxed">
            "Send to portal" makes this invoice appear in the group's guest portal immediately. With the box checked, it also emails the coordinator a link (replies come back to you).
          </p>
        </div>

        {/* Sent invoices */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-forest/40 mb-2">
            {existing.length} invoice{existing.length === 1 ? '' : 's'} on file
          </p>
          {existing.length === 0 ? (
            <p className="text-[13px] text-forest/45 bg-cream rounded-card px-4 py-5 text-center">No invoices created yet.</p>
          ) : (
            <div className="rounded-card border border-border overflow-hidden">
              {existing.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                  <FileText className="w-4 h-4 text-forest/35 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-forest truncate">
                      {inv.number} · <span className="text-forest/55 capitalize">{inv.kind}</span>
                    </p>
                    <p className="text-[11px] text-forest/45">
                      {money(inv.amount)}{inv.dueDate ? ` · due ${fmtDateFull(inv.dueDate)}` : ''} · {inv.status}
                    </p>
                  </div>
                  {canManage && coordinatorEmail && retreat && (
                    <button onClick={() => emailInvoice(inv, retreat)} disabled={emailingId === inv.id} className="p-1.5 text-forest/40 hover:text-forest disabled:opacity-50" title={`Email to ${coordinatorEmail}`}>
                      {emailingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    </button>
                  )}
                  <button onClick={() => printInvoice(draftFor(inv))} className="p-1.5 text-forest/40 hover:text-forest" title="Download PDF">
                    <Download className="w-4 h-4" />
                  </button>
                  {canManage && (
                    <button onClick={() => { if (confirm(`Delete invoice ${inv.number}? It will disappear from the group's portal.`)) deleteInvoice(inv.id); }} className="p-1.5 text-forest/30 hover:text-red" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
