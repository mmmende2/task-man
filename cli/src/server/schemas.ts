import { z } from 'zod';

// Request validation for every mutating route and filtered read. Zod objects
// strip unknown keys by default — that stripping is load-bearing: `owner`,
// `created_at`, `updated_at`, and `id` never appear in these schemas, so a
// client cannot assign them no matter what JSON it sends. Authorization
// (scoped-store.ts) is only as strong as this parser in front of it.

const status = z.enum(['todo', 'in_progress', 'done']);
const priority = z.enum(['low', 'medium', 'high']);
const scope = z.enum(['personal', 'professional']);
const createdBy = z.enum(['human', 'claude']);
const timeEstimate = z.enum(['<5m', '20m', '45m', '>1h', '>3h']);
const vibe = z.enum(['love', 'ok', 'dread']);

// ── /api/store/* (faithful Store primitives) ────────────────

// CreateTaskInput minus `owner` (server-stamped). created_by/session_id stay
// client-assignable here — this is the dialect RemoteStore uses to persist
// MCP attribution faithfully.
export const createInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: priority.optional(),
  scope: scope.optional(),
  categories: z.array(z.string()).optional(),
  parent_id: z.string().optional(),
  focused: z.boolean().optional(),
  created_by: createdBy.optional(),
  session_id: z.string().nullable().optional(),
  time_estimate: timeEstimate.nullable().optional(),
  vibe: vibe.nullable().optional(),
});

// TaskChanges minus `owner`.
export const changesSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: status.optional(),
  priority: priority.optional(),
  scope: scope.optional(),
  categories: z.array(z.string()).optional(),
  focused: z.boolean().optional(),
  completed_at: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  time_estimate: timeEstimate.nullable().optional(),
  vibe: vibe.nullable().optional(),
  parent_id: z.string().nullable().optional(),
});

export const storeAddBody = z.object({ input: createInputSchema });
export const storeUpdateBody = z.object({ id: z.string().min(1), changes: changesSchema });
export const storeRemoveBody = z.object({ id: z.string().min(1) });

// insertAt carries a full Task (the TUI's undo re-inserts what it removed).
// The task's own id/timestamps are legitimate here — it's a restore, not a
// create — but `owner` is still stripped and re-stamped by the scoped store.
export const insertTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  status,
  priority,
  scope,
  categories: z.array(z.string()),
  parent_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  focused: z.boolean(),
  created_by: createdBy,
  session_id: z.string().nullable(),
  time_estimate: timeEstimate.nullable(),
  vibe: vibe.nullable(),
});

export const storeInsertAtBody = z.object({
  task: insertTaskSchema,
  index: z.number().int().min(0),
});

// ── /api/tasks* (web convenience dialect) ───────────────────

// created_by/session_id deliberately absent: the server forces 'human'/null
// (the web user is Mario, not Claude).
export const webCreateBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: priority.optional(),
  scope: scope.optional(),
  categories: z.array(z.string()).optional(),
  parent_id: z.string().optional(),
  focused: z.boolean().optional(),
  time_estimate: timeEstimate.nullable().optional(),
  vibe: vibe.nullable().optional(),
});

export const webPatchBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: status.optional(),
  priority: priority.optional(),
  scope: scope.optional(),
  categories: z.array(z.string()).optional(),
  focused: z.boolean().optional(),
  completed_at: z.string().nullable().optional(),
  time_estimate: timeEstimate.nullable().optional(),
  vibe: vibe.nullable().optional(),
  parent_id: z.string().nullable().optional(),
});

// ── Query params ────────────────────────────────────────────

const boolish = z.enum(['true', 'false', '1', '0']).optional();

export const listQuery = z.object({
  scope: scope.optional(),
  status: status.optional(),
  focused: boolish,
  category: z.string().optional(),
  parent_id: z.string().optional(),
  include_done: boolish,
  sort: z.enum(['priority', 'created_at', 'created_at_desc', 'updated_at', 'focus']).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const searchQuery = z.object({
  q: z.string().optional(),
  query: z.string().optional(),
  scope: scope.optional(),
  status: status.optional(),
  include_done: boolish,
});

// Flattens a zod failure into the one-line `error` string the API dialects
// already use for 400s.
export function validationMessage(error: z.ZodError): string {
  const first = error.issues[0];
  const path = first.path.length ? first.path.join('.') : 'body';
  return `Invalid request: ${path}: ${first.message}`;
}
