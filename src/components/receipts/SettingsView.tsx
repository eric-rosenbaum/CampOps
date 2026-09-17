import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useReceiptsStore } from '@/store/receiptsStore';
import { useCampStore } from '@/store/campStore';
import {
  dbDeleteCard, dbDeleteCode, dbSaveTaxSettings, dbUpsertCard, dbUpsertCode, refreshReceipts,
} from '@/lib/receiptsDb';
import { CLAIM_BASES, HST_RATE_PCT, PROVINCES, detectClaimBasis, taxPreset } from '@/lib/receipts';
import { TAX_LABELS, TAX_TYPES, type BudgetCode, type ClaimBasis, type ExpenseCard, type TaxRule, type TaxSettings } from '@/lib/receiptTypes';
import { Callout, SectionTitle, fieldClass, inputClass, labelClass, useEscape } from './receiptsUi';

export function SettingsView() {
  return (
    <div className="space-y-2" data-testid="receipt-settings">
      <CardsSection />
      <CodesSection />
      <TaxSection />
    </div>
  );
}

function useRefresh() {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const apply = useReceiptsStore((s) => s.apply);
  return () => { if (campId) void refreshReceipts(campId, apply); };
}

// ─── Cards ──────────────────────────────────────────────────────────────────

function CardsSection() {
  const campId = useCampStore((s) => s.currentCamp?.id ?? '');
  const members = useCampStore((s) => s.members);
  const cards = useReceiptsStore((s) => s.cards);
  const codes = useReceiptsStore((s) => s.codes);
  const refresh = useRefresh();
  const [editing, setEditing] = useState<ExpenseCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blank = (): ExpenseCard => ({
    id: crypto.randomUUID(), campId, label: '', holderMemberId: null, holderName: null, holderEmail: null,
    last4: null, defaultBudgetCodeId: null, active: true,
  });

  async function save(c: ExpenseCard) {
    setError(null);
    if (!c.label.trim()) { setError('Give the card a name, like "Visa ··4821".'); return; }
    if (c.last4 && !/^\d{4}$/.test(c.last4)) { setError('The last four digits are four numbers.'); return; }
    const res = await dbUpsertCard({ ...c, label: c.label.trim() });
    if (res.error) { setError(res.error); return; }
    setEditing(null);
    refresh();
  }

  async function remove(c: ExpenseCard) {
    if (!window.confirm(`Delete ${c.label}? Its statements are deleted too; receipts are kept.`)) return;
    const res = await dbDeleteCard(c.id);
    if (res.error) setError(res.error); else refresh();
  }

  return (
    <section>
      <SectionTitle title="Company cards" count={cards.length}>
        <Button size="sm" onClick={() => setEditing(blank())}><Plus className="h-3.5 w-3.5" /> Add card</Button>
      </SectionTitle>
      <p className="mb-2 text-[13px] text-ink-soft">A card holder sees the receipts on their own card and nobody else's. Finance (camp admins) sees every card.</p>
      {error && !editing && <Callout tone="red" className="mb-2">{error}</Callout>}
      <ul className="divide-y divide-border rounded-card border border-border bg-white">
        {cards.length === 0 && <li className="px-4 py-5 text-center text-[13px] text-ink-soft">No cards yet.</li>}
        {cards.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] font-bold ${c.active ? 'text-ink' : 'text-ink-faint line-through'}`}>{c.label}</p>
              <p className="text-[12.5px] text-ink-soft">
                {c.holderName ?? members.find((m) => m.id === c.holderMemberId)?.fullName ?? 'No holder'}
                {c.holderEmail ? ` · ${c.holderEmail}` : ''}
                {c.defaultBudgetCodeId ? ` · defaults to ${codes.find((x) => x.id === c.defaultBudgetCodeId)?.code ?? '—'}` : ''}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
            <button className="rounded-btn p-2 text-ink-soft hover:bg-red-bg hover:text-red" aria-label={`Delete ${c.label}`} onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>

      {editing && <EscapeCloses onClose={() => { setEditing(null); setError(null); }} />}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-label="Card">
          <div className="w-full rounded-t-modal bg-paper-card p-4 sm:max-w-md sm:rounded-modal sm:p-5">
            <h3 className="font-display text-[17px] font-bold text-forest">{cards.some((x) => x.id === editing.id) ? 'Edit card' : 'Add a card'}</h3>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelClass} htmlFor="card-label">Name</label>
                <input id="card-label" className={inputClass} value={editing.label} placeholder="Visa ··4821" onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="card-last4">Last 4</label>
                <input id="card-last4" inputMode="numeric" maxLength={4} className={inputClass} value={editing.last4 ?? ''} onChange={(e) => setEditing({ ...editing, last4: e.target.value.replace(/\D/g, '') || null })} />
              </div>
              <div className="col-span-3">
                <label className={labelClass} htmlFor="card-holder">Card holder</label>
                <select id="card-holder" className={inputClass} value={editing.holderMemberId ?? ''}
                        onChange={(e) => {
                          const m = members.find((x) => x.id === e.target.value);
                          setEditing({ ...editing, holderMemberId: m?.id ?? null, holderName: m?.fullName ?? editing.holderName });
                        }}>
                  <option value="">Not a CampCommand user</option>
                  {members.filter((m) => m.role !== 'viewer').map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                </select>
              </div>
              <div className="col-span-3 sm:col-span-2">
                <label className={labelClass} htmlFor="card-holder-name">Name on reminders</label>
                <input id="card-holder-name" className={inputClass} value={editing.holderName ?? ''} onChange={(e) => setEditing({ ...editing, holderName: e.target.value || null })} />
              </div>
              <div className="col-span-3">
                <label className={labelClass} htmlFor="card-email">Email for reminders</label>
                <input id="card-email" type="email" className={inputClass} value={editing.holderEmail ?? ''} placeholder="Blank: their login email"
                       onChange={(e) => setEditing({ ...editing, holderEmail: e.target.value || null })} />
              </div>
              <div className="col-span-3">
                <label className={labelClass} htmlFor="card-code">Default budget code</label>
                <select id="card-code" className={inputClass} value={editing.defaultBudgetCodeId ?? ''} onChange={(e) => setEditing({ ...editing, defaultBudgetCodeId: e.target.value || null })}>
                  <option value="">None</option>
                  {codes.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                </select>
              </div>
              <label className="col-span-3 flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> In use
              </label>
            </div>
            {error && <Callout tone="red" className="mt-3">{error}</Callout>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setEditing(null); setError(null); }}>Cancel</Button>
              <Button onClick={() => save(editing)}>Save card</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EscapeCloses({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  return null;
}

// ─── Budget codes ───────────────────────────────────────────────────────────

function CodesSection() {
  const campId = useCampStore((s) => s.currentCamp?.id ?? '');
  const codes = useReceiptsStore((s) => s.codes);
  const refresh = useRefresh();
  const [drafts, setDrafts] = useState<Record<string, BudgetCode>>({});
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const byId = new Map(codes.map((c) => [c.id, c]));
    for (const d of Object.values(drafts)) byId.set(d.id, d);
    return [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  }, [codes, drafts]);

  const edit = (c: BudgetCode, patch: Partial<BudgetCode>) => setDrafts((d) => ({ ...d, [c.id]: { ...c, ...patch } }));

  async function save(c: BudgetCode) {
    setError(null);
    if (!c.code.trim() || !c.name.trim()) { setError('A budget code needs a code and a name.'); return; }
    const res = await dbUpsertCode({ ...c, code: c.code.trim(), name: c.name.trim(), qbAccount: c.qbAccount?.trim() || null });
    if (res.error) { setError(res.error); return; }
    setDrafts((d) => { const n = { ...d }; delete n[c.id]; return n; });
    refresh();
  }

  async function remove(c: BudgetCode) {
    if (drafts[c.id] && !codes.some((x) => x.id === c.id)) { setDrafts((d) => { const n = { ...d }; delete n[c.id]; return n; }); return; }
    if (!window.confirm(`Delete ${c.code}? Receipts coded to it become uncoded. To keep history, untick "in use" instead.`)) return;
    const res = await dbDeleteCode(c.id);
    if (res.error) setError(res.error); else refresh();
  }

  return (
    <section>
      <SectionTitle title="Budget codes" count={codes.length}>
        <Button size="sm" onClick={() => {
          const c: BudgetCode = { id: crypto.randomUUID(), campId, code: '', name: '', qbAccount: null, active: true, sortOrder: (rows[rows.length - 1]?.sortOrder ?? 0) + 10 };
          setDrafts((d) => ({ ...d, [c.id]: c }));
        }}><Plus className="h-3.5 w-3.5" /> Add code</Button>
      </SectionTitle>
      <p className="mb-2 text-[13px] text-ink-soft">The buckets receipts are coded to, and the QuickBooks account each one goes to in the export.</p>
      {error && <Callout tone="red" className="mb-2">{error}</Callout>}
      <div className="overflow-x-auto rounded-card border border-border bg-white">
        <table className="w-full min-w-[620px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-paper-raised text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">
              <th className="w-28 px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">QuickBooks account</th>
              <th className="w-16 px-3 py-2">In use</th><th className="w-28 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-5 text-center text-ink-soft">No budget codes yet.</td></tr>}
            {rows.map((c) => {
              const dirty = !!drafts[c.id];
              return (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1.5"><input aria-label="Code" className={`${fieldClass} w-full py-1.5`} value={c.code} onChange={(e) => edit(c, { code: e.target.value.toUpperCase() })} /></td>
                  <td className="px-2 py-1.5"><input aria-label="Name" className={`${fieldClass} w-full py-1.5`} value={c.name} onChange={(e) => edit(c, { name: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input aria-label="QuickBooks account" className={`${fieldClass} w-full py-1.5`} value={c.qbAccount ?? ''} placeholder="e.g. Program Supplies" onChange={(e) => edit(c, { qbAccount: e.target.value })} /></td>
                  <td className="px-3 py-1.5 text-center"><input type="checkbox" aria-label="In use" checked={c.active} onChange={(e) => edit(c, { active: e.target.checked })} /></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    {dirty && <Button size="sm" onClick={() => save(c)}>Save</Button>}
                    <button className="ml-1 rounded-btn p-1.5 text-ink-soft hover:bg-red-bg hover:text-red" aria-label={`Delete ${c.code}`} onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Tax rules ──────────────────────────────────────────────────────────────

/**
 * How the camp gets sales tax back. A preset is chosen, never assumed: the three that cover nearly
 * every camp, filled in for its province, plus hand-typed rules. The sample used to be a flat
 * "HST 50%", which is wrong for an Ontario charity twice over (the provincial part of HST comes
 * back at 82%, not 50%) and wrong for a GST/HST registrant (100%).
 */
function TaxSection() {
  const campId = useCampStore((s) => s.currentCamp?.id ?? '');
  const campState = useCampStore((s) => s.currentCamp?.state ?? null);
  const saved = useReceiptsStore((s) => s.taxSettings);
  const refresh = useRefresh();
  const fallback: TaxSettings = { campId, currency: 'CAD', province: campState && PROVINCES.includes(campState as typeof PROVINCES[number]) ? campState : null, taxRules: [], claimBasis: null, confirmedAt: null };
  // What is saved, until the person starts editing; then their draft. Derived rather than copied
  // into state by an effect, so settings arriving late are shown without clobbering an edit.
  const [editDraft, setEditDraft] = useState<TaxSettings | null>(null);
  const [editConfirmed, setEditConfirmed] = useState<boolean | null>(null);
  const draft = editDraft ?? saved ?? fallback;
  const confirmed = editConfirmed ?? !!saved?.confirmedAt;
  const dirty = editDraft !== null || editConfirmed !== null;
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const basis: ClaimBasis | null = draft.taxRules.length ? detectClaimBasis(draft.taxRules, draft.province) : draft.claimBasis;

  const change = (patch: Partial<TaxSettings>) => { setEditDraft({ ...draft, ...patch }); setStatus(null); };
  const setRule = (i: number, patch: Partial<TaxRule>) => change({ taxRules: draft.taxRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const choose = (b: Exclude<ClaimBasis, 'custom'>) => { change({ claimBasis: b, taxRules: taxPreset(b, draft.province) }); setEditConfirmed(false); };

  async function save() {
    setError(null);
    const res = await dbSaveTaxSettings({ ...draft, claimBasis: basis }, confirmed);
    if (res.error) { setError(res.error); return; }
    setEditDraft(null); setEditConfirmed(null);
    setStatus('Saved.');
    refresh();
  }

  const num = (v: string) => Math.min(100, Math.max(0, Number(v.replace(',', '.')) || 0));
  const hstRate = HST_RATE_PCT[(draft.province ?? '').toUpperCase()];

  return (
    <section>
      <SectionTitle title="Sales tax rules" />
      <Callout tone="amber" className="mb-3">
        <b>Check these match how your camp claims sales tax back.</b> Registered camps claim input tax credits; charities and qualifying non-profits
        claim the public service bodies’ rebate; some claim nothing. The Summary uses these numbers for an <i>estimate</i> only.
      </Callout>
      <div className="rounded-card border border-border bg-white p-4" data-testid="tax-settings">
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div>
            <label className={labelClass} htmlFor="tax-province">Province</label>
            <select id="tax-province" className={inputClass} value={draft.province ?? ''}
                    onChange={(e) => {
                      const province = e.target.value || null;
                      // A preset follows the province; hand-typed rules are left alone.
                      const b = basis && basis !== 'custom' ? basis : null;
                      change({ province, ...(b ? { taxRules: taxPreset(b, province) } : {}) });
                    }}>
              <option value="">Choose…</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="tax-currency">Currency</label>
            <select id="tax-currency" className={inputClass} value={draft.currency} onChange={(e) => change({ currency: e.target.value as TaxSettings['currency'] })}>
              <option value="CAD">CAD</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <p className={`${labelClass} mt-4`}>How the camp claims tax back</p>
        <div className="space-y-2">
          {CLAIM_BASES.map((b) => (
            <label key={b.value} className={`flex items-start gap-2 rounded-btn border px-3 py-2 text-[13px] ${basis === b.value ? 'border-sage bg-paper-raised' : 'border-border'}`}>
              <input type="radio" name="claim-basis" className="mt-0.5" checked={basis === b.value} onChange={() => choose(b.value)} data-basis={b.value} />
              <span><b className="font-semibold">{b.label}</b><span className="block text-[12px] text-ink-soft">{b.hint}</span></span>
            </label>
          ))}
          <label className={`flex items-start gap-2 rounded-btn border px-3 py-2 text-[13px] ${basis === 'custom' ? 'border-sage bg-paper-raised' : 'border-border'}`}>
            <input type="radio" name="claim-basis" className="mt-0.5" checked={basis === 'custom'} onChange={() => change({ claimBasis: 'custom' })} />
            <span><b className="font-semibold">Custom</b><span className="block text-[12px] text-ink-soft">Type the percentages below. Changing any number makes the rules custom.</span></span>
          </label>
        </div>

        <p className={`${labelClass} mt-4`}>Recoverable share by tax</p>
        {draft.taxRules.length === 0 && <p className="text-[13px] text-ink-soft">No rules yet, so the recoverable estimate is $0. Choose one of the options above.</p>}
        <div className="space-y-2">
          {draft.taxRules.map((r, i) => {
            const split = r.type === 'HST' && r.federalPct != null && r.provincialPct != null;
            return (
              <div key={i} className="flex items-start gap-2">
                <select aria-label="Tax" className={`${fieldClass} w-28 flex-none`} value={r.type}
                        onChange={(e) => setRule(i, { type: e.target.value as TaxRule['type'], ...(e.target.value !== 'HST' ? { federalPct: null, provincialPct: null } : {}) })}>
                  {TAX_TYPES.map((t) => <option key={t} value={t}>{TAX_LABELS[t]}</option>)}
                </select>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
                {split ? (
                  <>
                    <PctInput label="HST federal part recoverable percent" value={r.federalPct!} onChange={(v) => setRule(i, { federalPct: num(v) })} />
                    <span className="text-[12.5px] text-ink-soft">of the federal 5%,</span>
                    <PctInput label="HST provincial part recoverable percent" value={r.provincialPct!} onChange={(v) => setRule(i, { provincialPct: num(v) })} />
                    <span className="text-[12.5px] text-ink-soft">of the provincial {hstRate ? `${hstRate - 5}%` : 'part'}</span>
                  </>
                ) : (
                  <>
                    <PctInput label={`${r.type} recoverable percent`} value={r.recoverablePct} onChange={(v) => setRule(i, { recoverablePct: num(v) })} />
                    <span className="text-[12.5px] text-ink-soft">recoverable</span>
                    {r.type === 'HST' && (
                      <button className="text-[12px] font-semibold text-forest underline" onClick={() => setRule(i, { federalPct: r.recoverablePct, provincialPct: r.recoverablePct })}>Split federal / provincial</button>
                    )}
                  </>
                )}
                </div>
                <button className="mt-1 flex-none rounded-btn p-1.5 text-ink-soft hover:bg-red-bg hover:text-red" aria-label="Remove rule" onClick={() => change({ taxRules: draft.taxRules.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => change({ taxRules: [...draft.taxRules, { type: 'GST', recoverablePct: 0 }] })}><Plus className="h-3.5 w-3.5" /> Add a tax</Button>
        </div>
        <p className="mt-3 text-[12px] text-ink-soft">
          HST is split into its federal and provincial parts using the rate printed on each receipt (Ontario 13%, Nova Scotia 14%, New Brunswick, Newfoundland and Labrador and PEI 15%).
          Rebate rates from the CRA’s guide RC4034 and Revenu Québec.
        </p>
        <label className="mt-4 flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setEditConfirmed(e.target.checked)} />
          <span>We’ve checked these match how our camp claims sales tax back{saved?.confirmedAt && confirmed ? ` (on ${new Date(saved.confirmedAt).toLocaleDateString('en-CA')})` : ''}.</span>
        </label>
        {error && <Callout tone="red" className="mt-3">{error}</Callout>}
        <div className="mt-4 flex items-center justify-end gap-3">
          {status && <span className="text-[13px] font-semibold text-green-muted-text">{status}</span>}
          <Button onClick={save} disabled={!dirty}>Save tax rules</Button>
        </div>
      </div>
    </section>
  );
}

function PctInput({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="relative w-24 flex-none">
      <input aria-label={label} inputMode="decimal" className={`${fieldClass} w-full pr-7 text-right tabular-nums`} value={text ?? String(value)}
             onChange={(e) => { setText(e.target.value); onChange(e.target.value); }} onBlur={() => setText(null)} />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-ink-soft">%</span>
    </div>
  );
}
