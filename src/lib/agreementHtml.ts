// Shared retreat-agreement renderer, used by the ops Relationship tab ("Print") and the guest
// portal ("Download your signed agreement"). Built the same way `invoiceHtml.ts` is built: one
// self-contained string, opened in a new window, printed straight to PDF — it is the same camp on
// the same letterhead, so the two sides must not look like two different companies.
//
// It carries the agreement BODY and the signature block, which the ops-only version of this
// document did not: a printed "Retreat agreement" that contains a price and no terms is not the
// thing either side signed.

export interface AgreementRenderData {
  campName: string;
  groupName: string;
  coordinatorName?: string | null;
  version: number;
  arrivalDate?: string | null;
  departureDate?: string | null;
  /** Fallback when there are no dates yet ("flexible, late June"). */
  dateNote?: string | null;
  headcount?: number | null;
  lineItems: { description: string; amount: number }[];
  total: number;
  intro?: string | null;
  /** The agreement itself, tokens already filled and frozen at the version that was sent. */
  agreementBody?: string | null;
  terms?: string | null;
  validUntil?: string | null;
  /** Who typed their name to sign. Null while it is still out. */
  signedBy?: string | null;
  /** ISO timestamp of the signature. */
  signedAt?: string | null;
  /**
   * Draw a box round any `{{token}}` the booking could not fill.
   *
   * Only ever true in the composer, where the point is to SEE the gaps before sending. What
   * actually goes out has every leftover token replaced by a ruled blank.
   */
  highlightGaps?: boolean;
}

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** A calendar day (`YYYY-MM-DD`) formatted as a day, never shifted by a timezone. */
function fmtDay(d: string | null | undefined): string {
  if (!d) return '-';
  const dt = d.length <= 10 ? new Date(`${d}T00:00:00`) : new Date(d);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** A signature is an instant, so it prints with the time on it. */
function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/**
 * The agreement body, escaped, with unfilled tokens optionally boxed.
 *
 * `esc` leaves braces alone, so the token match still works on the escaped string. The token is
 * printed as words rather than as `{{coordinator_phone}}` — a reviewer needs to know what is
 * missing, not what we call it internally.
 */
function bodyHtml(text: string, highlight: boolean): string {
  const escaped = esc(text);
  if (!highlight) return escaped;
  return escaped.replace(/\{\{([a-z_]+)\}\}/g,
    (_m, k: string) => `<mark class="gap">${esc(k.replace(/_/g, ' '))}</mark>`);
}

export function agreementHtml(d: AgreementRenderData): string {
  const rows = d.lineItems.length
    ? d.lineItems.map((l) => `<tr><td>${esc(l.description)}</td><td class="amt">${money(l.amount)}</td></tr>`).join('')
    : `<tr><td>Your stay</td><td class="amt">${money(d.total)}</td></tr>`;
  const stay = d.arrivalDate && d.departureDate
    ? `${fmtDay(d.arrivalDate)} – ${fmtDay(d.departureDate)}`
    : d.dateNote || 'Dates to be confirmed';
  const signed = Boolean(d.signedBy || d.signedAt);

  // The signature block prints whether or not it has been signed. An unsigned copy that simply
  // stops after the terms reads as a quote; this one says out loud that a name is still missing.
  const signature = signed
    ? `<div class="sig signed">
         <div class="sig-label">Signed electronically</div>
         <div class="sig-name">${esc(d.signedBy || 'Accepted')}</div>
         <div class="sig-meta">${esc([fmtStamp(d.signedAt), `for ${d.groupName}`].filter(Boolean).join(' · '))}</div>
         <div class="sig-note">Typed as a signature through the retreat portal. This copy records the
           agreement as it stood at version ${d.version}.</div>
       </div>`
    : `<div class="sig">
         <div class="sig-label">Signature</div>
         <div class="sig-rule"></div>
         <div class="sig-meta">Not yet signed${d.validUntil ? ` · this version stands until ${fmtDay(d.validUntil)}` : ''}</div>
       </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Retreat agreement · ${esc(d.groupName)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a2e1a;max-width:720px;margin:0 auto;padding:48px 40px;font-size:14px;line-height:1.5}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2f4a2f;padding-bottom:20px;margin-bottom:28px}
    .camp{font-size:20px;font-weight:700;color:#2f4a2f}
    .doc{text-align:right}
    .doc h1{font-size:22px;margin:0 0 4px;letter-spacing:.02em;text-transform:uppercase;color:#2f4a2f}
    .doc .num{font-family:ui-monospace,Menlo,monospace;color:#6b7c6b;font-size:13px}
    .meta{display:flex;gap:48px;margin-bottom:28px;flex-wrap:wrap}
    .meta .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a9a8a;font-weight:600;margin-bottom:4px}
    .intro{margin-bottom:28px;color:#4a5a4a;white-space:pre-wrap}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a9a8a;border-bottom:1px solid #d9e0d5;padding:8px 0}
    th.amt,td.amt{text-align:right;font-variant-numeric:tabular-nums}
    td{padding:11px 0;border-bottom:1px solid #eef1ea}
    .total{display:flex;justify-content:flex-end;margin-top:16px}
    .total .box{min-width:240px}
    .total .due{display:flex;justify-content:space-between;font-size:18px;font-weight:700;color:#2f4a2f;border-top:2px solid #2f4a2f;padding-top:10px}
    h2.sec{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a9a8a;margin:36px 0 10px}
    .body{white-space:pre-wrap;color:#1a2e1a}
    mark.gap{background:#fbeccd;color:#8a6414;border:1px solid #e8c887;border-radius:4px;padding:0 5px;font-weight:600;font-size:12.5px;white-space:nowrap}
    .terms{margin-top:28px;padding:16px;background:#f4f6f1;border-radius:8px;color:#4a5a4a;font-size:13px;white-space:pre-wrap}
    .terms h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a9a8a;margin:0 0 8px}
    .sig{margin-top:40px;padding-top:20px;border-top:1px solid #d9e0d5;page-break-inside:avoid}
    .sig-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a9a8a;font-weight:600;margin-bottom:8px}
    .sig-name{font-size:20px;font-weight:700;color:#2f4a2f}
    .sig-rule{height:1px;background:#1a2e1a;width:280px;margin:28px 0 8px}
    .sig-meta{color:#4a5a4a;font-size:13px;margin-top:4px}
    .sig-note{color:#8a9a8a;font-size:11.5px;margin-top:8px;max-width:520px;line-height:1.45}
    .foot{margin-top:40px;text-align:center;color:#9aa89a;font-size:11px}
    @media print{body{padding:24px}}
  </style></head><body>
    <div class="head">
      <div><div class="camp">${esc(d.campName || 'Camp')}</div><div style="color:#6b7c6b;font-size:12px;margin-top:2px">Retreat agreement</div></div>
      <div class="doc"><h1>Retreat agreement</h1><div class="num">Version ${d.version}</div></div>
    </div>
    <div class="meta">
      <div><div class="label">Prepared for</div><div><strong>${esc(d.groupName)}</strong>${d.coordinatorName ? `<br><span style="color:#4a5a4a">${esc(d.coordinatorName)}</span>` : ''}</div></div>
      <div><div class="label">Stay</div><div>${esc(stay)}</div></div>
      <div><div class="label">People</div><div>${d.headcount || '—'}</div></div>
      <div><div class="label">${signed ? 'Signed' : 'Valid until'}</div><div>${signed ? esc(fmtStamp(d.signedAt) || '—') : fmtDay(d.validUntil)}</div></div>
    </div>
    ${d.intro ? `<div class="intro">${esc(d.intro)}</div>` : ''}
    <table><thead><tr><th>Description</th><th class="amt">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="total"><div class="box"><div class="due"><span>Total</span><span>${money(d.total)}</span></div></div></div>
    ${d.agreementBody ? `<h2 class="sec">The agreement</h2><div class="body">${bodyHtml(d.agreementBody, Boolean(d.highlightGaps))}</div>` : ''}
    ${d.terms ? `<div class="terms"><h2>Terms</h2>${esc(d.terms)}</div>` : ''}
    ${signature}
    <div class="foot">${esc(d.campName || 'The camp')} · retreat agreement for ${esc(d.groupName)}</div>
  </body></html>`;
}

/**
 * Open the agreement in a new window and raise the print dialog, which is where "save as PDF"
 * lives on every platform we care about. Returns false when the pop-up was blocked, so the
 * caller can say so rather than looking like it did nothing.
 */
export function printAgreement(d: AgreementRenderData): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(agreementHtml(d));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
  return true;
}
