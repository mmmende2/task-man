import type { CreateTaskInput, Task, TaskFilter } from './types.js';

export type TaskChanges = Partial<Pick<Task,
  | 'title' | 'description' | 'status' | 'priority' | 'scope' | 'categories'
  | 'focused' | 'completed_at' | 'session_id' | 'time_estimate' | 'vibe' | 'parent_id'
  // owner is server-internal: stamped by scoped-store, stripped from request
  // bodies by schemas.ts. Present here so the stamp can flow through update().
  | 'owner'>>;

export interface Store {
  load(): Promise<Task[]>;
  query(filter?: TaskFilter): Promise<Task[]>;
  resolveId(prefix: string): Promise<string>;
  add(input: CreateTaskInput): Promise<Task>;
  update(id: string, changes: TaskChanges): Promise<Task>;
  remove(id: string): Promise<{ task: Task; index: number }>;
  insertAt(task: Task, index: number): Promise<Task>;
  getCompletedOn(date: string): Promise<Task[]>;
  getCreatedOn(date: string): Promise<Task[]>;
  getInProgressUpdatedOn(date: string): Promise<Task[]>;
}
