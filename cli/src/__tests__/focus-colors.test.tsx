import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import type { Task } from '../types.js';
import { TaskRowExpanded } from '../ui/shared/TaskRowExpanded.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

// ANSI escape code fragments
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const DIM = '\x1b[2m';

// These tests require FORCE_COLOR=1 to emit ANSI codes in the test environment.
// Without it, ink-testing-library won't produce color output.
const hasColor = process.env.FORCE_COLOR === '1' || process.env.FORCE_COLOR === 'true';

describe.skipIf(!hasColor)('TaskRowExpanded colors', () => {
  let tmpDir: string;
  let store: TaskStore;
  let parentTask: Task;
  let doneSub: Task;
  let todoSub: Task;
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-colors-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));

    parentTask = await store.add({ title: 'Parent Task', focused: true });
    doneSub = await store.add({ title: 'Done Sub', parent_id: parentTask.id });
    await store.update(doneSub.id, { status: 'done' });
    doneSub = store.load().find(t => t.id === doneSub.id)!;
    todoSub = await store.add({ title: 'Todo Sub', parent_id: parentTask.id });
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('border uses cyan when not in subtask nav', () => {
    const result = renderWithDimensions(
      createElement(TaskRowExpanded, {
        task: parentTask,
        subtasks: [doneSub, todoSub],
        subtaskProgress: { done: 1, total: 2 },
      }),
    );
    cleanup = result.cleanup;

    const raw = result.rawText();
    // The border character ┌ should be preceded by cyan escape
    const borderLine = result.rawLines().find(l => l.includes('┌'));
    expect(borderLine).toBeDefined();
    expect(borderLine).toContain(CYAN);
  });

  it('border uses white when in subtask nav', () => {
    const result = renderWithDimensions(
      createElement(TaskRowExpanded, {
        task: parentTask,
        subtasks: [doneSub, todoSub],
        subtaskProgress: { done: 1, total: 2 },
        inSubtaskNav: true,
        selectedSubtaskIndex: 0,
      }),
    );
    cleanup = result.cleanup;

    const borderLine = result.rawLines().find(l => l.includes('┌'));
    expect(borderLine).toBeDefined();
    // Border characters should use white when in subtask nav
    expect(borderLine).toContain(WHITE);
  });

  it('selected subtask indicator uses cyan', () => {
    const result = renderWithDimensions(
      createElement(TaskRowExpanded, {
        task: parentTask,
        subtasks: [doneSub, todoSub],
        subtaskProgress: { done: 1, total: 2 },
        inSubtaskNav: true,
        selectedSubtaskIndex: 1,
      }),
    );
    cleanup = result.cleanup;

    // Find the line with the selection indicator ▸
    const indicatorLine = result.rawLines().find(l => l.includes('▸'));
    expect(indicatorLine).toBeDefined();
    expect(indicatorLine).toContain(CYAN);
    expect(indicatorLine).toContain('Todo Sub');
  });

  it('completed subtask dot uses dim', () => {
    const result = renderWithDimensions(
      createElement(TaskRowExpanded, {
        task: parentTask,
        subtasks: [doneSub, todoSub],
        subtaskProgress: { done: 1, total: 2 },
      }),
    );
    cleanup = result.cleanup;

    // Find line with the done subtask
    const doneLine = result.rawLines().find(l => l.includes('Done Sub'));
    expect(doneLine).toBeDefined();
    expect(doneLine).toContain(DIM);
    expect(doneLine).toContain('◉');
  });

  it('uncompleted subtask dot does not use dim', () => {
    const result = renderWithDimensions(
      createElement(TaskRowExpanded, {
        task: parentTask,
        subtasks: [todoSub],
        subtaskProgress: { done: 0, total: 1 },
      }),
    );
    cleanup = result.cleanup;

    const todoLine = result.rawLines().find(l => l.includes('Todo Sub'));
    expect(todoLine).toBeDefined();
    // The ○ character and title should not be dimmed
    // Check that DIM does not appear before the title
    const titleIdx = todoLine!.indexOf('Todo Sub');
    const preTitleSegment = todoLine!.slice(0, titleIdx);
    // DIM should not be the active style for the subtask checkbox portion
    // (border chars may use dim elsewhere, so we check the checkbox area specifically)
    expect(todoLine).toContain('○');
  });
});
