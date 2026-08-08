import { z } from 'zod';

// Unknown keys are stripped by default (zod object semantics) — a client
// cannot smuggle `status`, `id`, etc. into a signup.
export const signupRequestSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254).email(),
  name: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
  turnstileToken: z.string().max(4000).optional(),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

// Flattens a zod failure into the one-line `error` string the API returns on
// a 400 — mirrors cli/src/server/schemas.ts's validationMessage.
export function validationMessage(error: z.ZodError): string {
  const first = error.issues[0];
  const path = first.path.length ? first.path.join('.') : 'body';
  return `Invalid request: ${path}: ${first.message}`;
}
