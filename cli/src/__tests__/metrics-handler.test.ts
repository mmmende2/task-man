import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { buildMetrics } from '../handlers/metrics.js';
import { localDateString } from '../local-date.js';

const TODAY = localDateString();

// Construct an ISO timestamp anchored to a local YYYY-MM-DD at noon so
// it's safely inside that day in any timezone.
function isoOnLocalDate(date: string, hour = 12): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
}

function priorDay(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return localDateString(d);
}

describe('buildMetrics', () => {
  let tmpDir: string;
  let store: TaskStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-metrics-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty report on an empty store', () => {
    const r = buildMetrics(store, TODAY);
    expect(r.stats.completed).toBe(0);
    expect(r.completedTasks).toEqual([]);
    expect(r.subtasksByParent).toEqual({});
    expect(r.lastWorkDay).toBeNull();
    expect(r.earliestDate).toBeNull();
  });

  it('counts a parent completed today as activity, with empty subtask list', async () => {
    const t = await store.add({ title: 'Ship it', focused: true });
    await store.update(t.id, { status: 'done' });

    const r = buildMetrics(store, TODAY);
    expect(r.stats.completed).toBe(1);
    expect(r.completedTasks.map((x) => x.title)).toEqual(['Ship it']);
    expect(r.subtasksByParent).toEqual({});
  });

  it('includes full subtree (todo + done) for parents with activity today', async () => {
    const parent = await store.add({ title: 'Parent', focused: true });
    const a = await store.add({ title: 'A', parent_id: parent.id });
    await store.add({ title: 'B', parent_id: parent.id });
    await store.update(a.id, { status: 'done' });

    const r = buildMetrics(store, TODAY);
    const children = r.subtasksByParent[parent.id];
    expect(children).toBeDefined();
    expect(children.map((c) => c.title).sort()).toEqual(['A', 'B']);
  });

  it('flags lastWorkDay as the most recent local-date with a completion strictly before `date`', async () => {
    const t1 = await store.add({ title: 'Old' });
    const t2 = await store.add({ title: 'Newer' });
    // Backdate completions by writing completed_at directly.
    await store.update(t1.id, { status: 'done', completed_at: isoOnLocalDate(priorDay(5)) });
    await store.update(t2.id, { status: 'done', completed_at: isoOnLocalDate(priorDay(2)) });

    const r = buildMetrics(store, TODAY);
    expect(r.lastWorkDay).toBe(priorDay(2));

    // Viewing the older day excludes it from "last work day"
    const r2 = buildMetrics(store, priorDay(2));
    expect(r2.lastWorkDay).toBe(priorDay(5));

    // Viewing the earliest excludes both
    const r3 = buildMetrics(store, priorDay(5));
    expect(r3.lastWorkDay).toBeNull();
  });

  it('reports earliestDate as the local-date of the oldest created_at', async () => {
    await store.add({ title: 'Today' });
    const r = buildMetrics(store, TODAY);
    expect(r.earliestDate).toBe(TODAY);
  });

  it('treats a parent as active when a subtask was completed that day (parent itself untouched)', async () => {
    const parent = await store.add({ title: 'Parent' });
    const sub = await store.add({ title: 'Sub', parent_id: parent.id });
    await store.update(sub.id, { status: 'done' });

    const r = buildMetrics(store, TODAY);
    // parent isn't in completedTasks/inProgressTasks (it's still todo) but
    // its subtree should be included via the subtask-completion bridge.
    expect(r.subtasksByParent[parent.id]).toBeDefined();
    expect(r.subtasksByParent[parent.id]).toHaveLength(1);
  });
});
