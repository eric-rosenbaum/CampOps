// Shared invoice renderer — used by the ops Invoice modal ("Download PDF") and the guest
// portal ("Download"). Produces a clean standalone invoice document and prints it.
export interface InvoiceRenderData {
  campName: string;
  groupName: string;
  number: string;
  kind: 'deposit' | 'balance';
  issuedAt: string;            // ISO timestamp
  dueDate: string | null;      // YYYY-MM-DD
  lineItems: { description: string; amount: number }[];
  amount: number;
  note: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
}

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.length <= 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export function invoiceHtml(d: InvoiceRenderData): string {
  const title = d.kind === 'deposit' ? 'Deposit Invoice' : 'Invoice';
  const rows = d.lineItems.length
    ? d.lineItems.map((l) => `<tr><td>${esc(l.description)}</td><td class="amt">${money(l.amount)}</td></tr>`).join('')
    : `<tr><td>${d.kind === 'deposit' ? 'Deposit to reserve dates' : 'Balance due'}</td><td class="amt">${money(d.amount)}</td></tr>`;
  const stay = d.arrivalDate && d.departureDate ? `${fmtDate(d.arrivalDate)} – ${fmtDate(d.departureDate)}` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} ${esc(d.number)} — ${esc(d.groupName)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a2e1a;max-width:720px;margin:0 auto;padding:48px 40px;font-size:14px;line-height:1.5}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2f4a2f;padding-bottom:20px;margin-bottom:28px}
    .camp{font-size:20px;font-weight:700;color:#2f4a2f}
    .doc{text-align:right}
    .doc h1{font-size:22px;margin:0 0 4px;letter-spacing:.02em;text-transform:uppercase;color:#2f4a2f}
    .doc .num{font-family:ui-monospace,Menlo,monospace;color:#6b7c6b;font-size:13px}
    .meta{display:flex;gap:48px;margin-bottom:28px}
    .meta .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a9a8a;font-weight:600;margin-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a9a8a;border-bottom:1px solid #d9e0d5;padding:8px 0}
    th.amt,td.amt{text-align:right;font-variant-numeric:tabular-nums}
    td{padding:11px 0;border-bottom:1px solid #eef1ea}
    .total{display:flex;justify-content:flex-end;margin-top:16px}
    .total .box{min-width:240px}
    .total .row{display:flex;justify-content:space-between;padding:6px 0}
    .total .due{font-size:18px;font-weight:700;color:#2f4a2f;border-top:2px solid #2f4a2f;padding-top:10px;margin-top:6px}
    .note{margin-top:32px;padding:16px;background:#f4f6f1;border-radius:8px;color:#4a5a4a;font-size:13px}
    .foot{margin-top:40px;text-align:center;color:#9aa89a;font-size:11px}
    @media print{body{padding:24px}}
  </style></head><body>
    <div class="head">
      <div><div class="camp">${esc(d.campName || 'Camp')}</div><div style="color:#6b7c6b;font-size:12px;margin-top:2px">Retreat invoice</div></div>
      <div class="doc"><h1>${esc(title)}</h1><div class="num">${esc(d.number)}</div></div>
    </div>
    <div class="meta">
      <div><div class="label">Billed to</div><div><strong>${esc(d.groupName)}</strong>${stay ? `<br><span style="color:#6b7c6b">${stay}</span>` : ''}</div></div>
      <div><div class="label">Issued</div><div>${fmtDate(d.issuedAt)}</div></div>
      <div><div class="label">Due</div><div>${fmtDate(d.dueDate)}</div></div>
    </div>
    <table><thead><tr><th>Description</th><th class="amt">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="total"><div class="box">
      <div class="row due"><span>${d.kind === 'deposit' ? 'Deposit due' : 'Total due'}</span><span>${money(d.amount)}</span></div>
    </div></div>
    ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
    <div class="foot">Please remit payment to ${esc(d.campName || 'the camp')} by the due date. Thank you.</div>
  </body></html>`;
}

/** Open the invoice in a new window and trigger the print dialog (save-as-PDF). */
export function printInvoice(d: InvoiceRenderData): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(invoiceHtml(d));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
  return true;
}
