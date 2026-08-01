import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const listCategories = vi.fn();
const createTask = vi.fn();
const getTask = vi.fn();
const patchTask = vi.fn();

vi.mock('../api', () => ({
  api: {
    listCategories: (...a: unknown[]) => listCategories(...a),
    createTask: (...a: unknown[]) => createTask(...a),
    getTask: (...a: unknown[]) => getTask(...a),
    patchTask: (...a: unknown[]) => patchTask(...a),
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

import { CapturePage } from '../pages/Capture';

const renderPage = () =>
  render(
    <MemoryRouter>
      <CapturePage />
    </MemoryRouter>,
  );

/** The same component behind /task/:id — the edit form. */
const renderEdit = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/task/${id}`]}>
      <Routes>
        <Route path="/task/:id" element={<CapturePage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  listCategories.mockReset().mockResolvedValue([{ name: 'work', count: 3 }]);
  createTask.mockReset();
  getTask.mockReset();
  patchTask.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

describe('CapturePage scope inheritance', () => {
  it('inherits professional scope from the filter and fetches scoped pills', async () => {
    localStorage.setItem('scopeFilter', 'professional');
    renderPage();

    // Professional segment pre-selected.
    const professional = await screen.findByRole('button', { name: 'professional' });
    expect(professional.className).toContain('active');

    // Categories fetched filtered to professional.
    await waitFor(() => expect(listCategories).toHaveBeenCalledWith('professional'));
  });

  it('with scope "all" selects nothing and fetches the full list', async () => {
    // Nothing stored → 'all'.
    renderPage();

    const professional = await screen.findByRole('button', { name: 'professional' });
    const personal = screen.getByRole('button', { name: 'personal' });
    expect(professional.className).not.toContain('active');
    expect(personal.className).not.toContain('active');

    await waitFor(() => expect(listCategories).toHaveBeenCalledWith(undefined));
  });

  it('refetches pills when the scope segment changes mid-capture', async () => {
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(listCategories).toHaveBeenCalledWith(undefined));
    listCategories.mockClear();

    await user.click(screen.getByRole('button', { name: 'professional' }));
    await waitFor(() => expect(listCategories).toHaveBeenCalledWith('professional'));
  });
});

describe('CapturePage scope persistence', () => {
  it('keeps the scope after a capture instead of clearing it', async () => {
    localStorage.setItem('scopeFilter', 'professional');
    createTask.mockResolvedValue({ id: 't1', title: 'a thing' });
    renderPage();
    const user = userEvent.setup();

    const professional = await screen.findByRole('button', { name: 'professional' });
    expect(professional.className).toContain('active');

    await user.type(screen.getByPlaceholderText('What needs doing?'), 'a thing');
    await user.click(screen.getByRole('button', { name: 'Capture' }));

    // Title clears — scope does not. Re-picking it on every capture was the
    // whole complaint.
    await waitFor(() =>
      expect((screen.getByPlaceholderText('What needs doing?') as HTMLInputElement).value).toBe(''),
    );
    expect(screen.getByRole('button', { name: 'professional' }).className).toContain('active');
  });
});

describe('CapturePage in edit mode', () => {
  const task = {
    id: 'abc',
    title: 'existing task',
    description: 'why it matters',
    priority: 'high',
    scope: 'personal',
    categories: ['work'],
    focused: true,
    time_estimate: null,
    subtasks: [],
  };

  it('prefills every field from the task', async () => {
    getTask.mockResolvedValue(task);
    renderEdit('abc');

    expect(await screen.findByDisplayValue('existing task')).toBeTruthy();
    expect(screen.getByDisplayValue('why it matters')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'high' }).className).toContain('active');
    expect(screen.getByRole('button', { name: 'personal' }).className).toContain('active');
    expect(screen.getByRole('button', { name: 'work' }).className).toContain('active');
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('patches the task, moving scope when it changed', async () => {
    getTask.mockResolvedValue(task);
    patchTask.mockResolvedValue({ ...task, scope: 'professional' });
    renderEdit('abc');
    const user = userEvent.setup();

    await screen.findByDisplayValue('existing task');
    await user.click(screen.getByRole('button', { name: 'professional' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchTask).toHaveBeenCalled());
    const [id, patch] = patchTask.mock.calls[0];
    expect(id).toBe('abc');
    expect(patch).toMatchObject({
      title: 'existing task',
      scope: 'professional',
      priority: 'high',
      categories: ['work'],
      description: 'why it matters',
      focused: true,
    });
  });

  it('does not clear priority or scope on a second tap while editing', async () => {
    getTask.mockResolvedValue(task);
    renderEdit('abc');
    const user = userEvent.setup();

    await screen.findByDisplayValue('existing task');
    // An existing task always has both, so there is nothing to clear them to.
    await user.click(screen.getByRole('button', { name: 'high' }));
    await user.click(screen.getByRole('button', { name: 'personal' }));

    expect(screen.getByRole('button', { name: 'high' }).className).toContain('active');
    expect(screen.getByRole('button', { name: 'personal' }).className).toContain('active');
  });
});
