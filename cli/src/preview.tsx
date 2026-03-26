/**
 * Preview script — renders each interactive mode using ink-testing-library
 * so the output can be read as plain text.
 *
 * Usage: npx tsx src/preview.tsx [mode]
 *   modes: focus, plan, write, metrics, all (default: all)
 */

import { createElement } from 'react';
import { render } from 'ink-testing-library';
import { Box } from 'ink';
import { TaskStore } from './store.js';
import { TerminalDimensionsProvider } from './ui/hooks/useTerminalWidth.js';
import { Header } from './ui/shared/Header.js';
import { Footer } from './ui/shared/Footer.js';
import { FocusMode } from './ui/modes/FocusMode.js';
import { PlanMode } from './ui/modes/PlanMode.js';
import { WriteMode } from './ui/modes/WriteMode.js';
import { MetricsMode } from './ui/modes/MetricsMode.js';
import type { Task } from './types.js';
import type { AppMode } from './ui/types.js';

const store = new TaskStore();
const allTasks = store.load();

// Separate parents and subtasks
const subtaskMap = new Map<string, Task[]>();
const parentTasks: Task[] = [];
for (const t of allTasks) {
  if (t.parent_id) {
    const existing = subtaskMap.get(t.parent_id) ?? [];
    existing.push(t);
    subtaskMap.set(t.parent_id, existing);
  } else {
    parentTasks.push(t);
  }
}

const focusedCount = parentTasks.filter(t => t.focused).length;
const noop = () => {};

// Simulate a terminal width — default 80 cols → 78 inner
const PREVIEW_WIDTH = Math.max(52, (process.stdout.columns ?? 80) - 2);

function renderMode(mode: AppMode) {
  let modeElement: React.ReactElement;

  const activeTasks = parentTasks.filter(t => t.status !== 'done');
  const focusedTasks = activeTasks.filter(t => t.focused);
  const backlogTasks = activeTasks.filter(t => !t.focused);

  if (mode === 'focus') {
    modeElement = createElement(FocusMode, {
      focusedTasks,
      backlogCount: backlogTasks.length,
      subtaskMap,
      selectedIndex: 0,
      onSelectedIndexChange: noop,
      store,
      reload: noop,
    });
  } else if (mode === 'plan') {
    modeElement = createElement(PlanMode, {
      focusedTasks,
      backlogTasks,
      selectedIndex: 0,
      onSelectedIndexChange: noop,
      store,
      reload: noop,
    });
  } else if (mode === 'write') {
    modeElement = createElement(WriteMode, {
      store,
      reload: noop,
      scopeFilter: 'all',
      onModeChange: noop as any,
      onCycleScope: noop,
    });
  } else {
    modeElement = createElement(MetricsMode, { store });
  }

  const tree = createElement(
    TerminalDimensionsProvider,
    { value: { width: PREVIEW_WIDTH, height: 40 } },
    createElement(
      Box,
      { flexDirection: 'column' },
      createElement(Header, { mode, scope: 'all', taskCount: { focused: focusedCount, total: parentTasks.length } }),
      modeElement,
      createElement(Footer, { mode }),
    ),
  );

  const instance = render(tree);
  const frame = instance.lastFrame();
  instance.cleanup();
  return frame ?? '(empty frame)';
}

// Parse args
const requestedMode = process.argv[2] ?? 'all';
const modes: AppMode[] = requestedMode === 'all'
  ? ['focus', 'plan', 'write', 'metrics']
  : [requestedMode as AppMode];

for (const mode of modes) {
  console.log(`\n${'='.repeat(PREVIEW_WIDTH + 2)}`);
  console.log(`  MODE: ${mode.toUpperCase()}`);
  console.log(`${'='.repeat(PREVIEW_WIDTH + 2)}`);
  console.log(renderMode(mode));
}
