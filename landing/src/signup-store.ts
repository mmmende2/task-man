import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type SignupStatus = 'pending' | 'approved' | 'denied';

export interface SignupRecord {
  id: string;
  email: string;
  name: string | null;
  note: string | null;
  ts: string;
  status: SignupStatus;
}

// Serializes load-modify-save so concurrent requests in this single process
// can't race a lost update (the tasks store uses proper-lockfile for the same
// reason, but that's guarding multiple OS processes sharing a file — here
// it's all one process, so an in-process queue is enough).
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class SignupStore {
  private mutex = new Mutex();

  constructor(private filePath: string) {}

  private loadSync(): SignupRecord[] {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(this.filePath)) return [];
    return JSON.parse(readFileSync(this.filePath, 'utf-8')) as SignupRecord[];
  }

  private saveSync(records: SignupRecord[]): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmpPath = join(dir, `.signups-${Date.now()}-${randomUUID()}.tmp`);
    writeFileSync(tmpPath, JSON.stringify(records, null, 2), 'utf-8');
    renameSync(tmpPath, this.filePath);
  }

  list(): Promise<SignupRecord[]> {
    return this.mutex.run(() => this.loadSync());
  }

  findByEmail(email: string): Promise<SignupRecord | undefined> {
    return this.mutex.run(() => this.loadSync().find((r) => r.email === email));
  }

  findById(id: string): Promise<SignupRecord | undefined> {
    return this.mutex.run(() => this.loadSync().find((r) => r.id === id));
  }

  append(input: { email: string; name: string | null; note: string | null }): Promise<SignupRecord> {
    return this.mutex.run(() => {
      const records = this.loadSync();
      const record: SignupRecord = {
        id: randomUUID(),
        email: input.email,
        name: input.name,
        note: input.note,
        ts: new Date().toISOString(),
        status: 'pending',
      };
      records.push(record);
      this.saveSync(records);
      return record;
    });
  }

  updateStatus(id: string, status: SignupStatus): Promise<SignupRecord | undefined> {
    return this.mutex.run(() => {
      const records = this.loadSync();
      const record = records.find((r) => r.id === id);
      if (!record) return undefined;
      record.status = status;
      this.saveSync(records);
      return record;
    });
  }
}
