import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MetricsResponse } from 'task-man/types';

const getMetrics = vi.fn();
const getHealth = vi.fn();

vi.mock('../api', () => ({
  api: {
    getMetrics: (...a: unknown[]) => getMetrics(...a),
    getHealth: (...a: unknown[]) => getHealth(...a),
    listTasks: vi.fn().mockResolvedValue([]),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  reloadForAuth: vi.fn(),
}));

import { MetricsPage } from '../pages/Metrics';

const emptyMetrics: MetricsResponse = {
  date: '2026-07-08',
  stats: {
    completed: 0, inProgress: 0, completedByHuman: 0, completedByClaude: 0, subtasksCompleted: 0,
  },
  completedTasks: [],
  inProgressTasks: [],
  activeParents: [],
  subtasksByParent: {},
  lastWorkDay: null,
  earliestDate: null,
  insight: null,
} as unknown as MetricsResponse;

const renderPage = () =>
  render(
    <MemoryRouter>
      <MetricsPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  getMetrics.mockReset().mockResolvedValue(emptyMetrics);
  getHealth.mockReset().mockResolvedValue({ ok: true, version: '0.0.0', time: '' });
  localStorage.clear();
  sessionStorage.clear();
  // Fake only Date so React/testing-library timers keep running.
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MetricsPage initial day', () => {
  it('morning + personal scope opens on yesterday', async () => {
    vi.setSystemTime(new Date(2026, 6, 9, 9, 0, 0)); // 2026-07-09 09:00 local
    localStorage.setItem('scopeFilter', 'personal');

    renderPage();

    await waitFor(() => expect(getMetrics).toHaveBeenCalled());
    // First fetch uses the initial view date: yesterday, scoped personal.
    expect(getMetrics.mock.calls[0][0]).toBe('2026-07-08');
    expect(getMetrics.mock.calls[0][1]).toBe('personal');
  });

  it('afternoon opens on today', async () => {
    vi.setSystemTime(new Date(2026, 6, 9, 15, 0, 0)); // 2026-07-09 15:00 local
    localStorage.setItem('scopeFilter', 'personal');

    renderPage();

    await waitFor(() => expect(getMetrics).toHaveBeenCalled());
    expect(getMetrics.mock.calls[0][0]).toBe('2026-07-09');
  });
});
