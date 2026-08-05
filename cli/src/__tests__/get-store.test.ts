import { describe, it, expect, vi, afterEach } from 'vitest';
import type { TaskManConfig } from '../types.js';

const config = { value: {} as TaskManConfig };

vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  return { ...actual, loadConfig: () => config.value };
});

const { getStore, createStoreResolver, StoreConfigError } = await import('../get-store.js');
const { RemoteStore } = await import('../remote-store.js');
const { LocalStore } = await import('../local-store.js');

function setClient(client: TaskManConfig['client']) {
  config.value = { client } as TaskManConfig;
}

describe('getStore honours client.mode as a contract', () => {
  afterEach(() => {
    config.value = {} as TaskManConfig;
  });

  it('builds a RemoteStore when remote mode is fully configured', () => {
    setClient({ mode: 'remote', remote_url: 'https://tasks.example.test' });
    expect(getStore()).toBeInstanceOf(RemoteStore);
  });

  it('builds a LocalStore in local mode', () => {
    setClient({ mode: 'local' });
    expect(getStore()).toBeInstanceOf(LocalStore);
  });

  // The regression: this used to fall through to the local store, so a client
  // configured for remote quietly read a completely different set of tasks.
  it('throws rather than silently downgrading remote mode with no URL', () => {
    setClient({ mode: 'remote' });
    expect(() => getStore()).toThrow(StoreConfigError);
    expect(() => getStore()).toThrow(/remote_url/);
  });

  it('createStoreResolver propagates the same refusal', () => {
    setClient({ mode: 'remote' });
    const resolve = createStoreResolver();
    expect(() => resolve()).toThrow(StoreConfigError);
  });

  it('createStoreResolver picks up a config fix without a restart', () => {
    setClient({ mode: 'local' });
    const resolve = createStoreResolver();
    expect(resolve()).toBeInstanceOf(LocalStore);

    setClient({ mode: 'remote', remote_url: 'https://tasks.example.test' });
    expect(resolve()).toBeInstanceOf(RemoteStore);
  });
});
