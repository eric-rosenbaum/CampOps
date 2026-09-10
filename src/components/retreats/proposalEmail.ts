// The quote as an email, in one place.
//
// It lives outside the modal because the camp needs to read it back later: "what exactly did we
// send them?" is the first question when a group calls about a number. The viewer and the sender
// build the same string from the same proposal row, so what you see afterwards is what went out.
import type { Retreat, RetreatProposal } from '@/lib/types';
import { money, fmtRange, fmtDateFull } from './retreatUi';

const esc = (t: string) =>
  t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

/** The lines, the total, the deposit, and the link to accept it. */
export function proposalEmailHtml(
  p: RetreatProposal,
  retreat: Retreat | null,
  campName: string,
  url: string,
  withAgreement = false,
): string {
  const rows = p.lineItems.map((l) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e7e2d6">${esc(l.description)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e7e2d6;text-align:right;white-space:nowrap">${money(l.amount)}</td>
      </tr>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a2e1a;max-width:560px">
      <p>Hello,</p>
      <p>${esc(campName)} has put together a quote for <strong>${esc(retreat?.groupName ?? 'your stay')}</strong>${
        retreat ? `, ${esc(fmtRange(retreat.arrivalDate, retreat.departureDate))}` : ''}.</p>
      ${p.intro ? `<p>${esc(p.intro).replace(/\n/g, '<br>')}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;margin:18px 0">
        ${rows}
        <tr>
          <td style="padding:10px 0;font-weight:700">Total</td>
          <td style="padding:10px 0;text-align:right;font-weight:700">${money(p.total)}</td>
        </tr>
        ${p.depositAmount ? `<tr>
          <td style="padding:2px 0;color:#5a6b5a">Deposit to hold the dates</td>
          <td style="padding:2px 0;text-align:right;color:#5a6b5a">${money(p.depositAmount)}</td>
        </tr>` : ''}
      </table>
      ${p.validUntil ? `<p style="color:#5a6b5a;font-size:13px">This quote stands until ${esc(fmtDateFull(p.validUntil))}.</p>` : ''}
      ${withAgreement ? `<p>Your retreat agreement is in the portal alongside this quote.
        <strong>Signing it is how you accept</strong> -- there is nothing else to send back.</p>` : ''}
      <p style="margin:24px 0">
        <a href="${url}" style="background:#2f4f2f;color:#fdfcf7;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">
          ${withAgreement ? 'Review and sign' : 'Review and accept'}
        </a>
      </p>
      ${p.terms ? `<p style="font-size:13px;color:#5a6b5a;border-top:1px solid #e7e2d6;padding-top:14px">${esc(p.terms).replace(/\n/g, '<br>')}</p>` : ''}
    </div>`;
}
