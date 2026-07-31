// Thin client for the `send-email` edge function (Resend). Used for retreat reminders and
// invoice emails. Returns a discriminated result so callers can show a precise message.
import { supabase } from './supabase';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  fromName?: string;   // camp name — appears before the @campcommand.app sender
  replyTo?: string;    // camp/staff email so the group replies to the camp
}

export type SendEmailResult = { ok: true; id?: string } | { ok: false; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
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

/** Build the customer-invite email (welcome + sign-in link). */
export function buildInviteEmail(campName: string, url: string): { subject: string; html: string } {
  const safeName = campName.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const subject = `Your CampCommand account for ${campName} is ready`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1a2e1a">
    <div style="font-size:18px;font-weight:600;color:#2f4f2f;margin-bottom:16px">CampCommand</div>
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hi there,</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px">
      Your CampCommand account for <strong>${safeName}</strong> has been created. Click below to set your
      password and sign in — you'll be the administrator and can invite your team.
    </p>
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
