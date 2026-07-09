import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Task } from '../types';

// Mock the API layer; the queue/question logic (task-man/refine-*) runs for real.
const listTasks = vi.fn();
const patchTask = vi.fn();
const deleteTask = vi.fn();

vi.mock('../api', () => ({
  api: {
    listTasks: (...a: unknown[]) => listTasks(...a),
    patchTask: (...a: unknown[]) => patchTask(...a),
    deleteTask: (...a: unknown[]) => deleteTask(...a),
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

import { RefinePage } from '../pages/Refine';

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: 't1',
    title: 'clean title',
    description: null,
    status: 'todo',
    priority: 'medium',
    scope: 'personal',
    categories: ['home'],
    parent_id: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    focused: false,
    created_by: 'human',
    session_id: null,
    time_estimate: '20m',
    vibe: null,
    ...overrides,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <RefinePage />
    </MemoryRouter>,
  );

beforeEach(() => {
  listTasks.mockReset();
  patchTask.mockReset().mockImplementation((_id, changes) => Promise.resolve({ ...makeTask(), ...changes }));
  deleteTask.mockReset().mockResolvedValue(undefined);
  sessionStorage.clear();
  localStorage.clear();
});

describe('RefinePage', () => {
  // Regression: answering a card must not skip the next card in the same task.
  // Only-vibe-missing + unfocused → questions = [vibe, focus]. Answering vibe
  // must land on the focus card, not jump past it (or into the next task).
  it('does not skip the next question after answering one', async () => {
    listTasks.mockResolvedValue([makeTask({ vibe: null, focused: false })]);
    const user = userEvent.setup();
    renderPage();

    // First card: vibe.
    await screen.findByText('Vibe check?');
    await user.click(screen.getByRole('button', { name: 'ok' }));

    expect(patchTask).toHaveBeenCalledWith('t1', { vibe: 'ok' });

    // Second card must actually appear — the bug skipped straight past it.
    await screen.findByText("Pull this into tomorrow's focus?");
    expect(screen.getByText(/question 2 \/ 2/)).toBeTruthy();
  });

  // Regression: the correction "Accept" button was a no-op (routed through a
  // matcher that ignored the "Quick fix" prompt). It must patch the title.
  it('applies a spelling correction when Accept is tapped', async () => {
    listTasks.mockResolvedValue([makeTask({ title: 'fix teh bug', vibe: null })]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Quick fix — does this look right?');
    // The suggested fix is shown, and Accept commits it.
    await screen.findByText('fix the bug');
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(patchTask).toHaveBeenCalledWith('t1', { title: 'fix the bug' }));
  });

  it('shows the empty state when nothing needs refine', async () => {
    // Fully-refined + focused = not a refine candidate → empty queue.
    listTasks.mockResolvedValue([makeTask({ vibe: 'ok', focused: true })]);
    renderPage();
    await screen.findByText(/Nothing needs refine/);
  });

  it('surfaces the honest uncapped total in the header (was capped at 20)', async () => {
    // 25 candidates → the session walks all 25, not a 20-sliced queue.
    const tasks = Array.from({ length: 25 }, (_, i) => makeTask({ id: `t${i}`, vibe: null }));
    listTasks.mockResolvedValue(tasks);
    renderPage();

    await screen.findByText('Vibe check?');
    expect(screen.getByText(/task 1 \/ 25/)).toBeTruthy();
  });

  it('offers the focus card on the first two tasks but not the third (cap of 2)', async () => {
    const tasks = ['a', 'b', 'c'].map((id) => makeTask({ id, vibe: null, focused: false }));
    listTasks.mockResolvedValue(tasks);
    const user = userEvent.setup();
    renderPage();

    // Tasks 1 and 2: vibe card, then the focus card appears; skip it with "No".
    for (let i = 0; i < 2; i++) {
      await screen.findByText('Vibe check?');
      await user.click(screen.getByRole('button', { name: 'ok' }));
      await screen.findByText("Pull this into tomorrow's focus?");
      await user.click(screen.getByRole('button', { name: 'No' }));
    }

    // Task 3: vibe card, but the focus card must be suppressed — answering
    // vibe ends the session instead of surfacing a third focus card.
    await screen.findByText('Vibe check?');
    await user.click(screen.getByRole('button', { name: 'ok' }));

    await screen.findByText(/3 tasks reviewed/);
    expect(screen.queryByText("Pull this into tomorrow's focus?")).toBeNull();
  });
});
