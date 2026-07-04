import { resolvePrefix } from '../task-filters.js';
import type { Store, TaskChanges } from '../store-interface.js';
import type { CreateTaskInput, Task, TaskFilter } from '../types.js';

// The authorization layer, applied server-side per request (routes.ts builds
// one from the identity access-auth.ts verified). Every read filters to the
// owner's tasks; every write stamps `owner`; a foreign id behaves exactly like
// a nonexistent one — the same "No task found" error, mapped to 404 by
// app.onError — so existence is never confirmed across namespaces.
//
// Legacy tasks (owner: null, everything created before this layer) belong to
// `defaultOwner` (TASK_MAN_DEFAULT_OWNER in deploy). They're adopted lazily:
// any update stamps the real owner, so the null population only shrinks.
// With defaultOwner unset, legacy tasks belong to nobody and are invisible.

const notFound = (idOrPrefix: string): Error =>
  new Error(`No task found matching prefix "${idOrPrefix}"`);

export function scopeStore(store: Store, owner: string, defaultOwner?: string): Store {
  const mine = (t: Task): boolean => (t.owner ?? defaultOwner ?? null) === owner;

  const loadMine = async (): Promise<Task[]> => (await store.load()).filter(mine);

  // Writes that reference other tasks (parent_id, id) must resolve within the
  // owner's slice. Exact-id lookup, not prefix — by the time inputs reach the
  // Store interface, handlers have already resolved prefixes.
  const assertOwnedId = async (id: string): Promise<void> => {
    const tasks = await loadMine();
    if (!tasks.some(t => t.id === id)) throw notFound(id);
  };

  // Prefixes resolve against the owner's tasks only: no cross-tenant
  // existence leaks, and short prefixes stay usable regardless of how many
  // tasks other namespaces hold.
  const resolveId = async (prefix: string): Promise<string> =>
    resolvePrefix(await loadMine(), prefix);

  return {
    load: loadMine,
    resolveId,

    async query(filter?: TaskFilter): Promise<Task[]> {
      return (await store.query(filter)).filter(mine);
    },

    async add(input: CreateTaskInput): Promise<Task> {
      if (input.parent_id) await assertOwnedId(input.parent_id);
      return store.add({ ...input, owner });
    },

    async update(id: string, changes: TaskChanges): Promise<Task> {
      const resolved = await resolveId(id);
      if (changes.parent_id) await assertOwnedId(changes.parent_id);
      // Stamping owner on every update is what lazily adopts legacy
      // (owner: null) tasks into an explicit namespace.
      return store.update(resolved, { ...changes, owner });
    },

    // remove/insertAt round-trip an index the TUI uses for undo and paste.
    // The client computes it against the list it sees — the scoped one — so
    // translate: report the position among the owner's tasks, and on insert
    // map that scoped position back to a global one (just before the owned
    // task currently holding that position; at the end when past the last).
    async remove(id: string): Promise<{ task: Task; index: number }> {
      const resolved = await resolveId(id);
      const all = await store.load();
      const globalIndex = all.findIndex(t => t.id === resolved);
      const scopedIndex = all.slice(0, globalIndex).filter(mine).length;
      const { task } = await store.remove(resolved);
      return { task, index: scopedIndex };
    },

    async insertAt(task: Task, index: number): Promise<Task> {
      const all = await store.load();
      const owned = all.filter(mine);
      const scoped = Math.max(0, index);
      const globalIndex =
        scoped >= owned.length
          ? all.length
          : all.findIndex(t => t.id === owned[scoped].id);
      return store.insertAt({ ...task, owner }, globalIndex);
    },

    async getCompletedOn(date: string): Promise<Task[]> {
      return (await store.getCompletedOn(date)).filter(mine);
    },

    async getCreatedOn(date: string): Promise<Task[]> {
      return (await store.getCreatedOn(date)).filter(mine);
    },

    async getInProgressUpdatedOn(date: string): Promise<Task[]> {
      return (await store.getInProgressUpdatedOn(date)).filter(mine);
    },
  };
}
