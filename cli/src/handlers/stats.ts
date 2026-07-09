import type { Store } from '../store-interface.js';
import type { TaskScope } from '../types.js';
import { isLocalToday } from '../local-date.js';

export interface CategoryCount {
  name: string;
  count: number;
}

/**
 * Distinct category names with usage counts, ordered most-used first.
 * When `scope` is given, only tasks with that scope contribute — categories
 * have no stored scope of their own, so a scoped list is derived from the
 * tasks that use them (each task counted by its own scope field).
 */
export async function getCategories(store: Store, scope?: TaskScope): Promise<CategoryCount[]> {
  const counts = new Map<string, number>();
  for (const t of await store.load()) {
    if (scope && t.scope !== scope) continue;
    for (const c of t.categories) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface TaskStats {
  total: number;
  focused: number;
  in_progress: number;
  todo_focused: number;
  backlog: number;
  completed_today: number;
  subtasks_total: number;
  subtasks_done_today: number;
}

export async function getStats(store: Store): Promise<TaskStats> {
  const s: TaskStats = {
    total: 0, focused: 0, in_progress: 0, todo_focused: 0, backlog: 0,
    completed_today: 0, subtasks_total: 0, subtasks_done_today: 0,
  };
  for (const t of await store.load()) {
    const doneToday = isLocalToday(t.completed_at);
    if (t.parent_id !== null) {
      s.subtasks_total += 1;
      if (doneToday) s.subtasks_done_today += 1;
      continue;
    }
    s.total += 1;
    if (t.status === 'in_progress') s.in_progress += 1;
    if (t.focused && t.status !== 'done') s.focused += 1;
    if (t.focused && t.status === 'todo') s.todo_focused += 1;
    if (!t.focused && t.status !== 'done') s.backlog += 1;
    if (doneToday) s.completed_today += 1;
  }
  return s;
}
