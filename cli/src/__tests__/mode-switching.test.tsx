import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { createElement } from 'react';
import stripAnsi from 'strip-ansi';

// Mock useTaskStore to avoid filesystem dependencies. Store methods are
// async now (Store interface) — must resolve, not return arrays directly.
vi.mock('../ui/hooks/useTaskStore.js', () => ({
  useTaskStore: () => ({
    tasks: [],
    reload: () => {},
    store: {
      update: vi.fn(() => Promise.resolve({})),
      load: vi.fn(() => Promise.resolve([])),
      query: vi.fn(() => Promise.resolve([])),
      getCompletedOn: vi.fn(() => Promise.resolve([])),
      getInProgressUpdatedOn: vi.fn(() => Promise.resolve([])),
      getCreatedOn: vi.fn(() => Promise.resolve([])),
    },
  }),
}));

// Must import after vi.mock
const { InteractiveApp } = await import('../ui/InteractiveApp.js');

function text(instance: ReturnType<typeof render>): string {
  return stripAnsi(instance.lastFrame() ?? '');
}

describe('Mode switching', () => {
  let instance: ReturnType<typeof render>;

  afterEach(() => instance?.cleanup());

  it('starts in focus mode', () => {
    instance = render(createElement(InteractiveApp));

    expect(text(instance)).toContain('FOCUS');
  });

  it('t switches to triage mode', async () => {
    instance = render(createElement(InteractiveApp));

    instance.stdin.write('t');

    await vi.waitFor(() => {
      expect(text(instance)).toContain('PLAN');
    });
  });

  it('f switches back to focus mode', async () => {
    instance = render(createElement(InteractiveApp));

    instance.stdin.write('t');
    await vi.waitFor(() => {
      expect(text(instance)).toContain('PLAN');
    });

    instance.stdin.write('f');
    await vi.waitFor(() => {
      expect(text(instance)).toContain('FOCUS');
    });
  });

  it('w switches to write mode', async () => {
    instance = render(createElement(InteractiveApp));

    instance.stdin.write('w');

    await vi.waitFor(() => {
      expect(text(instance)).toContain('WRITE');
    });
  });

  it('m switches to metrics mode', async () => {
    instance = render(createElement(InteractiveApp));

    instance.stdin.write('m');

    await vi.waitFor(() => {
      expect(text(instance)).toContain('METRICS');
    });
  });

  it('~ cycles scope filter', async () => {
    instance = render(createElement(InteractiveApp));

    instance.stdin.write('~');

    await vi.waitFor(() => {
      // Scope should cycle from 'all' to 'personal' (SCOPE_LABELS.personal)
      expect(text(instance)).toContain('personal');
    });
  });

  it('mode keys are disabled in write mode', async () => {
    instance = render(createElement(InteractiveApp));

    instance.stdin.write('w');
    await vi.waitFor(() => {
      expect(text(instance)).toContain('WRITE');
    });

    instance.stdin.write('p');
    // Small delay to ensure any potential mode switch would have happened
    await new Promise(r => setTimeout(r, 50));
    // Should still be in write mode
    expect(text(instance)).toContain('WRITE');
  });
});
