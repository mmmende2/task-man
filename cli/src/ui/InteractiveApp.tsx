import { useState, useMemo, useEffect, createElement } from 'react';
import { Box, useInput } from 'ink';
import type { Task, TaskScope } from '../types.js';
import type { AppMode, WriteSubMode } from './types.js';
import type { VimMode } from './hooks/useVimKeys.js';
import { useTaskStore } from './hooks/useTaskStore.js';
import { useTerminalDimensionsSetup, TerminalDimensionsProvider, useTerminalHeight } from './hooks/useTerminalWidth.js';
import { Header } from './shared/Header.js';
import { Footer } from './shared/Footer.js';
import { FocusMode } from './modes/FocusMode.js';
import { PlanMode } from './modes/PlanMode.js';
import { WriteMode } from './modes/WriteMode.js';
import { MetricsMode } from './modes/MetricsMode.js';
import { RefineMode } from './modes/RefineMode.js';
import { isLocalToday } from '../local-date.js';

const SCOPE_CYCLE: (TaskScope | 'all')[] = ['all', 'personal', 'professional'];

export function InteractiveApp() {
  const dims = useTerminalDimensionsSetup();
  return createElement(TerminalDimensionsProvider, { value: dims }, createElement(InteractiveAppInner));
}

function InteractiveAppInner() {
  const [mode, setMode] = useState<AppMode>('focus');
  const [prevMode, setPrevMode] = useState<AppMode>('focus');
  const [scopeFilter, setScopeFilter] = useState<TaskScope | 'all'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [vimMode, setVimMode] = useState<VimMode>('normal');
  const [holdingTitle, setHoldingTitle] = useState<string | undefined>(undefined);
  const [writeSubMode, setWriteSubMode] = useState<WriteSubMode>('capture');
  const [planFocus, setPlanFocus] = useState<'tasks' | 'categories'>('tasks');

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

  // Derive per-mode lists — done tasks excluded from focus/plan unless
  // completed on the user's local "today". Computed inside the memo
  // (not captured at mount) so the boundary follows local-midnight even
  // for long-running TUIs. isLocalToday compares both sides in local
  // time; using UTC here used to make today's wins vanish mid-afternoon
  // in non-UTC timezones.
  const activeTasks = useMemo(() =>
    filteredTasks.filter(t => t.status !== 'done' || isLocalToday(t.completed_at)),
  [filteredTasks]);

  const focusedTasks = useMemo(() =>
    activeTasks.filter(t => t.focused),
  [activeTasks]);

  const backlogTasks = useMemo(() =>
    activeTasks.filter(t => !t.focused),
  [activeTasks]);

  // The navigable list depends on the mode
  const navigableList = useMemo(() => {
    if (mode === 'focus') return focusedTasks;
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

  // Startup cleanup: unfocus tasks that are done and untouched for 3+ days
  useEffect(() => {
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    store.load().then(all => {
      const stale = all.filter(t =>
        t.focused &&
        t.status === 'done' &&
        now - new Date(t.updated_at).getTime() >= THREE_DAYS_MS
      );
      if (stale.length === 0) return;
      return Promise.all(stale.map(t => store.update(t.id, { focused: false }))).then(() => reload());
    }).catch(() => {});
  }, []);

  const switchMode = (newMode: AppMode) => {
    setMode(prev => {
      if (prev !== 'refine') setPrevMode(prev);
      return newMode;
    });
    setSelectedIndex(0);
    setVimMode('normal');
    setHoldingTitle(undefined);
    if (newMode === 'write') setWriteSubMode('capture');
    if (newMode === 'plan') setPlanFocus('tasks');
  };

  const cycleScope = () => {
    const currentIdx = SCOPE_CYCLE.indexOf(scopeFilter);
    const nextIdx = (currentIdx + 1) % SCOPE_CYCLE.length;
    setScopeFilter(SCOPE_CYCLE[nextIdx]);
    setSelectedIndex(0);
  };

  // Global keys — disabled during write mode and non-normal vim modes
  useInput((input, key) => {
    if (vimMode !== 'normal') return;
    if (input === 'q') {
      process.exit(0);
    } else if (input === 'f' && mode !== 'focus') {
      switchMode('focus');
    } else if (input === 't' && mode !== 'plan') {
      switchMode('plan');
    } else if (input === 'w' && mode !== 'write') {
      switchMode('write');
    } else if (input === 'm' && mode !== 'metrics') {
      switchMode('metrics');
    } else if (input === 'r' && mode !== 'refine') {
      switchMode('refine');
    } else if (input === '~') {
      cycleScope();
    }
  }, { isActive: mode !== 'write' && mode !== 'refine' });

  const termHeight = useTerminalHeight();

  return (
    <Box flexDirection="column" height={termHeight} overflow="hidden">
      <Header
        mode={mode}
        scope={scopeFilter}
        taskCount={{ focused: focusedTasks.length, total: filteredTasks.length }}
      />

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {mode === 'focus' ? (
        <FocusMode
          focusedTasks={focusedTasks}
          backlogCount={backlogTasks.length}
          subtaskMap={subtaskMap}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          store={store}
          reload={reload}
          vimMode={vimMode}
          setVimMode={setVimMode}
          scopeFilter={scopeFilter}
          onHoldingChange={setHoldingTitle}
        />
      ) : mode === 'plan' ? (
        <PlanMode
          focusedTasks={focusedTasks}
          backlogTasks={backlogTasks}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          store={store}
          reload={reload}
          vimMode={vimMode}
          setVimMode={setVimMode}
          scopeFilter={scopeFilter}
          onHoldingChange={setHoldingTitle}
          onPanelFocusChange={setPlanFocus}
        />
      ) : mode === 'write' ? (
        <WriteMode
          store={store}
          tasks={tasks}
          reload={reload}
          scopeFilter={scopeFilter}
          onModeChange={switchMode}
          onCycleScope={cycleScope}
          onHoldingChange={setHoldingTitle}
          vimMode={vimMode}
          setVimMode={setVimMode}
          subMode={writeSubMode}
          onSubModeChange={setWriteSubMode}
        />
      ) : mode === 'refine' ? (
        <RefineMode
          store={store}
          reload={reload}
          onExit={switchMode}
          previousMode={prevMode}
        />
      ) : (
        <MetricsMode store={store} scopeFilter={scopeFilter} />
      )}
      <Box flexGrow={1} />
      </Box>

      <Footer mode={mode} vimMode={vimMode} holdingTitle={holdingTitle} writeSubMode={mode === 'write' ? writeSubMode : undefined} planFocus={mode === 'plan' ? planFocus : undefined} />
    </Box>
  );
}
