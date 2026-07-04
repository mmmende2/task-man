import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import type { Store } from '../store-interface.js';
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
  let store: Store;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-metrics-'));
    store = new LocalStore(new TaskStore(join(tmpDir, 'tasks.json')));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty report on an empty store', async () => {
    const r = await buildMetrics(store, TODAY);
    expect(r.stats.completed).toBe(0);
    expect(r.completedTasks).toEqual([]);
    expect(r.subtasksByParent).toEqual({});
    expect(r.lastWorkDay).toBeNull();
    expect(r.earliestDate).toBeNull();
  });

  it('counts a parent completed today as activity, with empty subtask list', async () => {
    const t = await store.add({ title: 'Ship it', focused: true });
    await store.update(t.id, { status: 'done' });

    const r = await buildMetrics(store, TODAY);
    expect(r.stats.completed).toBe(1);
    expect(r.completedTasks.map((x) => x.title)).toEqual(['Ship it']);
    expect(r.subtasksByParent).toEqual({});
  });

  it('includes full subtree (todo + done) for parents with activity today', async () => {
    const parent = await store.add({ title: 'Parent', focused: true });
    const a = await store.add({ title: 'A', parent_id: parent.id });
    await store.add({ title: 'B', parent_id: parent.id });
    await store.update(a.id, { status: 'done' });

    const r = await buildMetrics(store, TODAY);
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

    const r = await buildMetrics(store, TODAY);
    expect(r.lastWorkDay).toBe(priorDay(2));

    // Viewing the older day excludes it from "last work day"
    const r2 = await buildMetrics(store, priorDay(2));
    expect(r2.lastWorkDay).toBe(priorDay(5));

    // Viewing the earliest excludes both
    const r3 = await buildMetrics(store, priorDay(5));
    expect(r3.lastWorkDay).toBeNull();
  });

  it('reports earliestDate as the local-date of the oldest created_at', async () => {
    await store.add({ title: 'Today' });
    const r = await buildMetrics(store, TODAY);
    expect(r.earliestDate).toBe(TODAY);
  });

  describe('scope filtering', () => {
    beforeEach(async () => {
      const work = await store.add({ title: 'Work thing', scope: 'professional' });
      const home = await store.add({ title: 'Home thing', scope: 'personal' });
      await store.update(work.id, { status: 'done' });
      await store.update(home.id, { status: 'done' });
      // A professional completion two days back, for lastWorkDay.
      const oldWork = await store.add({ title: 'Old work', scope: 'professional' });
      await store.update(oldWork.id, { status: 'done', completed_at: isoOnLocalDate(priorDay(2)) });
      // A personal completion yesterday — must NOT count as a professional work day.
      const oldHome = await store.add({ title: 'Old home', scope: 'personal' });
      await store.update(oldHome.id, { status: 'done', completed_at: isoOnLocalDate(priorDay(1)) });
    });

    it('restricts counts and task lists to the requested scope', async () => {
      const pro = await buildMetrics(store, TODAY, 'professional');
      expect(pro.stats.completed).toBe(1);
      expect(pro.completedTasks.map((t) => t.title)).toEqual(['Work thing']);

      const per = await buildMetrics(store, TODAY, 'personal');
      expect(per.completedTasks.map((t) => t.title)).toEqual(['Home thing']);

      // Unscoped: both of today's completions (the backdated ones don't
      // count toward TODAY's stats).
      const all = await buildMetrics(store, TODAY);
      expect(all.stats.completed).toBe(2);
    });

    it('computes lastWorkDay within the scope', async () => {
      // Unscoped: yesterday (the personal completion) is the last day.
      const all = await buildMetrics(store, TODAY);
      expect(all.lastWorkDay).toBe(priorDay(1));
      // Professional: skips yesterday's personal completion.
      const pro = await buildMetrics(store, TODAY, 'professional');
      expect(pro.lastWorkDay).toBe(priorDay(2));
    });

    it('carries no insight when scoped (whole-day artifact only)', async () => {
      const pro = await buildMetrics(store, TODAY, 'professional');
      expect(pro.insight).toBeNull();
    });
  });

  it('treats a parent as active when a subtask was completed that day (parent itself untouched)', async () => {
    const parent = await store.add({ title: 'Parent' });
    const sub = await store.add({ title: 'Sub', parent_id: parent.id });
    await store.update(sub.id, { status: 'done' });

    const r = await buildMetrics(store, TODAY);
    // parent isn't in completedTasks/inProgressTasks (it's still todo) but
    // its subtree should be included via the subtask-completion bridge.
    expect(r.subtasksByParent[parent.id]).toBeDefined();
    expect(r.subtasksByParent[parent.id]).toHaveLength(1);
  });
});
