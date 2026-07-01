import { TaskStore } from './store.js';
import type { Store, TaskChanges } from './store-interface.js';
import type { CreateTaskInput, Task, TaskFilter } from './types.js';

export class LocalStore implements Store {
  constructor(private readonly inner: TaskStore = new TaskStore()) {}

  async load(): Promise<Task[]> {
    return this.inner.load();
  }
  async query(filter?: TaskFilter): Promise<Task[]> {
    return this.inner.query(filter);
  }
  async resolveId(prefix: string): Promise<string> {
    return this.inner.resolveId(prefix);
  }
  async add(input: CreateTaskInput): Promise<Task> {
    return this.inner.add(input);
  }
  async update(id: string, changes: TaskChanges): Promise<Task> {
    return this.inner.update(id, changes);
  }
  async remove(id: string): Promise<{ task: Task; index: number }> {
    return this.inner.remove(id);
  }
  async insertAt(task: Task, index: number): Promise<Task> {
    return this.inner.insertAt(task, index);
  }
  async getCompletedOn(date: string): Promise<Task[]> {
    return this.inner.getCompletedOn(date);
  }
  async getCreatedOn(date: string): Promise<Task[]> {
    return this.inner.getCreatedOn(date);
  }
  async getInProgressUpdatedOn(date: string): Promise<Task[]> {
    return this.inner.getInProgressUpdatedOn(date);
  }
}
