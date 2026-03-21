import { useState, useMemo, createElement } from 'react';
import { Box, useInput, useStdout } from 'ink';
import type { Task, TaskScope } from '../types.js';
import type { AppMode } from './types.js';
import { useTaskStore } from './hooks/useTaskStore.js';
import { useTerminalWidthSetup, TerminalWidthProvider } from './hooks/useTerminalWidth.js';
import { Header } from './shared/Header.js';
import { Footer } from './shared/Footer.js';
import { BorderFill } from './shared/BorderRow.js';
import { ViewMode } from './modes/ViewMode.js';
import { PlanMode } from './modes/PlanMode.js';
import { WriteMode } from './modes/WriteMode.js';
import { MetricsMode } from './modes/MetricsMode.js';

const SCOPE_CYCLE: (TaskScope | 'all')[] = ['all', 'personal', 'professional'];

export function InteractiveApp() {
  const width = useTerminalWidthSetup();
  return createElement(TerminalWidthProvider, { value: width }, createElement(InteractiveAppInner));
}

function InteractiveAppInner() {
  const [mode, setMode] = useState<AppMode>('view');
  const [scopeFilter, setScopeFilter] = useState<TaskScope | 'all'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { tasks, reload, store } = useTaskStore(undefined, 2000);

  // Separate parent tasks from subtasks
  const { parentTasks, subtaskMap } = useMemo(() => {
    const sMap = new Map<string, Task[]>();
    const parents: Task[] = [];

    for (const t of tasks) {
      if (t.parent_id) {
        const existing = sMap.get(t.parent_id) ?? [];
        existing.push(t);
        sMap.set(t.parent_id, existing);
      } else {
        parents.push(t);
      }
    }

    return { parentTasks: parents, subtaskMap: sMap };
  }, [tasks]);

  // Scope-filtered parent tasks
  const filteredTasks = useMemo(() => {
    if (scopeFilter === 'all') return parentTasks;
    return parentTasks.filter(t => t.scope === scopeFilter);
  }, [parentTasks, scopeFilter]);

  const focusedCount = filteredTasks.filter(t => t.focused).length;

  const switchMode = (newMode: AppMode) => {
    setMode(newMode);
    setSelectedIndex(0);
  };

  const cycleScope = () => {
    const currentIdx = SCOPE_CYCLE.indexOf(scopeFilter);
    const nextIdx = (currentIdx + 1) % SCOPE_CYCLE.length;
    setScopeFilter(SCOPE_CYCLE[nextIdx]);
    setSelectedIndex(0);
  };

  // Global keys — disabled during write mode
  useInput((input, key) => {
    if (input === 'q') {
      process.exit(0);
    } else if (input === 'v' && mode !== 'view') {
      switchMode('view');
    } else if (input === 'p' && mode !== 'plan') {
      switchMode('plan');
    } else if (input === 'w' && mode !== 'write') {
      switchMode('write');
    } else if (input === 'm' && mode !== 'metrics') {
      switchMode('metrics');
    } else if (key.tab && key.shift) {
      cycleScope();
    }
  }, { isActive: mode !== 'write' });

  const { stdout } = useStdout();
  const termHeight = stdout.rows ?? 24;

  // Fixed height: header (3 rows) + footer (3 rows) = 6, content fills the rest
  const contentHeight = Math.max(6, termHeight - 6);

  return (
    <Box flexDirection="column" height={termHeight}>
      <Header
        mode={mode}
        scope={scopeFilter}
        taskCount={{ focused: focusedCount, total: filteredTasks.length }}
      />

      <Box flexDirection="column" flexGrow={1} height={contentHeight}>
      {mode === 'view' && (
        <ViewMode
          tasks={filteredTasks}
          subtaskMap={subtaskMap}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          store={store}
          reload={reload}
        />
      )}

      {mode === 'plan' && (
        <PlanMode
          tasks={filteredTasks}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          store={store}
          reload={reload}
        />
      )}

      {mode === 'write' && (
        <WriteMode
          store={store}
          reload={reload}
          scopeFilter={scopeFilter}
          onModeChange={switchMode}
          onCycleScope={cycleScope}
        />
      )}

      {mode === 'metrics' && (
        <MetricsMode store={store} />
      )}
      <BorderFill />
      </Box>

      <Footer mode={mode} />
    </Box>
  );
}
