import type { Store, TaskChanges } from '../store-interface.js';
import type {
  CreatedBy,
  Task,
  TaskFilter,
  TaskPriority,
  TaskScope,
  TaskStatus,
  TimeEstimate,
  Vibe,
} from '../types.js';

// ── Sorting ─────────────────────────────────────────────────
// Shared comparator used by the MCP tools and the web Focus view.
// The 'focus' key is the composite sort the TUI Focus view wants
// (priority desc, then updated_at desc) — pinned here so the two
// surfaces can't drift.

export type SortKey =
  | 'priority'
  | 'created_at'
  | 'created_at_desc'
  | 'updated_at'
  | 'focus';

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

export function sortTasks(tasks: Task[], sort?: SortKey): Task[] {
  if (!sort) return tasks;
  const sorted = [...tasks];
  switch (sort) {
    case 'priority':
      sorted.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
      break;
    case 'created_at':
      sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
      break;
    case 'created_at_desc':
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    case 'updated_at':
      sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      break;
    case 'focus':
      sorted.sort((a, b) => {
        const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (p !== 0) return p;
        return b.updated_at.localeCompare(a.updated_at);
      });
      break;
  }
  return sorted;
}

// ── createTask ──────────────────────────────────────────────

export interface CreateTaskInput {
  title: string;
  priority?: TaskPriority;
  scope?: TaskScope;
  categories?: string[];
  /** Parent task ID (prefix OK); resolved here. */
  parent_id?: string;
  description?: string;
  focused?: boolean;
  time_estimate?: TimeEstimate | null;
  vibe?: Vibe | null;
  created_by?: CreatedBy;
  session_id?: string | null;
}

export async function createTask(store: Store, input: CreateTaskInput): Promise<Task> {
  const parent_id = input.parent_id ? await store.resolveId(input.parent_id) : undefined;
  return store.add({ ...input, parent_id });
}

// ── listTasks ───────────────────────────────────────────────

export interface ListTasksInput {
  scope?: TaskScope;
  status?: TaskStatus;
  focused?: boolean;
  category?: string;
  /**
   * undefined → no filter; null or the string 'null' → top-level only;
   * any other string → resolved as a task id prefix.
   * The 'null' sentinel is the MCP/query-string convention; accepting
   * it here lets both adapters be passthroughs.
   */
  parent_id?: string | null;
  include_done?: boolean;
  sort?: SortKey;
  limit?: number;
}

export async function listTasks(store: Store, input: ListTasksInput = {}): Promise<Task[]> {
  const filters: TaskFilter = {
    scope: input.scope,
    status: input.status,
    focused: input.focused,
    category: input.category,
  };
  if (input.parent_id !== undefined) {
    filters.parent_id =
      input.parent_id === null || input.parent_id === 'null'
        ? null
        : await store.resolveId(input.parent_id);
  }
  let tasks = await store.query(filters);
  if (input.include_done === false && !input.status) {
    tasks = tasks.filter(t => t.status !== 'done');
  }
  tasks = sortTasks(tasks, input.sort);
  if (input.limit && input.limit > 0) tasks = tasks.slice(0, input.limit);
  return tasks;
}

// ── getTask ─────────────────────────────────────────────────

export async function getTask(store: Store, id: string): Promise<{ task: Task; subtasks: Task[] } | null> {
  const resolvedId = await store.resolveId(id);
  const all = await store.load();
  const task = all.find(t => t.id === resolvedId);
  if (!task) return null;
  const subtasks = all.filter(t => t.parent_id === resolvedId);
  return { task, subtasks };
}

// ── updateTask ──────────────────────────────────────────────
// NOTE: carries NO top-level-completion guard. That guard is
// Claude-specific and lives in the MCP adapter only — on the web
// the user IS Mario and marking a focused parent done is the
// headline action. Do not lift the guard into this handler.

export interface UpdateTaskInput {
  id: string;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  scope?: TaskScope;
  categories?: string[];
  description?: string;
  focused?: boolean;
  time_estimate?: TimeEstimate | null;
  vibe?: Vibe | null;
  parent_id?: string | null;
  completed_at?: string | null;
  session_id?: string | null;
}

export async function updateTask(store: Store, input: UpdateTaskInput): Promise<Task> {
  const resolvedId = await store.resolveId(input.id);

  const changes: TaskChanges = {};
  if (input.title !== undefined) changes.title = input.title;
  if (input.status !== undefined) changes.status = input.status;
  if (input.priority !== undefined) changes.priority = input.priority;
  if (input.scope !== undefined) changes.scope = input.scope;
  if (input.categories !== undefined) changes.categories = input.categories;
  if (input.description !== undefined) changes.description = input.description;
  if (input.focused !== undefined) changes.focused = input.focused;
  if (input.time_estimate !== undefined) changes.time_estimate = input.time_estimate;
  if (input.vibe !== undefined) changes.vibe = input.vibe;
  if (input.completed_at !== undefined) changes.completed_at = input.completed_at;
  if (input.session_id !== undefined) changes.session_id = input.session_id;
  if (input.parent_id !== undefined) {
    if (input.parent_id === null) {
      changes.parent_id = null;
    } else {
      const resolvedParent = await store.resolveId(input.parent_id);
      if (resolvedParent === resolvedId) {
        throw new Error('A task cannot be its own parent.');
      }
      changes.parent_id = resolvedParent;
    }
  }

  return store.update(resolvedId, changes);
}

// ── deleteTask ──────────────────────────────────────────────

export async function deleteTask(
  store: Store,
  id: string,
): Promise<{ task: Task; danglingSubtasks: number }> {
  const resolvedId = await store.resolveId(id);
  const subtasks = await store.query({ parent_id: resolvedId });
  const { task } = await store.remove(resolvedId);
  return { task, danglingSubtasks: subtasks.length };
}

// ── completeTask ────────────────────────────────────────────
// No top-level guard — see updateTask note.

export async function completeTask(store: Store, id: string): Promise<Task> {
  return store.update(id, { status: 'done' });
}

// ── startTask / focusTask / unfocusTask ─────────────────────
// session_id is only touched when explicitly provided (the MCP
// tools attribute the active Claude session; the web leaves it).

// session_id is only touched when explicitly provided — MCP attributes
// the active Claude session, the web leaves the existing value alone.
function sessionPatch(opts: { session_id?: string | null }) {
  return opts.session_id === undefined ? {} : { session_id: opts.session_id };
}

export async function startTask(
  store: Store,
  id: string,
  opts: { session_id?: string | null } = {},
): Promise<Task> {
  return store.update(id, { status: 'in_progress', ...sessionPatch(opts) });
}

export async function focusTask(
  store: Store,
  id: string,
  opts: { session_id?: string | null } = {},
): Promise<Task> {
  return store.update(id, { focused: true, ...sessionPatch(opts) });
}

export async function unfocusTask(store: Store, id: string): Promise<Task> {
  return store.update(id, { focused: false });
}

// ── searchTasks ─────────────────────────────────────────────

export interface SearchTasksInput {
  query: string;
  scope?: TaskScope;
  status?: TaskStatus;
  include_done?: boolean;
}

export async function searchTasks(store: Store, input: SearchTasksInput): Promise<Task[]> {
  const q = input.query.toLowerCase();
  const all = await store.load();
  let matches = all.filter(t => {
    const title = t.title.toLowerCase();
    const desc = (t.description ?? '').toLowerCase();
    return title.includes(q) || desc.includes(q);
  });
  if (input.scope) matches = matches.filter(t => t.scope === input.scope);
  if (input.status) matches = matches.filter(t => t.status === input.status);
  if (input.include_done === false && !input.status) {
    matches = matches.filter(t => t.status !== 'done');
  }
  return matches;
}
