import { Resend } from 'resend';
import type { TaskManConfig } from './types.js';

export async function sendEndOfDayEmail(config: TaskManConfig, html: string, date: string): Promise<void> {
  const { resendApiKey, to } = config.email;

  if (!resendApiKey) {
    throw new Error('Email not configured. Run: task-man config email.resendApiKey <key>');
  }
  if (!to) {
    throw new Error('Email recipient not configured. Run: task-man config email.to <address>');
  }

  const resend = new Resend(resendApiKey);

  const { error } = await resend.emails.send({
    from: 'Task Man <onboarding@resend.dev>',
    to: [to],
    subject: `Task Man — End of Day (${date})`,
    html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
