import { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Task, TaskScope } from '../../types.js';
import type { TaskStore } from '../../store.js';
import type { VimMode, VimAction } from '../hooks/useVimKeys.js';
import { useVimKeys } from '../hooks/useVimKeys.js';
import { useUndoStack } from '../hooks/useUndoStack.js';
import { loadConfig } from '../../config.js';
import { TaskRow } from '../shared/TaskRow.js';
import { SectionDivider } from '../shared/SectionDivider.js';
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
  const [creatingAt, setCreatingAt] = useState<{ index: number; section: 'focused' | 'backlog' } | null>(null);
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

  const totalCount = filteredFocused.length + filteredBacklog.length;

  const getSelectedTask = (): Task | null => {
    if (selectedIndex < filteredFocused.length) return filteredFocused[selectedIndex];
    const backlogIdx = selectedIndex - filteredFocused.length;
    return filteredBacklog[backlogIdx] ?? null;
  };

  const isInFocusedSection = () => selectedIndex < filteredFocused.length;

  // Find array index of a task in the full (unfiltered) store task list
  const findStoreIndex = (taskId: string, tasks: Task[]): number => {
    return tasks.findIndex(t => t.id === taskId);
  };

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
        const wasFocused = task.focused;
        store.remove(task.id).then(({ index }) => {
          setClipboard({ task, index, wasFocused });
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
        const inFocused = isInFocusedSection();

        // Determine target position in the store array
        let targetIndex: number;
        const anchorTask = getSelectedTask();
        if (anchorTask) {
          targetIndex = findStoreIndex(anchorTask.id, allTasks);
          if (!action.above) targetIndex += 1;
        } else {
          targetIndex = allTasks.length;
        }

        // Update focused status if crossing boundary
        const taskToInsert = { ...clipboard.task };
        if (inFocused && !taskToInsert.focused) {
          taskToInsert.focused = true;
        } else if (!inFocused && taskToInsert.focused) {
          taskToInsert.focused = false;
        }

        const origClipboard = clipboard;
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
        const section = isInFocusedSection() || filteredBacklog.length === 0 ? 'focused' : 'backlog';
        const idx = action.above ? selectedIndex : selectedIndex + 1;
        setCreatingAt({ index: idx, section });
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
      const task = [...focusedTasks, ...backlogTasks].find(t => t.id === editingId);
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

    if (creatingAt) {
      if (editText.trim()) {
        const isFocused = creatingAt.section === 'focused';
        const scope = scopeFilter === 'all' ? 'personal' : scopeFilter;
        store.add({
          title: editText.trim(),
          scope,
          focused: isFocused,
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

  // Render task rows, substituting InlineEdit when editing
  const renderRow = (task: Task, displayIndex: number) => {
    if (editingId === task.id) {
      return <InlineEdit key={task.id} text={editText} cursorPos={cursorPos} />;
    }
    return <TaskRow key={task.id} task={task} isSelected={selectedIndex === displayIndex} />;
  };

  const focusedRows = filteredFocused.length === 0
    ? [<Text key="focused-empty" dimColor>    No focused tasks. Press space to focus.</Text>]
    : filteredFocused.map((task, i) => renderRow(task, i));

  // Insert creation row if creating in focused section
  if (creatingAt?.section === 'focused') {
    const insertIdx = Math.min(creatingAt.index, focusedRows.length);
    focusedRows.splice(insertIdx, 0, <InlineEdit key="__creating" text={editText} cursorPos={cursorPos} />);
  }

  const backlogRows = filteredBacklog.length === 0
    ? [<Text key="backlog-empty" dimColor>    No backlog tasks.</Text>]
    : filteredBacklog.map((task, i) => renderRow(task, filteredFocused.length + i));

  // Insert creation row if creating in backlog section
  if (creatingAt?.section === 'backlog') {
    const insertIdx = Math.min(creatingAt.index - filteredFocused.length, backlogRows.length);
    backlogRows.splice(insertIdx, 0, <InlineEdit key="__creating" text={editText} cursorPos={cursorPos} />);
  }

  return (
    <Box flexDirection="column">
      <Text> </Text>
      {isSearching && <SearchBar query={searchQuery} />}
      {searchQuery && !isSearching && (
        <Text dimColor>  filter: {searchQuery}</Text>
      )}
      <SectionDivider label={`FOCUSED (${filteredFocused.length})`} />
      {focusedRows}
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
      <Text> </Text>
      <SectionDivider label={`BACKLOG (${filteredBacklog.length})`} />
      {backlogRows}
      <Text> </Text>
    </Box>
  );
}
