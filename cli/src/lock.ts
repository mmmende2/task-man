import lockfile from 'proper-lockfile';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export async function withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(filePath)) {
    writeFileSync(filePath, '[]', 'utf-8');
  }

  const release = await lockfile.lock(filePath, {
    retries: { retries: 5, minTimeout: 100, maxTimeout: 1000 },
    stale: 10000,
  });

  try {
    return await fn();
  } finally {
    await release();
  }
}
