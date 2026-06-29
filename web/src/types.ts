// The web app talks JSON over /api; these types mirror cli/src/types.ts.
// We don't `import type` from task-man/types here because Vite would
// pull the cli's full type graph through the package; this stays small.

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskScope = 'personal' | 'professional';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  scope: TaskScope;
  categories: string[];
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  focused: boolean;
  created_by: 'human' | 'claude';
  session_id: string | null;
  time_estimate: '<5m' | '20m' | '45m' | '>1h' | '>3h' | null;
  vibe: 'love' | 'ok' | 'dread' | null;
}
