import { useState, useMemo, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { Task, TaskScope } from '../../types.js';
import type { Store } from '../../store-interface.js';
import type { VimMode, VimAction } from '../hooks/useVimKeys.js';
import { useVimKeys } from '../hooks/useVimKeys.js';
import { useUndoStack } from '../hooks/useUndoStack.js';
import { useTerminalHeight } from '../hooks/useTerminalWidth.js';
import { loadConfig, saveConfig } from '../../config.js';
import { SCOPE_LABELS } from '../../constants.js';
import { getSessionHexColor } from '../../sessions.js';
import { PriorityDot } from '../shared/PriorityDot.js';
import { InlineEdit } from '../shared/InlineEdit.js';
import { SearchBar } from '../shared/SearchBar.js';
import { CURSOR_GLYPH } from '../shared/selection.js';

interface Props {
  focusedTasks: Task[];
  backlogTasks: Task[];
  cursorId: string | null;
  onCursorChange: (id: string | null) => void;
  store: Store;
  reload: () => void;
  vimMode: VimMode;
  setVimMode: (mode: VimMode) => void;
  scopeFilter: TaskScope | 'all';
  onHoldingChange?: (title: string | undefined) => void;
  onPanelFocusChange?: (focus: 'tasks' | 'categories') => void;
}

interface Clipboard {
  task: Task;
  index: number;
  wasFocused: boolean;
}

interface CategoryGroup {
  category: string;
  tasks: Task[];
}

export function PlanMode({
  focusedTasks, backlogTasks, cursorId, onCursorChange,
  store, reload, vimMode, setVimMode, scopeFilter, onHoldingChange,
  onPanelFocusChange,
}: Props) {
  // Guardrail state
  const [guardrailOverridden, setGuardrailOverridden] = useState(false);
  const [pendingFocusTask, setPendingFocusTask] = useState<Task | null>(null);

  // Vim feature state
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState({ text: '', cursor: 0 });
  const [creatingAt, setCreatingAt] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Category panel state
  const [panelFocus, setPanelFocusState] = useState<'tasks' | 'categories'>('tasks');
  const setPanelFocus = (next: 'tasks' | 'categories') => {
    setPanelFocusState(next);
    onPanelFocusChange?.(next);
  };
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    () => new Set(loadConfig().plan?.hiddenCategories ?? []),
  );
  // Category panel cursor is anchored by category name (stable identity),
  // not by index into the alphabetically-sorted list, which reshuffles when
  // categories appear/disappear.
  const [categoryCursor, setCategoryCursor] = useState<string | null>(null);

  const persistHiddenCategories = (next: Set<string>) => {
    setHiddenCategories(next);
    const cfg = loadConfig();
    cfg.plan = { ...cfg.plan, hiddenCategories: [...next].sort() };
    saveConfig(cfg);
  };

  const termHeight = useTerminalHeight();

  const editText = editState.text;
  const cursorPos = editState.cursor;

  const undoStack = useUndoStack();
  const config = loadConfig();
  const maxFocused = config.focus?.maxFocused ?? 3;

  // Filter tasks by search query
  const filteredFocused = useMemo(() => {
    if (!searchQuery) return focusedTasks;
    const q = searchQuery.toLowerCase();
    return focusedTasks.filter(t => t.title.toLowerCase().includes(q));
  }, [focusedTasks, searchQuery]);

  const filteredBacklog = useMemo(() => {
    if (!searchQuery) return backlogTasks;
    const q = searchQuery.toLowerCase();
    return backlogTasks.filter(t => t.title.toLowerCase().includes(q));
  }, [backlogTasks, searchQuery]);

  // Group all tasks by category for tree view (excludes hidden categories)
  const { orderedTasks, groups } = useMemo(() => {
    const all = [...filteredFocused, ...filteredBacklog];
    const groupMap = new Map<string, Task[]>();
    for (const task of all) {
      const cat = task.categories?.[0] ?? '';
      if (hiddenCategories.has(cat)) continue;
      if (!groupMap.has(cat)) groupMap.set(cat, []);
      groupMap.get(cat)!.push(task);
    }
    // Named categories alphabetically, uncategorized last
    const sortedKeys = [...groupMap.keys()].sort((a, b) => {
      if (a === '' && b !== '') return 1;
      if (a !== '' && b === '') return -1;
      return a.localeCompare(b);
    });
    const grps: CategoryGroup[] = [];
    const flat: Task[] = [];
    for (const key of sortedKeys) {
      const tasks = groupMap.get(key)!;
      grps.push({ category: key, tasks });
      flat.push(...tasks);
    }
    return { orderedTasks: flat, groups: grps };
  }, [filteredFocused, filteredBacklog, hiddenCategories]);

  // All categories present in the current scope (for the panel — ignores search/hidden)
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const t of focusedTasks) set.add(t.categories?.[0] ?? '');
    for (const t of backlogTasks) set.add(t.categories?.[0] ?? '');
    return [...set].sort((a, b) => {
      if (a === '' && b !== '') return 1;
      if (a !== '' && b === '') return -1;
      return a.localeCompare(b);
    });
  }, [focusedTasks, backlogTasks]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of focusedTasks) {
      const c = t.categories?.[0] ?? '';
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    for (const t of backlogTasks) {
      const c = t.categories?.[0] ?? '';
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }, [focusedTasks, backlogTasks]);

  // Focused tasks per category (for panel indicator)
  const focusedCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of focusedTasks) {
      const c = t.categories?.[0] ?? '';
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }, [focusedTasks]);

  // Focused tasks that are hidden (their category is toggled off) — shown as a dim strip at bottom
  const hiddenFocusedTasks = useMemo(() => {
    return filteredFocused.filter(t => hiddenCategories.has(t.categories?.[0] ?? ''));
  }, [filteredFocused, hiddenCategories]);

  const totalCount = orderedTasks.length;

  // Resolve the id-anchored cursors to positions in the current lists, fresh
  // every render (never -1). The task list is reordered by focus toggles and
  // the multi-writer poll; the category list re-sorts as categories come and
  // go — a numeric index silently lands on the wrong item, so we anchor by id.
  const selPos = cursorId ? Math.max(0, orderedTasks.findIndex(t => t.id === cursorId)) : 0;
  const catPos = categoryCursor ? Math.max(0, allCategories.indexOf(categoryCursor)) : 0;

  useEffect(() => {
    if (orderedTasks.length === 0) {
      if (cursorId !== null) onCursorChange(null);
    } else if (!cursorId || !orderedTasks.some(t => t.id === cursorId)) {
      onCursorChange(orderedTasks[selPos]?.id ?? orderedTasks[0].id);
    }
  }, [orderedTasks, cursorId, onCursorChange, selPos]);

  useEffect(() => {
    if (allCategories.length === 0) {
      if (categoryCursor !== null) setCategoryCursor(null);
    } else if (!categoryCursor || !allCategories.includes(categoryCursor)) {
      setCategoryCursor(allCategories[catPos] ?? allCategories[0]);
    }
  }, [allCategories, categoryCursor, catPos]);

  const getSelectedTask = (): Task | null => orderedTasks[selPos] ?? null;

  const handleAction = (action: VimAction) => {
    // Category panel intercepts navigation/toggle when focused
    if (panelFocus === 'categories') {
      if (action.type === 'move') {
        if (action.direction === 'left') {
          setPanelFocus('tasks');
          return;
        }
        if (action.direction === 'right') return;
        if (allCategories.length === 0) return;
        const next = action.direction === 'down'
          ? Math.min(catPos + 1, allCategories.length - 1)
          : Math.max(catPos - 1, 0);
        setCategoryCursor(allCategories[next] ?? null);
        return;
      }
      if (action.type === 'toggle-focus') {
        const cat = allCategories[catPos];
        if (cat === undefined) return;
        const next = new Set(hiddenCategories);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        persistHiddenCategories(next);
        return;
      }
      if (action.type === 'jump') {
        if (allCategories.length === 0) return;
        const pos = action.to === 'top' ? 0 : allCategories.length - 1;
        setCategoryCursor(allCategories[pos] ?? null);
        return;
      }
      if (action.type === 'cancel') {
        setPanelFocus('tasks');
        return;
      }
      // All other actions are suppressed while categories has focus
      return;
    }

    // If guardrail warning is showing, handle confirm/cancel
    if (pendingFocusTask) {
      if (action.type === 'toggle-focus') {
        setGuardrailOverridden(true);
        store.update(pendingFocusTask.id, { focused: true }).then(() => reload());
        setPendingFocusTask(null);
      } else {
        setPendingFocusTask(null);
      }
      return;
    }

    switch (action.type) {
      case 'move': {
        if (action.direction === 'right') {
          setPanelFocus('categories');
          // Anchor the category cursor on entry if it isn't already valid.
          if (!categoryCursor || !allCategories.includes(categoryCursor)) {
            setCategoryCursor(allCategories[0] ?? null);
          }
          return;
        }
        if (action.direction === 'left') return;
        if (totalCount === 0) return;
        const next = action.direction === 'down'
          ? Math.min(selPos + 1, totalCount - 1)
          : Math.max(selPos - 1, 0);
        onCursorChange(orderedTasks[next]?.id ?? null);
        break;
      }

      case 'jump': {
        if (totalCount === 0) return;
        const pos = action.to === 'top' ? 0 : totalCount - 1;
        onCursorChange(orderedTasks[pos]?.id ?? null);
        break;
      }

      case 'cut': {
        const task = getSelectedTask();
        if (!task) return;
        store.remove(task.id).then(({ index }) => {
          setClipboard({ task, index, wasFocused: task.focused });
          setVimMode('holding');
          onHoldingChange?.(task.title);
          // No undo entry yet — holding mode always ends in paste or Esc,
          // and each of those pushes exactly one entry for the whole
          // operation. Pushing here too meant a second `u` after a move
          // re-inserted the task a second time (duplicate id).
          reload();
        });
        break;
      }

      case 'paste': {
        if (!clipboard) return;
        store.load().then((allTasks) => {
          let targetIndex: number;
          const anchorTask = getSelectedTask();
          if (anchorTask) {
            targetIndex = allTasks.findIndex(t => t.id === anchorTask.id);
            if (!action.above) targetIndex += 1;
          } else {
            targetIndex = allTasks.length;
          }

          const origClipboard = clipboard;
          const taskToInsert = { ...clipboard.task };

          store.insertAt(taskToInsert, targetIndex).then(() => {
            undoStack.push({
              undo: async () => {
                await store.remove(taskToInsert.id);
                await store.insertAt(origClipboard.task, origClipboard.index);
              },
            });
            setClipboard(null);
            setVimMode('normal');
            onHoldingChange?.(undefined);
            reload();
          });
        });
        break;
      }

      case 'cancel': {
        if (vimMode === 'holding' && clipboard) {
          // Confirm delete — task stays removed, undo available via 'u'
          const { task, index } = clipboard;
          undoStack.push({
            undo: async () => {
              await store.insertAt(task, index);
            },
          });
          setClipboard(null);
          setVimMode('normal');
          onHoldingChange?.(undefined);
        }
        break;
      }

      case 'edit': {
        const task = getSelectedTask();
        if (!task) return;
        setEditingId(task.id);
        if (action.variant === 'start') {
          setEditState({ text: task.title, cursor: 0 });
        } else {
          setEditState({ text: task.title, cursor: task.title.length });
        }
        setVimMode('insert');
        break;
      }

      case 'create': {
        const idx = action.above ? selPos : selPos + 1;
        setCreatingAt(idx);
        setEditState({ text: '', cursor: 0 });
        setVimMode('insert');
        break;
      }

      case 'mark-done': {
        const task = getSelectedTask();
        if (!task) return;
        const prevStatus = task.status;
        const newStatus = task.status === 'done' ? 'todo' : 'done';
        store.update(task.id, { status: newStatus }).then(() => {
          undoStack.push({
            undo: async () => {
              await store.update(task.id, { status: prevStatus });
            },
          });
          reload();
        });
        break;
      }

      case 'undo': {
        undoStack.pop().then((didUndo) => {
          if (didUndo) reload();
        });
        break;
      }

      case 'search': {
        setIsSearching(true);
        setSearchQuery('');
        setVimMode('insert');
        break;
      }

      case 'toggle-focus': {
        const task = getSelectedTask();
        if (!task) return;
        if (task.focused) {
          store.update(task.id, { focused: false }).then(() => reload());
        } else if (maxFocused !== null && focusedTasks.length >= maxFocused && !guardrailOverridden) {
          setPendingFocusTask(task);
        } else {
          store.update(task.id, { focused: true }).then(() => reload());
        }
        break;
      }

      case 'toggle-scope': {
        const task = getSelectedTask();
        if (!task) return;
        const prevScope = task.scope;
        const nextScope = prevScope === 'personal' ? 'professional' : 'personal';
        store.update(task.id, { scope: nextScope }).then(() => {
          undoStack.push({
            undo: async () => { await store.update(task.id, { scope: prevScope }); },
          });
          reload();
        });
        break;
      }
    }
  };

  const saveEdit = () => {
    if (isSearching) {
      setIsSearching(false);
      setVimMode('normal');
      return;
    }

    if (editingId) {
      const task = orderedTasks.find(t => t.id === editingId);
      const prevTitle = task?.title ?? '';
      if (editText.trim() && editText !== prevTitle) {
        const id = editingId;
        store.update(id, { title: editText.trim() }).then(() => {
          undoStack.push({
            undo: async () => {
              await store.update(id, { title: prevTitle });
            },
          });
          reload();
        });
      }
      setEditingId(null);
      setEditState({ text: '', cursor: 0 });
      setVimMode('normal');
      return;
    }

    if (creatingAt !== null) {
      if (editText.trim()) {
        const nearbyTask = getSelectedTask();
        const category = nearbyTask?.categories?.[0];
        const isFocused = nearbyTask?.focused ?? false;
        const scope = scopeFilter === 'all' ? 'personal' : scopeFilter;
        store.add({
          title: editText.trim(),
          scope,
          focused: isFocused,
          categories: category ? [category] : undefined,
          created_by: 'human',
        }).then((newTask) => {
          undoStack.push({
            undo: async () => {
              await store.remove(newTask.id);
            },
          });
          reload();
        });
      }
      setCreatingAt(null);
      setEditState({ text: '', cursor: 0 });
      setVimMode('normal');
      return;
    }
  };

  useVimKeys(vimMode, setVimMode, {
    isActive: true,
    onAction: handleAction,
    onInsertChar: (char) => {
      if (isSearching) {
        setSearchQuery(prev => prev + char);
      } else {
        setEditState(prev => ({
          text: prev.text.slice(0, prev.cursor) + char + prev.text.slice(prev.cursor),
          cursor: prev.cursor + 1,
        }));
      }
    },
    onInsertBackspace: () => {
      if (isSearching) {
        setSearchQuery(prev => prev.slice(0, -1));
      } else {
        setEditState(prev => {
          if (prev.cursor <= 0) return prev;
          return {
            text: prev.text.slice(0, prev.cursor - 1) + prev.text.slice(prev.cursor),
            cursor: prev.cursor - 1,
          };
        });
      }
    },
    onInsertEnter: saveEdit,
    onInsertEscape: saveEdit,
  });

  // Build tree view rows
  const taskRows: React.ReactNode[] = [];
  const taskRowPositions: number[] = []; // maps flat task index → position in taskRows
  let flatIdx = 0;

  for (const group of groups) {
    const label = group.category || 'uncategorized';
    taskRows.push(
      <Text key={`cat-${group.category}`} dimColor>{'  '}{label}</Text>
    );

    for (let i = 0; i < group.tasks.length; i++) {
      const task = group.tasks[i];
      const displayIdx = flatIdx;
      const isLast = i === group.tasks.length - 1;
      const connector = isLast ? '└─' : '├─';
      const isSelected = selPos === displayIdx;

      taskRowPositions.push(taskRows.length);

      if (editingId === task.id) {
        taskRows.push(
          <Box key={task.id}>
            <Text dimColor>{'  '}{connector} </Text>
            <InlineEdit text={editText} cursorPos={cursorPos} prefix="" />
          </Box>
        );
      } else {
        const terminalColor = getSessionHexColor(task.session_id, config);
        const activeSel = isSelected && panelFocus === 'tasks';
        taskRows.push(
          <Box key={task.id}>
            <Text color={activeSel ? 'cyan' : undefined} dimColor={!activeSel}>{isSelected ? ` ${CURSOR_GLYPH}` : '  '}{connector} </Text>
            <PriorityDot priority={task.priority} filled={task.status !== 'todo'} terminalColor={terminalColor} />
            <Text dimColor={!task.focused && !activeSel} color={activeSel ? 'cyan' : undefined}>
              {' '}{task.title}
            </Text>
            {scopeFilter === 'all' && <Text dimColor>{' ·'}{SCOPE_LABELS[task.scope]}</Text>}
            {task.focused && <Text color="yellow">{' ★'}</Text>}
            {task.status === 'done' && <Text dimColor>{' ✓'}</Text>}
          </Box>
        );
      }

      flatIdx++;
    }

    taskRows.push(<Text key={`spacer-${group.category}`}>{' '}</Text>);
  }

  // Insert creation row at the right position
  if (creatingAt !== null) {
    let insertPos: number;
    if (creatingAt < taskRowPositions.length) {
      insertPos = taskRowPositions[creatingAt];
    } else {
      // After last task — insert before the trailing spacer
      insertPos = taskRows.length > 0 ? taskRows.length - 1 : 0;
    }
    taskRows.splice(insertPos, 0,
      <Box key="__creating">
        <Text dimColor>{'  │  '}</Text>
        <InlineEdit text={editText} cursorPos={cursorPos} prefix="" />
      </Box>
    );
  }

  if (totalCount === 0) {
    taskRows.push(<Text key="empty" dimColor>{'    '}No tasks.</Text>);
  }

  // Windowed scrolling: clip taskRows to a visible window that follows the selection.
  // Reserved: Header(3) + Footer(4) + leading blank(1) + 2 rows for optional scroll hints
  // + any visible banner rows + hidden focused strip.
  const bannerRows =
    (isSearching ? 1 : 0) +
    (!isSearching && searchQuery ? 1 : 0) +
    (pendingFocusTask ? 1 : 0) +
    (vimMode === 'holding' && clipboard ? 1 : 0);
  const hiddenFocusedBand = hiddenFocusedTasks.length > 0 ? hiddenFocusedTasks.length + 1 : 0;
  const availableRows = Math.max(1, termHeight - 10 - bannerRows - hiddenFocusedBand);

  const selRow = taskRowPositions[selPos] ?? 0;
  const maxScroll = Math.max(0, taskRows.length - availableRows);
  let target = Math.min(Math.max(scrollOffset, 0), maxScroll);
  if (selRow < target) target = selRow;
  else if (selRow >= target + availableRows) target = selRow - availableRows + 1;

  // Snap to top: when only the leading category header would be hidden (target === 1),
  // use that slot for content instead of an "↑ 1 more above" hint.
  if (target === 1 && selRow < availableRows) target = 0;

  useEffect(() => {
    if (target !== scrollOffset) setScrollOffset(target);
  }, [target, scrollOffset]);

  const hasAbove = target > 0;
  const hasBelow = target + availableRows < taskRows.length;
  const visibleRows = taskRows.slice(target, target + availableRows);

  return (
    <Box flexDirection="row" flexShrink={0}>
      <Box flexDirection="column" flexGrow={1}>
        <Text> </Text>
        {isSearching && <SearchBar query={searchQuery} />}
        {searchQuery && !isSearching && (
          <Text dimColor>  filter: {searchQuery}</Text>
        )}
        {pendingFocusTask && (
          <Box>
            <Text color="yellow">  You have {focusedTasks.length} focused tasks. Add another? </Text>
            <Text dimColor>spc:confirm  any:cancel</Text>
          </Box>
        )}
        {vimMode === 'holding' && clipboard && (
          <Box>
            <Text dimColor>  -- cut: </Text>
            <Text color="yellow">{clipboard.task.title}</Text>
            <Text dimColor> --</Text>
          </Box>
        )}
        {hasAbove && <Text dimColor>  ↑ {target} more above</Text>}
        {visibleRows}
        {hasBelow && <Text dimColor>  ↓ {taskRows.length - target - availableRows} more below</Text>}
        {hiddenFocusedTasks.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor>  {'─'.repeat(24)}</Text>
            {hiddenFocusedTasks.map(t => (
              <Box key={t.id}>
                <Text dimColor>  ★ {t.title}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
      <Box
        flexDirection="column"
        flexShrink={0}
        alignSelf="flex-start"
        width={36}
        marginLeft={2}
        borderStyle="single"
        borderColor={panelFocus === 'categories' ? 'cyan' : 'gray'}
        paddingX={1}
      >
        <Text color={panelFocus === 'categories' ? 'cyan' : undefined} dimColor={panelFocus !== 'categories'}>
          categories
        </Text>
        {allCategories.length === 0 && (
          <Text dimColor>(none)</Text>
        )}
        {allCategories.map((cat, i) => {
          const label = cat || 'uncategorized';
          const hidden = hiddenCategories.has(cat);
          const selected = panelFocus === 'categories' && catPos === i;
          const count = categoryCounts.get(cat) ?? 0;
          const focusedCount = focusedCountByCategory.get(cat) ?? 0;
          const mark = hidden ? '○' : '●';
          return (
            <Text key={cat || '__empty'}>
              <Text color={selected ? 'cyan' : undefined} dimColor={!selected}>
                {selected ? CURSOR_GLYPH : ' '} {mark}
              </Text>
              <Text color={selected ? 'cyan' : undefined} dimColor={!selected || hidden}>
                {' '}{label}
              </Text>
              {focusedCount > 0 && (
                <Text color={selected ? 'cyan' : 'yellow'}>{' '}★</Text>
              )}
              <Text dimColor>{' '}({count})</Text>
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
