import { useState, useMemo, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { Task, TaskScope } from '../../types.js';
import type { Store } from '../../store-interface.js';
import type { VimMode, VimAction } from '../hooks/useVimKeys.js';
import { useVimKeys } from '../hooks/useVimKeys.js';
import { useUndoStack } from '../hooks/useUndoStack.js';
import { TaskRow } from '../shared/TaskRow.js';
import { TaskRowExpanded } from '../shared/TaskRowExpanded.js';
import { InlineEdit } from '../shared/InlineEdit.js';
import { SearchBar } from '../shared/SearchBar.js';
import { loadConfig } from '../../config.js';
import { localDateString } from '../../local-date.js';
import { getSessionHexColor, getCurrentSessionId, isSessionActive } from '../../sessions.js';

interface Props {
  focusedTasks: Task[];
  backlogCount: number;
  subtaskMap: Map<string, Task[]>;
  cursorId: string | null;
  onCursorChange: (id: string | null) => void;
  store: Store;
  reload: () => void;
  vimMode: VimMode;
  setVimMode: (mode: VimMode) => void;
  scopeFilter: TaskScope | 'all';
  onHoldingChange?: (title: string | undefined) => void;
}

interface Clipboard {
  task: Task;
  index: number;
  isSubtask: boolean;
  parentId?: string;
}

function getSubtaskProgress(
  parentId: string,
  subtaskMap: Map<string, Task[]>,
): { done: number; total: number } | undefined {
  const subs = subtaskMap.get(parentId);
  if (!subs || subs.length === 0) return undefined;
  return {
    done: subs.filter(s => s.status === 'done').length,
    total: subs.length,
  };
}

export function FocusMode({
  focusedTasks, backlogCount, subtaskMap, cursorId, onCursorChange,
  store, reload, vimMode, setVimMode, scopeFilter, onHoldingChange,
}: Props) {
  const [navTarget, setNavTarget] = useState<'tasks' | 'subtasks'>('tasks');
  const [subtaskId, setSubtaskId] = useState<string | null>(null);

  // Vim feature state
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [editState, setEditState] = useState({ text: '', cursor: 0 });
  const [creatingAt, setCreatingAt] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const editText = editState.text;
  const cursorPos = editState.cursor;

  const undoStack = useUndoStack();

  // Load session config for color resolution
  const sessionConfig = useMemo(() => loadConfig(), [focusedTasks]);
  // Current session's color — used for the highlighted/expanded task
  const currentSessionColor = useMemo(() => {
    const sid = getCurrentSessionId();
    return getSessionHexColor(sid, sessionConfig);
  }, [sessionConfig]);

  const filteredTasks = useMemo(() => {
    if (!searchQuery) return focusedTasks;
    const q = searchQuery.toLowerCase();
    return focusedTasks.filter(t => t.title.toLowerCase().includes(q));
  }, [focusedTasks, searchQuery]);

  // Resolve the id-anchored cursor to a position in the *current* filtered
  // list, fresh every render. selPos falls back to 0 (never -1), so the
  // selection can never be a dead index — a filtered-out/removed task lands
  // the cursor on the top row until the re-anchor effect updates the id.
  const selPos = cursorId ? Math.max(0, filteredTasks.findIndex(t => t.id === cursorId)) : 0;
  const selectedTask = filteredTasks[selPos] ?? null;
  const currentSubtasks = selectedTask ? (subtaskMap.get(selectedTask.id) ?? []) : [];
  const subPos = subtaskId ? Math.max(0, currentSubtasks.findIndex(s => s.id === subtaskId)) : 0;
  const selectedSubtask = currentSubtasks[subPos] ?? null;

  // Keep the cursor anchored to a real task as the list reorders/shrinks
  // (own edits, background poll, search filter). No index clamp needed.
  useEffect(() => {
    if (filteredTasks.length === 0) {
      if (cursorId !== null) onCursorChange(null);
    } else if (!cursorId || !filteredTasks.some(t => t.id === cursorId)) {
      onCursorChange(filteredTasks[selPos]?.id ?? filteredTasks[0].id);
    }
  }, [filteredTasks, cursorId, onCursorChange, selPos]);

  // Same for the subtask cursor while browsing subtasks.
  useEffect(() => {
    if (navTarget !== 'subtasks' || currentSubtasks.length === 0) return;
    if (!subtaskId || !currentSubtasks.some(s => s.id === subtaskId)) {
      setSubtaskId(currentSubtasks[subPos]?.id ?? currentSubtasks[0].id);
    }
  }, [navTarget, currentSubtasks, subtaskId, subPos]);

  const handleAction = (action: VimAction) => {
    switch (action.type) {
      case 'move': {
        if (filteredTasks.length === 0) return;
        if (navTarget === 'subtasks') {
          const next = action.direction === 'down'
            ? Math.min(subPos + 1, currentSubtasks.length - 1)
            : Math.max(subPos - 1, 0);
          setSubtaskId(currentSubtasks[next]?.id ?? null);
        } else {
          const next = action.direction === 'down'
            ? Math.min(selPos + 1, filteredTasks.length - 1)
            : Math.max(selPos - 1, 0);
          onCursorChange(filteredTasks[next]?.id ?? null);
          setNavTarget('tasks');
          setSubtaskId(null);
        }
        break;
      }

      case 'tab': {
        if (navTarget === 'tasks') {
          setNavTarget('subtasks');
          setSubtaskId(currentSubtasks[0]?.id ?? null);
          // If no subtasks, immediately start creating one
          if (currentSubtasks.length === 0) {
            setCreatingAt(0);
            setEditState({ text: '', cursor: 0 });
            setVimMode('insert');
          }
        } else {
          setNavTarget('tasks');
        }
        break;
      }

      case 'mark-done': {
        if (navTarget === 'subtasks') {
          const sub = selectedSubtask;
          if (sub) {
            const prevStatus = sub.status;
            const newStatus = sub.status === 'done' ? 'todo' : 'done';
            store.update(sub.id, { status: newStatus }).then(() => {
              undoStack.push({
                undo: async () => { await store.update(sub.id, { status: prevStatus }); },
              });
              reload();
            });
          }
        } else {
          const task = selectedTask;
          if (task) {
            const prevStatus = task.status;
            const newStatus = task.status === 'done' ? 'todo' : 'done';
            store.update(task.id, { status: newStatus }).then(() => {
              undoStack.push({
                undo: async () => { await store.update(task.id, { status: prevStatus }); },
              });
              reload();
            });
          }
        }
        break;
      }

      case 'edit': {
        const task = navTarget === 'subtasks' ? selectedSubtask : selectedTask;
        if (!task) return;
        setEditingId(task.id);
        // Both 'start' (i) and 'end' (A) place cursor at end in focus mode
        setEditState({ text: task.title, cursor: task.title.length });
        setVimMode('insert');
        break;
      }

      case 'edit-date': {
        const task = navTarget === 'subtasks' ? selectedSubtask : selectedTask;
        if (!task || task.status !== 'done' || !task.completed_at) return;
        // Show the LOCAL calendar date, not the UTC prefix — an evening
        // completion has tomorrow's date in UTC, and every "done on day X"
        // comparison in the app is local (see local-date.ts).
        const dateStr = localDateString(new Date(task.completed_at));
        setEditingDateId(task.id);
        // Place cursor at end (day portion) — vim A behavior
        setEditState({ text: dateStr, cursor: dateStr.length });
        setVimMode('insert');
        break;
      }

      case 'edit-description': {
        // Description edit is parent-task only for now.
        if (navTarget !== 'tasks') return;
        const task = selectedTask;
        if (!task) return;
        const desc = task.description ?? '';
        setEditingDescriptionId(task.id);
        setEditState({ text: desc, cursor: desc.length });
        setVimMode('insert');
        break;
      }

      case 'create': {
        const createIdx = navTarget === 'subtasks' && selectedTask
          ? (action.above ? subPos : subPos + 1)
          : (action.above ? selPos : selPos + 1);
        setCreatingAt(createIdx);
        setEditState({ text: '', cursor: 0 });
        setVimMode('insert');
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

      case 'cut': {
        // No undo entry here — holding mode ends in paste or Esc, each of
        // which pushes exactly one entry for the whole operation. Pushing
        // on cut too meant a second `u` after a move re-inserted the task
        // a second time (duplicate id).
        if (navTarget === 'subtasks') {
          const sub = selectedSubtask;
          if (sub) {
            store.remove(sub.id).then(({ index }) => {
              setClipboard({ task: sub, index, isSubtask: true, parentId: sub.parent_id ?? undefined });
              setVimMode('holding');
              onHoldingChange?.(sub.title);
              reload();
            });
          }
        } else {
          const task = selectedTask;
          if (task) {
            store.remove(task.id).then(({ index }) => {
              setClipboard({ task, index, isSubtask: false });
              setVimMode('holding');
              onHoldingChange?.(task.title);
              reload();
            });
          }
        }
        break;
      }

      case 'paste': {
        if (!clipboard) return;
        store.load().then((allTasks) => {
          // Determine target position
          let targetIndex: number;
          if (navTarget === 'subtasks') {
            const anchorSub = selectedSubtask;
            if (anchorSub) {
              targetIndex = allTasks.findIndex(t => t.id === anchorSub.id);
              if (!action.above) targetIndex += 1;
            } else if (selectedTask) {
              // No subtasks — insert after parent
              targetIndex = allTasks.findIndex(t => t.id === selectedTask.id) + 1;
            } else {
              targetIndex = allTasks.length;
            }
          } else {
            const anchorTask = selectedTask;
            if (anchorTask) {
              targetIndex = allTasks.findIndex(t => t.id === anchorTask.id);
              if (!action.above) targetIndex += 1;
            } else {
              targetIndex = allTasks.length;
            }
          }

          const origClipboard = clipboard;
          const taskToInsert = { ...clipboard.task };

          // If pasting in subtask nav, make it a subtask of the selected task
          if (navTarget === 'subtasks' && selectedTask) {
            taskToInsert.parent_id = selectedTask.id;
          } else {
            taskToInsert.parent_id = null;
          }

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
            undo: async () => { await store.insertAt(task, index); },
          });
          setClipboard(null);
          setVimMode('normal');
          onHoldingChange?.(undefined);
        } else if (navTarget === 'subtasks') {
          setNavTarget('tasks');
        } else if (searchQuery) {
          setSearchQuery('');
        }
        break;
      }

      case 'jump': {
        if (navTarget === 'subtasks') {
          if (currentSubtasks.length === 0) return;
          const pos = action.to === 'top' ? 0 : currentSubtasks.length - 1;
          setSubtaskId(currentSubtasks[pos]?.id ?? null);
        } else {
          if (filteredTasks.length === 0) return;
          const pos = action.to === 'top' ? 0 : filteredTasks.length - 1;
          onCursorChange(filteredTasks[pos]?.id ?? null);
          setNavTarget('tasks');
          setSubtaskId(null);
        }
        break;
      }

      case 'toggle-scope': {
        // Parent tasks only — subtasks follow their parent conceptually.
        if (navTarget !== 'tasks') return;
        const task = selectedTask;
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

      // toggle-focus not supported in focus mode
      default:
        break;
    }
  };

  const saveEdit = () => {
    if (isSearching) {
      setIsSearching(false);
      setVimMode('normal');
      return;
    }

    if (editingDateId) {
      const allTasks = [...focusedTasks, ...focusedTasks.flatMap(t => subtaskMap.get(t.id) ?? [])];
      const task = allTasks.find(t => t.id === editingDateId);
      const prevCompletedAt = task?.completed_at ?? null;
      const newDate = editText.trim();
      // Validate YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(newDate) && !isNaN(new Date(newDate).getTime())) {
        // The typed date is a LOCAL calendar day. Rebuild the timestamp on
        // that local day, keeping the original local time-of-day — splicing
        // the date onto the UTC string (the old approach) shifted evening
        // completions onto the wrong local day.
        const [y, m, d] = newDate.split('-').map(Number);
        const prev = prevCompletedAt ? new Date(prevCompletedAt) : new Date();
        const newCompletedAt = new Date(
          y, m - 1, d, prev.getHours(), prev.getMinutes(), prev.getSeconds(), prev.getMilliseconds(),
        ).toISOString();
        const id = editingDateId;
        store.update(id, { completed_at: newCompletedAt }).then(() => {
          undoStack.push({
            undo: async () => { await store.update(id, { completed_at: prevCompletedAt }); },
          });
          reload();
        });
      }
      setEditingDateId(null);
      setEditState({ text: '', cursor: 0 });
      setVimMode('normal');
      return;
    }

    if (editingDescriptionId) {
      const task = focusedTasks.find(t => t.id === editingDescriptionId);
      const prevDescription = task?.description ?? null;
      const newDescription = editText.trim() === '' ? null : editText;
      if (newDescription !== prevDescription) {
        const id = editingDescriptionId;
        store.update(id, { description: newDescription }).then(() => {
          undoStack.push({
            undo: async () => { await store.update(id, { description: prevDescription }); },
          });
          reload();
        });
      }
      setEditingDescriptionId(null);
      setEditState({ text: '', cursor: 0 });
      setVimMode('normal');
      return;
    }

    if (editingId) {
      const allTasks = [...focusedTasks, ...focusedTasks.flatMap(t => subtaskMap.get(t.id) ?? [])];
      const task = allTasks.find(t => t.id === editingId);
      const prevTitle = task?.title ?? '';
      if (editText.trim() && editText !== prevTitle) {
        const id = editingId;
        store.update(id, { title: editText.trim() }).then(() => {
          undoStack.push({
            undo: async () => { await store.update(id, { title: prevTitle }); },
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
        const isSubtaskCreate = navTarget === 'subtasks' && selectedTask;
        const scope = scopeFilter === 'all' ? 'personal' : scopeFilter;
        const input = {
          title: editText.trim(),
          scope,
          focused: true,
          created_by: 'human' as const,
          ...(isSubtaskCreate ? { parent_id: selectedTask!.id } : {}),
        };
        store.add(input).then((newTask) => {
          undoStack.push({
            undo: async () => { await store.remove(newTask.id); },
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

  if (filteredTasks.length === 0 && !searchQuery) {
    const backlogMsg = backlogCount > 0
      ? <Text key="backlog" dimColor>{'  + ' + backlogCount + ' in backlog'}</Text>
      : null;

    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Text dimColor>  No focused tasks. Use <Text color="cyan">task-man focus {'<id>'}</Text> to add some.</Text>
        {backlogMsg}
        <Text> </Text>
      </Box>
    );
  }

  const taskRows = filteredTasks.map((task, i) => {
    const terminalColor = getSessionHexColor(task.session_id, sessionConfig);
    const active = task.session_id ? isSessionActive(task.session_id) : false;

    if (editingId === task.id) {
      return <InlineEdit key={task.id} text={editText} cursorPos={cursorPos} />;
    }
    if (selPos === i) {
      return (
        <Box flexDirection="column" key={task.id}>
          <TaskRowExpanded
            task={task}
            subtasks={subtaskMap.get(task.id) ?? []}
            subtaskProgress={getSubtaskProgress(task.id, subtaskMap)}
            inSubtaskNav={navTarget === 'subtasks'}
            selectedSubtaskIndex={subPos}
            editingSubtaskId={editingId}
            editingDateId={editingDateId}
            editingDescriptionId={editingDescriptionId}
            editText={editText}
            cursorPos={cursorPos}
            terminalColor={currentSessionColor ?? terminalColor}
            showScope={scopeFilter === 'all'}
          />
          {/* Insert creation row for subtask */}
          {creatingAt !== null && navTarget === 'subtasks' && (
            <InlineEdit text={editText} cursorPos={cursorPos} prefix="      " />
          )}
          <Text> </Text>
        </Box>
      );
    }
    return (
      <TaskRow
        key={task.id}
        task={task}
        isSelected={false}
        subtaskProgress={getSubtaskProgress(task.id, subtaskMap)}
        terminalColor={terminalColor}
        sessionActive={active}
        showScope={scopeFilter === 'all'}
      />
    );
  });

  // Insert creation row for parent task
  if (creatingAt !== null && navTarget === 'tasks') {
    const insertIdx = Math.min(creatingAt, taskRows.length);
    taskRows.splice(insertIdx, 0,
      <InlineEdit key="__creating" text={editText} cursorPos={cursorPos} />
    );
  }

  const backlogRow = backlogCount > 0
    ? <Text key="backlog" dimColor>{'  + ' + backlogCount + ' more in backlog'}</Text>
    : null;

  return (
    <Box flexDirection="column">
      <Text> </Text>
      {isSearching && <SearchBar query={searchQuery} />}
      {searchQuery && !isSearching && (
        <Text dimColor>  filter: {searchQuery}</Text>
      )}
      {vimMode === 'holding' && clipboard && (
        <Box>
          <Text dimColor>  -- cut: </Text>
          <Text color="yellow">{clipboard.task.title}</Text>
          <Text dimColor> --</Text>
        </Box>
      )}
      {taskRows}
      {backlogRow}
      <Text> </Text>
    </Box>
  );
}
