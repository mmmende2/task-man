import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TASKS_FILE } from './constants.js';
import { withLock } from './lock.js';
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
    return JSON.parse(raw) as Task[];
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
      };

      tasks.push(newTask);
      await this.save(tasks);
      return newTask;
    });

    return task;
  }

  resolveId(prefix: string): string {
    const tasks = this.load();
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

  async update(id: string, changes: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'scope' | 'categories' | 'focused'>>): Promise<Task> {
    const resolvedId = this.resolveId(id);
    const updated = await withLock(this.filePath, async () => {
      const tasks = this.load();
      const index = tasks.findIndex(t => t.id === resolvedId);
      if (index === -1) throw new Error(`Task ${resolvedId} not found`);

      const now = new Date().toISOString();
      const task = tasks[index];

      Object.assign(task, changes, { updated_at: now });

      if (changes.status === 'done' && !task.completed_at) {
        task.completed_at = now;
      }
      if (changes.status && changes.status !== 'done') {
        task.completed_at = null;
      }

      await this.save(tasks);
      return task;
    });

    return updated;
  }

  query(filters: TaskFilter = {}): Task[] {
    let tasks = this.load();

    if (filters.scope) {
      tasks = tasks.filter(t => t.scope === filters.scope);
    }
    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    if (filters.focused !== undefined) {
      tasks = tasks.filter(t => t.focused === filters.focused);
    }
    if (filters.category) {
      tasks = tasks.filter(t => t.categories.includes(filters.category!));
    }

    return tasks;
  }

  getCompletedOn(date: string): Task[] {
    const tasks = this.load();
    return tasks.filter(t => t.completed_at && t.completed_at.startsWith(date));
  }

  getCreatedOn(date: string): Task[] {
    const tasks = this.load();
    return tasks.filter(t => t.created_at.startsWith(date));
  }

  getInProgressUpdatedOn(date: string): Task[] {
    const tasks = this.load();
    return tasks.filter(t => t.status === 'in_progress' && t.updated_at.startsWith(date));
  }
}
