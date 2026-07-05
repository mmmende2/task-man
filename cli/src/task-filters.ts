import { isOnLocalDate } from './local-date.js';
import type { Task, TaskFilter, TaskScope } from './types.js';

export function applyFilter(tasks: Task[], filters: TaskFilter = {}): Task[] {
  let filtered = tasks;

  if (filters.scope) {
    filtered = filtered.filter(t => t.scope === filters.scope);
  }
  if (filters.status) {
    filtered = filtered.filter(t => t.status === filters.status);
  }
  if (filters.focused !== undefined) {
    filtered = filtered.filter(t => t.focused === filters.focused);
  }
  if (filters.category) {
    filtered = filtered.filter(t => t.categories.includes(filters.category!));
  }
  if (filters.parent_id !== undefined) {
    filtered = filtered.filter(t => t.parent_id === filters.parent_id);
  }

  return filtered;
}

export function resolvePrefix(tasks: Task[], prefix: string): string {
  const matches = tasks.filter(t => t.id.startsWith(prefix));

  if (matches.length === 0) {
    throw new Error(`No task found matching prefix "${prefix}"`);
  }
  if (matches.length > 1) {
    const ids = matches.map(t => `  ${t.id} — ${t.title}`).join('\n');
    throw new Error(`Multiple tasks match prefix "${prefix}":\n${ids}\nPlease use a longer prefix.`);
  }
  return matches[0].id;
}

// `date` is interpreted in the user's local time (YYYY-MM-DD). Without
// converting `completed_at`/`created_at`/`updated_at` (UTC ISO) to the
// local date first, end-of-day reports drop tasks that crossed UTC
// midnight — e.g. a task done at 6 PM PT on Sat 6/27 has
// completed_at starting with "2026-06-28Z" and would silently fall
// out of the Sat 6/27 report.
export function completedOn(tasks: Task[], date: string): Task[] {
  return tasks.filter(t => isOnLocalDate(t.completed_at, date));
}

export function createdOn(tasks: Task[], date: string): Task[] {
  return tasks.filter(t => isOnLocalDate(t.created_at, date));
}

export function inProgressUpdatedOn(tasks: Task[], date: string): Task[] {
  return tasks.filter(t => t.status === 'in_progress' && isOnLocalDate(t.updated_at, date));
}

// Scope filtering with parent-scope semantics: a subtask belongs to its
// parent's scope, not its own stored one. Subtasks inherit scope at creation
// but do NOT follow later S-toggles on the parent, so their own field can
// drift — and Focus/Plan already render subtasks under their parent
// regardless of the subtask's field. Orphaned subtasks fall back to their
// own scope.
export function filterByScope(tasks: Task[], scope: TaskScope | undefined): Task[] {
  if (!scope) return tasks;
  const parentScope = new Map(
    tasks.filter(t => t.parent_id === null).map(t => [t.id, t.scope]),
  );
  return tasks.filter(t => {
    const effective = t.parent_id ? parentScope.get(t.parent_id) ?? t.scope : t.scope;
    return effective === scope;
  });
}
