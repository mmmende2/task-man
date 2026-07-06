import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import { normalizeTask, migrateTasks } from '../commands/migrate.js';

describe('normalizeTask', () => {
  it('fills current-schema defaults for an older/sparse task', () => {
    const t = normalizeTask(
      { id: 'abc', title: 'old task', created_at: '2026-01-02T03:04:05.000Z' },
      'professional',
    );
    expect(t.id).toBe('abc');
    expect(t.title).toBe('old task');
    expect(t.created_at).toBe('2026-01-02T03:04:05.000Z'); // preserved
    expect(t.status).toBe('todo');
    expect(t.priority).toBe('medium');
    expect(t.scope).toBe('professional'); // default applied
    expect(t.categories).toEqual([]);
    expect(t.parent_id).toBeNull();
    expect(t.focused).toBe(false);
    expect(t.created_by).toBe('human');
    expect(t.time_estimate).toBeNull();
    expect(t.vibe).toBeNull();
    expect(t.completed_at).toBeNull();
  });

  it('preserves attribution + completion, and dates a done task with no timestamp', () => {
    const kept = normalizeTask(
      { id: 'x', title: 'done thing', status: 'done', completed_at: '2026-02-03T00:00:00.000Z', created_by: 'claude' },
      'personal',
    );
    expect(kept.completed_at).toBe('2026-02-03T00:00:00.000Z');
    expect(kept.created_by).toBe('claude');

    const dated = normalizeTask(
      { id: 'y', title: 'done, undated', status: 'done', updated_at: '2026-02-04T00:00:00.000Z' },
      'personal',
    );
    // done + no completed_at → falls back to updated_at so it lands on the calendar
    expect(dated.completed_at).toBe('2026-02-04T00:00:00.000Z');
  });

  it('coerces invalid enum values to safe defaults', () => {
    const t = normalizeTask({ id: 'z', title: 't', priority: 'urgent', scope: 'bogus', status: 'weird' }, 'personal');
    expect(t.priority).toBe('medium');
    expect(t.scope).toBe('personal');
    expect(t.status).toBe('todo');
  });
});

describe('migrateTasks', () => {
  let tmpDir: string;
  let dest: LocalStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-migrate-'));
    dest = new LocalStore(new TaskStore(join(tmpDir, 'tasks.json')));
  });
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  const raw = [
    { id: 'p1', title: 'parent', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 's1', title: 'child', parent_id: 'p1', created_at: '2026-01-01T00:00:01.000Z' },
    { id: 'd1', title: 'done one', status: 'done', completed_at: '2026-01-05T00:00:00.000Z', created_by: 'human' },
  ];

  it('imports tasks preserving id, timestamps, and attribution', async () => {
    const report = await migrateTasks(raw, dest, { defaultScope: 'professional' });
    expect(report.imported).toHaveLength(3);
    expect(report.skipped).toBe(0);
    expect(report.failed).toEqual([]);

    const all = await dest.load();
    const byId = new Map(all.map((t) => [t.id, t]));
    expect(byId.get('p1')?.created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(byId.get('s1')?.parent_id).toBe('p1');
    expect(byId.get('d1')?.completed_at).toBe('2026-01-05T00:00:00.000Z');
    expect(byId.get('d1')?.status).toBe('done');
    // default scope applied to tasks that had none
    expect(byId.get('p1')?.scope).toBe('professional');
  });

  it('is idempotent — a second run skips everything by id', async () => {
    await migrateTasks(raw, dest, { defaultScope: 'personal' });
    const second = await migrateTasks(raw, dest, { defaultScope: 'personal' });
    expect(second.imported).toHaveLength(0);
    expect(second.skipped).toBe(3);
    expect((await dest.load())).toHaveLength(3);
  });

  it('dry run writes nothing', async () => {
    const report = await migrateTasks(raw, dest, { defaultScope: 'personal', dryRun: true });
    expect(report.imported).toHaveLength(3);
    expect((await dest.load())).toHaveLength(0);
  });
});
