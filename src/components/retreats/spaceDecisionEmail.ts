// What the group hears when the camp answers a space request.
//
// A decline is the one that has to travel: they have planned a session around a room they are
// not getting, and finding that out by opening the portal on the day is how a retreat goes
// wrong. An approval says the same thing the portal already says, so it is opt-in.
const esc = (t: string) =>
  t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

export function spaceDecisionHtml(input: {
  outcome: 'approved' | 'declined';
  spaceName: string;
  campName: string;
  groupName: string;
  when: string;
  message: string;
  portalUrl: string;
}): string {
  const { outcome, spaceName, campName, groupName, when, message, portalUrl } = input;
  const lead = outcome === 'approved'
    ? `${esc(campName)} has confirmed <strong>${esc(spaceName)}</strong> for ${esc(groupName)}, ${esc(when)}.`
    : `${esc(campName)} is not able to give you <strong>${esc(spaceName)}</strong> for ${esc(when)}.`;
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a2e1a;max-width:560px">
    <p>Hello,</p>
    <p>${lead}</p>
    ${message ? `<p>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
    ${portalUrl ? `<p style="margin:24px 0">
      <a href="${portalUrl}" style="background:#2f4f2f;color:#fdfcf7;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">
        Open your portal
      </a>
    </p>` : ''}
    <p style="font-size:12.5px;color:#8a978a;margin:0">
      Everything for your stay is at this link — no password needed.
    </p>
  </div>`;
}
