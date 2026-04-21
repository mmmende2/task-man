import type { Task, TaskPriority } from './types.js';

const MAX_TASKS = 20;

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export type RefineReason =
  | 'no_scope'
  | 'from_claude'
  | 'stale_todo'
  | 'no_time_estimate'
  | 'no_vibe';

export interface RefineCandidate {
  task: Task;
  reasons: RefineReason[];
}

export function isRefineCandidate(t: Task): RefineReason[] {
  if (t.parent_id) return [];
  if (t.status === 'done') return [];
  const reasons: RefineReason[] = [];
  if (!t.scope) reasons.push('no_scope');
  if (t.created_by === 'claude') reasons.push('from_claude');
  if (t.status === 'todo' && daysSince(t.created_at) > 7) reasons.push('stale_todo');
  if (t.time_estimate == null) reasons.push('no_time_estimate');
  if (t.vibe == null) reasons.push('no_vibe');
  return reasons;
}

export function buildRefineQueue(tasks: Task[]): Task[] {
  const candidates = tasks.filter(t => isRefineCandidate(t).length > 0);

  const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
  candidates.sort((a, b) => {
    const pr = priorityRank[a.priority] - priorityRank[b.priority];
    if (pr !== 0) return pr;
    return a.created_at.localeCompare(b.created_at);
  });

  return candidates.slice(0, MAX_TASKS);
}

export function buildRefineQueueWithReasons(tasks: Task[]): RefineCandidate[] {
  return buildRefineQueue(tasks).map(task => ({
    task,
    reasons: isRefineCandidate(task),
  }));
}
