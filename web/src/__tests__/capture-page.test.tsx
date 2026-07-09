import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const listCategories = vi.fn();
const createTask = vi.fn();

vi.mock('../api', () => ({
  api: {
    listCategories: (...a: unknown[]) => listCategories(...a),
    createTask: (...a: unknown[]) => createTask(...a),
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

beforeEach(() => {
  listCategories.mockReset().mockResolvedValue([{ name: 'work', count: 3 }]);
  createTask.mockReset();
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
