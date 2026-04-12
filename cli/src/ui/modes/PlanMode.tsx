import { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Task, TaskScope } from '../../types.js';
import type { TaskStore } from '../../store.js';
import type { VimMode, VimAction } from '../hooks/useVimKeys.js';
import { useVimKeys } from '../hooks/useVimKeys.js';
import { useUndoStack } from '../hooks/useUndoStack.js';
import { loadConfig } from '../../config.js';
import { PriorityDot } from '../shared/PriorityDot.js';
import { InlineEdit } from '../shared/InlineEdit.js';
import { SearchBar } from '../shared/SearchBar.js';

interface Props {
  focusedTasks: Task[];
  backlogTasks: Task[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  store: TaskStore;
  reload: () => void;
  vimMode: VimMode;
  setVimMode: (mode: VimMode) => void;
  scopeFilter: TaskScope | 'all';
  onHoldingChange?: (title: string | undefined) => void;
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
  focusedTasks, backlogTasks, selectedIndex, onSelectedIndexChange,
  store, reload, vimMode, setVimMode, scopeFilter, onHoldingChange,
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

  // Group all tasks by category for tree view
  const { orderedTasks, groups } = useMemo(() => {
    const all = [...filteredFocused, ...filteredBacklog];
    const groupMap = new Map<string, Task[]>();
    for (const task of all) {
      const cat = task.categories?.[0] ?? '';
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
  }, [filteredFocused, filteredBacklog]);

  const totalCount = orderedTasks.length;

  const getSelectedTask = (): Task | null => orderedTasks[selectedIndex] ?? null;

  const handleAction = (action: VimAction) => {
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
        if (totalCount === 0) return;
        if (action.direction === 'down') {
          onSelectedIndexChange(Math.min(selectedIndex + 1, totalCount - 1));
        } else {
          onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
        }
        break;
      }

      case 'cut': {
        const task = getSelectedTask();
        if (!task) return;
        store.remove(task.id).then(({ index }) => {
          setClipboard({ task, index, wasFocused: task.focused });
          setVimMode('holding');
          onHoldingChange?.(task.title);
          undoStack.push({
            undo: async () => {
              await store.insertAt(task, index);
            },
          });
          reload();
        });
        break;
      }

      case 'paste': {
        if (!clipboard) return;
        const allTasks = store.load();

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
        break;
      }

      case 'cancel': {
        if (vimMode === 'holding' && clipboard) {
          // Confirm delete — task stays removed, undo available via 'u'
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
        if (action.variant === 'clear') {
          setEditState({ text: '', cursor: 0 });
        } else if (action.variant === 'start') {
          setEditState({ text: task.title, cursor: 0 });
        } else {
          setEditState({ text: task.title, cursor: task.title.length });
        }
        setVimMode('insert');
        break;
      }

      case 'create': {
        const idx = action.above ? selectedIndex : selectedIndex + 1;
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
      const isSelected = selectedIndex === displayIdx;

      taskRowPositions.push(taskRows.length);

      if (editingId === task.id) {
        taskRows.push(
          <Box key={task.id}>
            <Text dimColor>{'  '}{connector} </Text>
            <InlineEdit text={editText} cursorPos={cursorPos} prefix="" />
          </Box>
        );
      } else {
        taskRows.push(
          <Box key={task.id}>
            <Text color={isSelected ? 'cyan' : undefined} dimColor={!isSelected}>{isSelected ? ' ▸' : '  '}{connector} </Text>
            <PriorityDot priority={task.priority} filled={task.status !== 'todo'} />
            <Text dimColor={!task.focused && !isSelected} color={isSelected ? 'cyan' : undefined}>
              {' '}{task.title}
            </Text>
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

  return (
    <Box flexDirection="column">
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
      {taskRows}
    </Box>
  );
}
