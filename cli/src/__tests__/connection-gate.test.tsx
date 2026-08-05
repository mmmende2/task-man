import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import stripAnsi from 'strip-ansi';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';
import { RemoteStoreError } from '../remote-store.js';
import { StoreConfigError } from '../get-store.js';

/**
 * The 0.7.0 report: after a release that invalidated the Access session, the
 * TUI opened on a normal-looking, completely empty task list. Nothing said
 * "log in" — the failure had been swallowed and `tasks` simply stayed `[]`.
 * These tests exist so an unreadable store can never render as data again.
 */

const failWith = (err: Error) => ({
  load: vi.fn(() => Promise.reject(err)),
  query: vi.fn(() => Promise.reject(err)),
  update: vi.fn(() => Promise.reject(err)),
  getCompletedOn: vi.fn(() => Promise.reject(err)),
  getInProgressUpdatedOn: vi.fn(() => Promise.reject(err)),
  getCreatedOn: vi.fn(() => Promise.reject(err)),
});

const REMOTE_URL = 'https://tasks.example.test';

const state = { store: null as unknown, buildError: null as Error | null };

vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  return {
    ...actual,
    loadConfig: () => ({ client: { mode: 'remote', remote_url: REMOTE_URL }, sessions: {} }),
  };
});

vi.mock('../get-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../get-store.js')>();
  return {
    ...actual,
    getStore: () => {
      if (state.buildError) throw state.buildError;
      return state.store;
    },
  };
});

const { InteractiveApp } = await import('../ui/InteractiveApp.js');

function render() {
  return renderWithDimensions(createElement(InteractiveApp));
}

describe('remote connection gate', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    state.store = null;
    state.buildError = null;
  });

  it('tells the user to log in instead of rendering an empty task list', async () => {
    state.store = failWith(
      new RemoteStoreError('unauthenticated', `Not authenticated to ${REMOTE_URL}.`, REMOTE_URL),
    );

    const result = render();
    cleanup = result.cleanup;

    await vi.waitFor(() => {
      const text = stripAnsi(result.text());
      expect(text).toContain('You are not logged in');
      expect(text).toContain('task-man login');
      expect(text).toContain(REMOTE_URL);
    });

    // The critical half: no task UI at all. An empty FOCUS screen is exactly
    // the thing that read as "you have no tasks".
    expect(stripAnsi(result.text())).not.toContain('FOCUS');
  });

  it('distinguishes an unreachable server from an expired session', async () => {
    state.store = failWith(
      new RemoteStoreError('unreachable', `Cannot reach ${REMOTE_URL}. Check your connection.`, REMOTE_URL),
    );

    const result = render();
    cleanup = result.cleanup;

    await vi.waitFor(() => {
      const text = stripAnsi(result.text());
      expect(text).toContain("Can't reach");
      expect(text).not.toContain('not logged in');
    });
  });

  it('points at the missing binary when cloudflared is not installed', async () => {
    state.store = failWith(new RemoteStoreError('no-cloudflared', 'cloudflared not found.', REMOTE_URL));

    const result = render();
    cleanup = result.cleanup;

    await vi.waitFor(() => {
      const text = stripAnsi(result.text());
      expect(text).toContain('cloudflared is not installed');
      expect(text).toContain('brew install cloudflared');
    });
  });

  it('surfaces a contradictory config instead of silently reading the local store', async () => {
    state.buildError = new StoreConfigError('client.mode is "remote" but client.remote_url is not set.');

    const result = render();
    cleanup = result.cleanup;

    await vi.waitFor(() => {
      const text = stripAnsi(result.text());
      expect(text).toContain('misconfigured');
      expect(text).toContain('client.remote_url');
    });
    expect(stripAnsi(result.text())).not.toContain('FOCUS');
  });

  it('renders the task list once a load succeeds', async () => {
    const task = {
      id: 'abc123',
      title: 'A real task',
      status: 'todo',
      priority: 'medium',
      scope: 'personal',
      categories: [],
      focused: true,
      parent_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      created_by: 'human',
    };
    state.store = {
      load: vi.fn(() => Promise.resolve([task])),
      query: vi.fn(() => Promise.resolve([task])),
      update: vi.fn(() => Promise.resolve(task)),
      getCompletedOn: vi.fn(() => Promise.resolve([])),
      getInProgressUpdatedOn: vi.fn(() => Promise.resolve([])),
      getCreatedOn: vi.fn(() => Promise.resolve([])),
    };

    const result = render();
    cleanup = result.cleanup;

    await vi.waitFor(() => {
      const text = stripAnsi(result.text());
      expect(text).toContain('A real task');
      expect(text).not.toContain('not logged in');
    });
  });
});
