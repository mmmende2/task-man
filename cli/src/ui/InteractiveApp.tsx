import { useState, useMemo, useEffect, createElement } from 'react';
import { Box, useInput } from 'ink';
import type { Task, TaskScope } from '../types.js';
import type { AppMode } from './types.js';
import { useTaskStore } from './hooks/useTaskStore.js';
import { useTerminalDimensionsSetup, TerminalDimensionsProvider, useTerminalHeight } from './hooks/useTerminalWidth.js';
import { Header } from './shared/Header.js';
import { Footer } from './shared/Footer.js';
import { ViewMode } from './modes/ViewMode.js';
import { PlanMode } from './modes/PlanMode.js';
import { WriteMode } from './modes/WriteMode.js';
import { MetricsMode } from './modes/MetricsMode.js';

const SCOPE_CYCLE: (TaskScope | 'all')[] = ['all', 'personal', 'professional'];

export function InteractiveApp() {
  const dims = useTerminalDimensionsSetup();
  return createElement(TerminalDimensionsProvider, { value: dims }, createElement(InteractiveAppInner));
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

  // Derive per-mode lists — done tasks excluded from view/plan
  const activeTasks = useMemo(() =>
    filteredTasks.filter(t => t.status !== 'done'),
  [filteredTasks]);

  const focusedTasks = useMemo(() =>
    activeTasks.filter(t => t.focused),
  [activeTasks]);

  const backlogTasks = useMemo(() =>
    activeTasks.filter(t => !t.focused),
  [activeTasks]);

  // The navigable list depends on the mode
  const navigableList = useMemo(() => {
    if (mode === 'view') return focusedTasks;
    if (mode === 'plan') return [...focusedTasks, ...backlogTasks];
    return [];
  }, [mode, focusedTasks, backlogTasks]);

  // Clamp selectedIndex when the list shrinks
  useEffect(() => {
    if (navigableList.length === 0) {
      if (selectedIndex !== 0) setSelectedIndex(0);
    } else if (selectedIndex >= navigableList.length) {
      setSelectedIndex(navigableList.length - 1);
    }
  }, [navigableList.length, selectedIndex]);

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

  const termHeight = useTerminalHeight();

  return (
    <Box flexDirection="column" height={termHeight} overflow="hidden">
      <Header
        mode={mode}
        scope={scopeFilter}
        taskCount={{ focused: focusedTasks.length, total: filteredTasks.length }}
      />

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {mode === 'view' ? (
        <ViewMode
          focusedTasks={focusedTasks}
          backlogCount={backlogTasks.length}
          subtaskMap={subtaskMap}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          store={store}
          reload={reload}
        />
      ) : mode === 'plan' ? (
        <PlanMode
          focusedTasks={focusedTasks}
          backlogTasks={backlogTasks}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          store={store}
          reload={reload}
        />
      ) : mode === 'write' ? (
        <WriteMode
          store={store}
          reload={reload}
          scopeFilter={scopeFilter}
          onModeChange={switchMode}
          onCycleScope={cycleScope}
        />
      ) : (
        <MetricsMode store={store} />
      )}
      <Box flexGrow={1} />
      </Box>

      <Footer mode={mode} />
    </Box>
  );
}
