import type { TaskStore } from '../store.js';
import { isLocalToday } from '../local-date.js';

export interface CategoryCount {
  name: string;
  count: number;
}

/** Distinct category names with usage counts, ordered most-used first. */
export function getCategories(store: TaskStore): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const t of store.load()) {
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

export function getStats(store: TaskStore): TaskStats {
  const s: TaskStats = {
    total: 0, focused: 0, in_progress: 0, todo_focused: 0, backlog: 0,
    completed_today: 0, subtasks_total: 0, subtasks_done_today: 0,
  };
  for (const t of store.load()) {
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
