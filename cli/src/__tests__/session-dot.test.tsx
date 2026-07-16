import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { TaskRow } from '../ui/shared/TaskRow.js';
import { TaskRowExpanded } from '../ui/shared/TaskRowExpanded.js';
import { normalizeSessionColors } from '../config.js';
import { SESSION_COLORS } from '../constants.js';
import type { Task } from '../types.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: null,
    // in_progress so the priority dot renders filled ● and can't be confused
    // with the hollow session dot ○ in assertions.
    status: 'in_progress',
    priority: 'medium',
    scope: 'personal',
    categories: [],
    parent_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    focused: false,
    created_by: 'claude',
    session_id: 'session-abc',
    time_estimate: null,
    vibe: null,
    ...overrides,
  };
}

describe('TaskRow session dot', () => {
  it('shows a filled dot for a linked parent with a live session', () => {
    const { text, cleanup } = renderWithDimensions(
      createElement(TaskRow, { task: makeTask(), sessionColor: SESSION_COLORS.red, sessionActive: true }),
    );
    expect(text()).toContain('◉');
    expect(text()).not.toContain('○');
    cleanup();
  });

  it('shows a hollow dot for a linked parent whose session ended', () => {
    const { text, cleanup } = renderWithDimensions(
      createElement(TaskRow, { task: makeTask(), sessionColor: SESSION_COLORS.green, sessionActive: false }),
    );
    expect(text()).toContain('○');
    expect(text()).not.toContain('◉');
    cleanup();
  });

  it('shows no dot when no color is known for the session', () => {
    const { text, cleanup } = renderWithDimensions(
      createElement(TaskRow, { task: makeTask(), sessionColor: null, sessionActive: true }),
    );
    expect(text()).not.toContain('◉');
    expect(text()).not.toContain('○');
    cleanup();
  });

  it('shows no dot on subtasks even when linked and colored', () => {
    const { text, cleanup } = renderWithDimensions(
      createElement(TaskRow, {
        task: makeTask({ parent_id: 'parent-1' }),
        sessionColor: SESSION_COLORS.blue,
        sessionActive: true,
      }),
    );
    expect(text()).not.toContain('◉');
    expect(text()).not.toContain('○');
    cleanup();
  });
});

describe('TaskRowExpanded card layout', () => {
  const LONG_URL_TITLE =
    'TICKET-1234 - first go - https://staging.example.com/verifications/acquisition/case-review?acquisitionName=ACQ0123456789abcdef0123456789abcdef&feature-env=TICKET-1234-cr-modal-tile-redesign';

  function renderCard(subtaskTitle: string, width = 78) {
    const parent = makeTask({ id: 'parent-1', title: 'Parent Task' });
    const subs = [
      makeTask({ id: 'sub-1', title: 'short one', parent_id: 'parent-1', status: 'done' }),
      makeTask({ id: 'sub-2', title: subtaskTitle, parent_id: 'parent-1' }),
    ];
    return renderWithDimensions(
      createElement(TaskRowExpanded, {
        task: parent,
        subtasks: subs,
        subtaskProgress: { done: 1, total: 2 },
      }),
      { width },
    );
  }

  it('aligns the top-right corner with the bottom-right corner', () => {
    const { lines, cleanup } = renderCard('short two');
    const top = lines().find(l => l.includes('┐'))!;
    const bottom = lines().find(l => l.includes('┘'))!;
    expect(top.indexOf('┐')).toBe(bottom.indexOf('┘'));
    cleanup();
  });

  it('keeps the left border and stays inside the card when a subtask wraps', () => {
    const { lines, cleanup } = renderCard(LONG_URL_TITLE);
    const rows = lines().filter(l => l.length > 0);
    // Every row between the corners carries the │ border — no hard-wrap orphans.
    const inner = rows.slice(1, -1);
    expect(inner.length).toBeGreaterThan(3); // the long title produced continuation rows
    for (const row of inner) expect(row[1]).toBe('│');
    // Nothing pokes past the terminal edge (78), which would re-wrap at column 0.
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(78);
    cleanup();
  });

  it('keeps subtask dots in the same column when a neighbor wraps', () => {
    const { lines, cleanup } = renderCard(LONG_URL_TITLE);
    const dotCols = lines()
      .filter(l => l.includes('◉') || l.includes('○'))
      .map(l => Math.max(l.indexOf('◉'), l.indexOf('○')));
    expect(new Set(dotCols).size).toBe(1);
    cleanup();
  });
});

describe('normalizeSessionColors', () => {
  it('maps legacy magenta to pink and passes everything else through', () => {
    expect(normalizeSessionColors({
      a: 'magenta',
      b: 'cyan',
      c: 'red',
      d: 'bogus',
    })).toEqual({
      a: 'pink',
      b: 'cyan',
      c: 'red',
      d: 'bogus',
    });
  });

  it('handles an empty map', () => {
    expect(normalizeSessionColors({})).toEqual({});
  });
});
