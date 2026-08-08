import { Resend } from 'resend';
import type { SignupRecord } from './signup-store.js';

export interface DecideLinks {
  approveUrl: string;
  denyUrl: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// Notifies the operator of a new signup. `links` is null when one-click
// approval (v2) isn't configured — the operator falls back to adding the
// email to the Access group by hand.
export async function sendSignupNotification(
  resendApiKey: string,
  to: string,
  record: Pick<SignupRecord, 'email' | 'name' | 'note'>,
  links: DecideLinks | null,
): Promise<void> {
  const resend = new Resend(resendApiKey);
  const linksHtml = links
    ? `<p><a href="${links.approveUrl}">Approve</a> &middot; <a href="${links.denyUrl}">Deny</a></p>`
    : `<p>One-click approval isn't configured — add this email to the <code>task-man-users</code> Access group manually.</p>`;

  const { error } = await resend.emails.send({
    from: 'task-man <onboarding@resend.dev>',
    to: [to],
    subject: `task-man signup request: ${record.email}`,
    html: `
      <p><strong>${escapeHtml(record.email)}</strong> requested access to task-man.</p>
      ${record.name ? `<p>Name: ${escapeHtml(record.name)}</p>` : ''}
      ${record.note ? `<p>Note: ${escapeHtml(record.note)}</p>` : ''}
      ${linksHtml}
    `,
  });

  if (error) {
    throw new Error(`Failed to send signup notification: ${error.message}`);
  }
}

export async function sendWelcomeEmail(resendApiKey: string, to: string, productUrl: string): Promise<void> {
  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: 'task-man <onboarding@resend.dev>',
    to: [to],
    subject: `You're in — task-man access approved`,
    html: `<p>You've been approved. Sign in at <a href="${productUrl}">${escapeHtml(productUrl)}</a>.</p>`,
  });

  if (error) {
    throw new Error(`Failed to send welcome email: ${error.message}`);
  }
}
