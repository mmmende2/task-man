import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25 ships an experimental global `localStorage` that is a broken stub
// unless started with `--localstorage-file` — its methods are undefined and it
// shadows jsdom's own. (sessionStorage has no such global, so jsdom's works.)
// Install a real in-memory Storage so app code using localStorage behaves like
// a browser under test.
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const store = createMemoryStorage();
  Object.defineProperty(globalThis, name, { configurable: true, value: store });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, { configurable: true, value: store });
  }
}

afterEach(() => {
  cleanup();
});
