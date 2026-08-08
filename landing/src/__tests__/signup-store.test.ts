import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SignupStore } from '../signup-store.js';

describe('SignupStore', () => {
  let dir: string;
  let store: SignupStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'landing-signups-'));
    store = new SignupStore(join(dir, 'signups.json'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends a pending record and persists it to disk', async () => {
    const record = await store.append({ email: 'a@example.com', name: null, note: null });
    expect(record.status).toBe('pending');
    expect(record.email).toBe('a@example.com');

    const onDisk = JSON.parse(readFileSync(join(dir, 'signups.json'), 'utf-8'));
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0].id).toBe(record.id);
  });

  it('finds a record by email and by id', async () => {
    const record = await store.append({ email: 'b@example.com', name: 'B', note: null });
    expect(await store.findByEmail('b@example.com')).toEqual(record);
    expect(await store.findById(record.id)).toEqual(record);
    expect(await store.findByEmail('missing@example.com')).toBeUndefined();
  });

  it('updates status and persists the change', async () => {
    const record = await store.append({ email: 'c@example.com', name: null, note: null });
    const updated = await store.updateStatus(record.id, 'approved');
    expect(updated?.status).toBe('approved');
    expect((await store.findById(record.id))?.status).toBe('approved');
  });

  it('serializes concurrent appends without losing any record', async () => {
    const emails = Array.from({ length: 20 }, (_, i) => `user${i}@example.com`);
    await Promise.all(emails.map((email) => store.append({ email, name: null, note: null })));
    const all = await store.list();
    expect(all).toHaveLength(20);
    expect(new Set(all.map((r) => r.email)).size).toBe(20);
  });
});
