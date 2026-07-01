import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TASKS_FILE } from './constants.js';
import { withLock } from './lock.js';
import { applyFilter, completedOn, createdOn, inProgressUpdatedOn, resolvePrefix } from './task-filters.js';
import type { TaskChanges } from './store-interface.js';
import type { CreateTaskInput, Task, TaskFilter } from './types.js';

export class TaskStore {
  private filePath: string;

  constructor(filePath: string = TASKS_FILE) {
    this.filePath = filePath;
  }

  load(): Task[] {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.filePath)) {
      return [];
    }
    const raw = readFileSync(this.filePath, 'utf-8');
    const tasks = JSON.parse(raw) as Task[];
    for (const t of tasks) {
      if (t.time_estimate === undefined) t.time_estimate = null;
      if (t.vibe === undefined) t.vibe = null;
    }
    return tasks;
  }

  private async save(tasks: Task[]): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmpPath = join(dir, `.tasks-${Date.now()}.tmp`);
    writeFileSync(tmpPath, JSON.stringify(tasks, null, 2), 'utf-8');
    renameSync(tmpPath, this.filePath);
  }

  async add(input: CreateTaskInput): Promise<Task> {
    const task = await withLock(this.filePath, async () => {
      const tasks = this.load();
      const now = new Date().toISOString();

      let scope = input.scope ?? 'personal';
      if (input.parent_id) {
        const parent = tasks.find(t => t.id === input.parent_id);
        if (parent) {
          scope = parent.scope;
        }
      }

      const newTask: Task = {
        id: randomUUID(),
        title: input.title,
        description: input.description ?? null,
        status: 'todo',
        priority: input.priority ?? 'medium',
        scope,
        categories: input.categories ?? [],
        parent_id: input.parent_id ?? null,
        created_at: now,
        updated_at: now,
        completed_at: null,
        focused: input.focused ?? false,
        created_by: input.created_by ?? 'human',
        session_id: input.session_id ?? null,
        time_estimate: input.time_estimate ?? null,
        vibe: input.vibe ?? null,
      };

      tasks.push(newTask);
      await this.save(tasks);
      return newTask;
    });

    return task;
  }

  resolveId(prefix: string): string {
    return resolvePrefix(this.load(), prefix);
  }

  async update(id: string, changes: TaskChanges): Promise<Task> {
    const resolvedId = this.resolveId(id);
    const updated = await withLock(this.filePath, async () => {
      const tasks = this.load();
      const index = tasks.findIndex(t => t.id === resolvedId);
      if (index === -1) throw new Error(`Task ${resolvedId} not found`);

      const now = new Date().toISOString();
      const task = tasks[index];

      Object.assign(task, changes, { updated_at: now });

      // If completed_at was explicitly provided, use it as-is
      if ('completed_at' in changes) {
        task.completed_at = changes.completed_at ?? null;
      } else if (changes.status === 'done' && !task.completed_at) {
        task.completed_at = now;
      } else if (changes.status && changes.status !== 'done') {
        task.completed_at = null;
      }

      await this.save(tasks);
      return task;
    });

    return updated;
  }

  query(filters: TaskFilter = {}): Task[] {
    return applyFilter(this.load(), filters);
  }

  getCompletedOn(date: string): Task[] {
    return completedOn(this.load(), date);
  }

  getCreatedOn(date: string): Task[] {
    return createdOn(this.load(), date);
  }

  getInProgressUpdatedOn(date: string): Task[] {
    return inProgressUpdatedOn(this.load(), date);
  }

  async remove(id: string): Promise<{ task: Task; index: number }> {
    const resolvedId = this.resolveId(id);
    const result = await withLock(this.filePath, async () => {
      const tasks = this.load();
      const index = tasks.findIndex(t => t.id === resolvedId);
      if (index === -1) throw new Error(`Task ${resolvedId} not found`);
      const [task] = tasks.splice(index, 1);
      await this.save(tasks);
      return { task, index };
    });
    return result;
  }

  async insertAt(task: Task, index: number): Promise<Task> {
    const inserted = await withLock(this.filePath, async () => {
      const tasks = this.load();
      const clampedIndex = Math.max(0, Math.min(index, tasks.length));
      const updated = { ...task, updated_at: new Date().toISOString() };
      tasks.splice(clampedIndex, 0, updated);
      await this.save(tasks);
      return updated;
    });
    return inserted;
  }
}
