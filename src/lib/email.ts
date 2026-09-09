// Thin client for the `send-email` edge function (Resend). Used for retreat reminders and
// invoice emails. Returns a discriminated result so callers can show a precise message.
import { supabase } from './supabase';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  fromName?: string;   // camp name, appears before the @campcommand.app sender
  replyTo?: string;    // camp/staff email so the group replies to the camp
  fromEmail?: string;  // sender address; must be within campcommand.app or it's ignored
}

export type SendEmailResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Deliberately stricter than `<input type="email">`, which happily accepts `eric@campcommandapp`
 * because the HTML spec does not require a dot in the domain. That address is a typo every time,
 * and letting it save means the failure only shows up later, at the moment someone tries to send.
 */
export function isValidEmail(s: string | null | undefined): boolean {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s.trim());
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // Say which address is wrong. The function's own "a valid recipient email is required" is
  // true but useless when the address is one character off and sitting on another screen.
  if (!isValidEmail(input.to)) {
    return { ok: false, error: `"${input.to}" is not a valid email address. Fix it under Contacts and try again.` };
  }
  const { data, error } = await supabase.functions.invoke('send-email', { body: input });
  if (error) {
    // The function returns a JSON error body; surface it when available.
    let msg = error.message || 'Could not send email.';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) msg = body.error;
      }
    } catch { /* keep default message */ }
    return { ok: false, error: msg };
  }
  if (!(data as { ok?: boolean })?.ok) return { ok: false, error: 'Email was not sent.' };
  return { ok: true, id: (data as { id?: string }).id };
}

/**
 * Build an invite email (welcome + set-password link). `owner` = the customer admin we provisioned
 * (they run the camp); otherwise it's a team member invited by a camp admin.
 */
export function buildInviteEmail(campName: string, url: string, opts?: { owner?: boolean }): { subject: string; html: string } {
  const owner = opts?.owner ?? true;
  const safeName = campName.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const subject = owner
    ? `Your CampCommand account for ${campName} is ready`
    : `You're invited to join ${campName} on CampCommand`;
  const intro = owner
    ? `Your CampCommand account for <strong>${safeName}</strong> has been created. Click below to set your password and sign in. You'll be the administrator and can invite your team.`
    : `You've been invited to join <strong>${safeName}</strong> on CampCommand. Click below to set your password and sign in.`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1a2e1a">
    <div style="font-size:18px;font-weight:600;color:#2f4f2f;margin-bottom:16px">CampCommand</div>
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hi there,</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px">${intro}</p>
    <p style="margin:24px 0">
      <a href="${url}" style="background:#2f4f2f;color:#fdfcf7;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">
        Set up your account
      </a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#5a6b5a;margin:0 0 6px">Or paste this link into your browser:</p>
    <p style="font-size:13px;line-height:1.5;word-break:break-all;margin:0 0 20px"><a href="${url}" style="color:#2f4f2f">${url}</a></p>
    <p style="font-size:12px;color:#8a978a;line-height:1.6;margin:20px 0 0;border-top:1px solid #e7e2d6;padding-top:14px">
      If you weren't expecting this, you can ignore this email.
    </p>
  </div>`;
  return { subject, html };
}

/** Wrap plain text (user-typed reminders) into simple, safe HTML. */
export function textToHtml(text: string): string {
  const esc = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a2e1a">${esc.replace(/\n/g, '<br>')}</div>`;
}

/**
 * A reminder, with the way to act on it.
 *
 * Reminders used to go out as bare text: "please upload your certificate of insurance" and no
 * link. The portal is where every one of those things is actually done, and the group has no
 * reason to keep the URL to hand, so the ask and the place to do it now travel together.
 */
export function reminderHtml(text: string, portalUrl: string, campName?: string): string {
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a2e1a;max-width:560px">
    <div style="white-space:pre-wrap">${esc(text)}</div>
    <p style="margin:24px 0">
      <a href="${portalUrl}" style="background:#2f4f2f;color:#fdfcf7;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">
        Open your portal
      </a>
    </p>
    <p style="font-size:12.5px;color:#8a978a;line-height:1.6;margin:0">
      Everything for your stay${campName ? ` at ${esc(campName)}` : ''} lives at this link — no password needed.
    </p>
  </div>`;
}
