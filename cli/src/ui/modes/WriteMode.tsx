import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Task, TaskPriority, TaskScope } from '../../types.js';
import type { Store, TaskChanges } from '../../store-interface.js';
import type { AppMode, WriteSubMode } from '../types.js';
import type { VimMode } from '../hooks/useVimKeys.js';
import { useUndoStack } from '../hooks/useUndoStack.js';
import { useTerminalHeight } from '../hooks/useTerminalWidth.js';
import { loadConfig } from '../../config.js';
import { getCurrentSessionId } from '../../sessions.js';
import { parseWriteInput, type ParsedEntry } from '../../parse-entry.js';
import { isLocalToday } from '../../local-date.js';
import {
  useCategoryMatch,
  getAllCategories,
  suggestPrefix,
  suggestFuzzy,
} from '../hooks/useCategoryMatch.js';
import { EntryList, orderedTaskIds, type EntryListEditing, type CategoryEditAssist, type CaptureAnchor } from './write/EntryList.js';
import { CapturePane } from './write/CapturePane.js';
import { cursorMoveFor, moveCursor, insertChar, deleteBack, isPrintable } from '../shared/textInput.js';

export type TimeFilter = 'today' | 'all';

interface Props {
  store: Store;
  tasks?: Task[];
  reload: () => void;
  scopeFilter: TaskScope | 'all';
  onModeChange: (mode: AppMode) => void;
  onCycleScope: () => void;
  onHoldingChange?: (title: string | undefined) => void;
  vimMode?: VimMode;
  setVimMode?: (mode: VimMode) => void;
  subMode?: WriteSubMode;
  onSubModeChange?: (sub: WriteSubMode) => void;
}

function formatPreview(parsed: ParsedEntry, isSubtask: boolean): string {
  const parts: string[] = [];
  if (parsed.priority !== 'medium') parts.push(`Priority: ${parsed.priority}`);
  if (parsed.categories.length > 0) parts.push(`Category: ${parsed.categories.join(', ')}`);
  if (parsed.scope) parts.push(`Scope: ${parsed.scope}`);
  if (parsed.description) parts.push(`Desc: ${parsed.description}`);
  if (parsed.focused) parts.push('Focused');
  if (isSubtask) parts.push('Subtask');
  return parts.length > 0 ? parts.join(' | ') : '';
}

function cyclePriority(p: TaskPriority): TaskPriority {
  return p === 'low' ? 'medium' : p === 'medium' ? 'high' : 'low';
}

function cycleTimeFilter(f: TimeFilter): TimeFilter {
  return f === 'today' ? 'all' : 'today';
}

function TimeFilterChip({ active }: { active: TimeFilter }) {
  const opt = (name: TimeFilter, label: string) => (
    <Text color={active === name ? 'cyan' : undefined} dimColor={active !== name} bold={active === name}>
      {label}
    </Text>
  );
  return (
    <Box>
      <Text dimColor>{'  ['}</Text>
      {opt('today', 'today')}
      <Text dimColor>{' · '}</Text>
      {opt('all', 'all')}
      <Text dimColor>{']'}</Text>
    </Box>
  );
}

function SubModeChip({ active }: { active: WriteSubMode }) {
  const dot = active === 'capture' ? 'magenta' : 'cyan';
  return (
    <Box>
      <Text dimColor>{'   '}</Text>
      <Text color={dot}>{'●'}</Text>
      <Text color={dot} bold>{' '}{active === 'capture' ? 'CAPTURE' : 'REVIEW'}</Text>
    </Box>
  );
}

const SEQ_TIMEOUT = 300;

export function WriteMode({
  store,
  tasks: tasksProp,
  reload,
  scopeFilter,
  onModeChange,
  onCycleScope,
  onHoldingChange,
  vimMode,
  setVimMode,
  subMode: subModeProp,
  onSubModeChange,
}: Props) {
  const [localSubMode, setLocalSubMode] = useState<WriteSubMode>('capture');
  const subMode = subModeProp ?? localSubMode;
  const changeSubMode = (next: WriteSubMode) => {
    if (onSubModeChange) onSubModeChange(next);
    else setLocalSubMode(next);
  };

  // The capture line is a full text buffer, not an append-only string — see
  // ui/shared/textInput.ts. `inputText` stays derived so everything that reads
  // the line (parsing, category match, submit) is unchanged.
  const [capture, setCapture] = useState({ text: '', cursor: 0 });
  const inputText = capture.text;
  const setInputText = (next: string) => setCapture({ text: next, cursor: next.length });
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [navTarget, setNavTarget] = useState<'tasks' | 'subtasks'>('tasks');
  const [subtaskIndex, setSubtaskIndex] = useState(0);
  const [editing, setEditing] = useState<EntryListEditing | null>(null);
  // Cut-and-confirm clipboard, same flow as Focus/Plan: dd removes and holds,
  // p/P pastes, Esc confirms the delete. Holding is keyed off this state (not
  // vimMode) so it works when WriteMode renders without a vimMode wire-up.
  const [clipboard, setClipboard] = useState<{ task: Task; index: number } | null>(null);
  const [tick, setTick] = useState(0);

  const keyBufferRef = useRef('');
  const keyBufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const undoStack = useUndoStack();
  const termHeight = useTerminalHeight();

  const config = useMemo(() => loadConfig(), []);
  const currentSessionId = useMemo(() => getCurrentSessionId(), []);

  // tasksProp (InteractiveApp's normal path) is already-loaded and reactive;
  // the self-load fallback only exercises when a caller renders WriteMode
  // standalone without it (some tests, preview.tsx).
  const [selfLoadedTasks, setSelfLoadedTasks] = useState<Task[]>([]);
  useEffect(() => {
    if (tasksProp) return;
    store.load().then(setSelfLoadedTasks);
  }, [tasksProp, store, tick]);
  const allTasks = tasksProp ?? selfLoadedTasks;

  const localReload = () => {
    setTick(t => t + 1);
    reload();
  };

  const { parents, subtaskMap } = useMemo(() => {
    const sMap = new Map<string, Task[]>();
    const ps: Task[] = [];
    for (const t of allTasks) {
      if (t.parent_id) {
        const existing = sMap.get(t.parent_id) ?? [];
        existing.push(t);
        sMap.set(t.parent_id, existing);
      } else {
        ps.push(t);
      }
    }
    return { parents: ps, subtaskMap: sMap };
  }, [allTasks]);

  const filteredParents = useMemo(() => {
    let list = parents;
    if (scopeFilter !== 'all') list = list.filter(t => t.scope === scopeFilter);
    if (timeFilter === 'today') {
      // Local-time today — see cli/src/local-date.ts for why.
      list = list.filter(t => isLocalToday(t.created_at));
    } else {
      list = list.filter(t => t.status !== 'done').slice(0, 100);
    }
    return list;
  }, [parents, scopeFilter, timeFilter]);

  const orderedIds = useMemo(() => orderedTaskIds(filteredParents), [filteredParents]);

  useEffect(() => {
    if (orderedIds.length === 0) {
      if (cursorId !== null) setCursorId(null);
      return;
    }
    if (!cursorId || !orderedIds.includes(cursorId)) {
      setCursorId(orderedIds[0]);
    }
  }, [orderedIds, cursorId]);

  // Keep parent vimMode in sync with edit state (for footer insert hints)
  useEffect(() => {
    if (!setVimMode) return;
    if (editing && vimMode !== 'insert') setVimMode('insert');
    else if (!editing && vimMode === 'insert') setVimMode('normal');
  }, [editing, vimMode, setVimMode]);

  const trimmed = inputText.trim();
  const isSubtaskInput = trimmed.startsWith(':');
  const cleanInput = isSubtaskInput ? trimmed.slice(1).trim() : trimmed;
  const liveParsed = cleanInput.length > 0 ? parseWriteInput(cleanInput) : null;
  const preview = liveParsed ? formatPreview(liveParsed, false) : '';

  // The live buffer the inline subtask row echoes, with trailing whitespace
  // INTACT. Only the leading side is trimmed (past the ':'), so the rendered
  // cursor sits exactly where the next character lands — feeding it a parsed,
  // trimmed title is what made a typed space look like a dead key.
  const subtaskPrefixLen = isSubtaskInput ? (inputText.match(/^\s*:\s*/)?.[0].length ?? 0) : 0;
  const subtaskBuffer = isSubtaskInput ? inputText.slice(subtaskPrefixLen) : '';
  const subtaskCursor = Math.max(0, Math.min(subtaskBuffer.length, capture.cursor - subtaskPrefixLen));

  const categoryMatch = useCategoryMatch(inputText, allTasks);

  const anchorTitle = useMemo(() => {
    if (!cursorId) return null;
    return allTasks.find(t => t.id === cursorId)?.title ?? null;
  }, [cursorId, allTasks]);

  const captureAnchor: CaptureAnchor | null = useMemo(() => {
    if (subMode !== 'capture' || !cursorId) return null;
    return {
      parentId: cursorId,
      isTypingSubtask: isSubtaskInput,
      previewText: subtaskBuffer,
      previewCursor: subtaskCursor,
    };
  }, [subMode, cursorId, isSubtaskInput, subtaskBuffer, subtaskCursor]);

  const categoriesList = useMemo(() => getAllCategories(allTasks), [allTasks]);
  const reviewCategoryAssist: CategoryEditAssist | null = useMemo(() => {
    if (editing?.type !== 'category') return null;
    const partial = editing.text;
    if (!partial) return { ghost: null, topMatch: null, list: [], didYouMean: null };
    const { top, list } = suggestPrefix(partial, categoriesList);
    if (top) {
      return {
        ghost: top.name.length > partial.length ? top.name.slice(partial.length) : null,
        topMatch: top.name,
        list: list.map(c => c.name),
        didYouMean: null,
      };
    }
    const fuzzy = suggestFuzzy(partial, categoriesList);
    return { ghost: null, topMatch: null, list: [], didYouMean: fuzzy?.name ?? null };
  }, [editing, categoriesList]);

  const getSelectedTask = (): Task | null => {
    if (!cursorId) return null;
    return filteredParents.find(t => t.id === cursorId) ?? null;
  };

  const submitCapture = () => {
    if (inputText.trim().length === 0) return;

    const text = inputText.trim();
    const colonPrefix = text.startsWith(':');
    const cleanText = colonPrefix ? text.slice(1).trim() : text;
    const parsed = parseWriteInput(cleanText);
    if (parsed.title.length === 0) return;

    const scope: TaskScope = parsed.scope ?? (scopeFilter !== 'all' ? scopeFilter : 'personal');
    const parentId = colonPrefix && cursorId ? cursorId : null;

    store.add({
      title: parsed.title,
      priority: parsed.priority,
      scope,
      categories: parsed.categories,
      description: parsed.description ?? undefined,
      parent_id: parentId ?? undefined,
      focused: parsed.focused,
      session_id: currentSessionId,
      created_by: 'human',
    }).then((task) => {
      if (!parentId) {
        setCursorId(task.id);
      }
      setInputText('');
      undoStack.push({
        undo: async () => { await store.remove(task.id); },
      });
      localReload();
    });
  };

  const acceptCategoryGhost = () => {
    const canonical = categoryMatch.topMatch ?? categoryMatch.didYouMean;
    if (!canonical || !categoryMatch.active) return;
    const partial = categoryMatch.partial;

    // Quoted partial: -c "partial
    const reQuoted = /(^|\s)-c\s+"([^"]*)$/;
    const mq = inputText.match(reQuoted);
    if (mq) {
      const end = inputText.length - partial.length - 1; // -1 for leading quote
      setInputText(inputText.slice(0, end) + `"${canonical}" `);
      return;
    }

    const re = /(^|\s)-c\s+([^\s]*)$/;
    if (!re.test(inputText)) return;
    const end = inputText.length - partial.length;
    const rep = canonical.includes(' ') ? `"${canonical}" ` : `${canonical} `;
    setInputText(inputText.slice(0, end) + rep);
  };

  // vim placement, as in Focus and Plan: `i` opens at the start of the line,
  // `A` appends at the end. Parent titles are `A`-only here — `i` on a parent
  // means "go type", which in this pane is the capture input.
  type EditAt = 'start' | 'end';
  const cursorFor = (text: string, at: EditAt) => (at === 'start' ? 0 : text.length);

  const startEditTitle = () => {
    const task = getSelectedTask();
    if (!task) return;
    setEditing({ id: task.id, type: 'title', text: task.title, cursor: task.title.length });
  };

  const startEditCategory = () => {
    const task = getSelectedTask();
    if (!task) return;
    const current = task.categories?.[0] ?? '';
    setEditing({ id: task.id, type: 'category', text: current, cursor: current.length });
  };

  // `e` for description, same binding as Focus mode — capture's `-d` flag can
  // only set one at creation time, so this is the way to add one afterwards.
  const startEditDescription = () => {
    const task = getSelectedTask();
    if (!task) return;
    const current = task.description ?? '';
    setEditing({ id: task.id, type: 'description', text: current, cursor: current.length });
  };

  const saveEdit = () => {
    if (!editing) return;

    if (editing.type === 'subtask-create') {
      const next = editing.text.trim();
      if (next) {
        const parentId = editing.id;
        const scope: TaskScope = scopeFilter !== 'all' ? scopeFilter : 'personal';
        store.add({
          title: next,
          scope,
          parent_id: parentId,
          session_id: currentSessionId,
          created_by: 'human',
        }).then((task) => {
          undoStack.push({ undo: async () => { await store.remove(task.id); } });
          localReload();
        });
      }
      setEditing(null);
      return;
    }

    if (editing.type === 'subtask-title') {
      const sub = allTasks.find(t => t.id === editing.id);
      if (!sub) { setEditing(null); return; }
      const next = editing.text.trim();
      if (next && next !== sub.title) {
        const prev = sub.title;
        const id = sub.id;
        store.update(id, { title: next }).then(() => {
          undoStack.push({ undo: async () => { await store.update(id, { title: prev }); } });
          localReload();
        });
      }
      setEditing(null);
      return;
    }

    const task = filteredParents.find(t => t.id === editing.id);
    if (!task) { setEditing(null); return; }

    if (editing.type === 'title') {
      const next = editing.text.trim();
      if (next && next !== task.title) {
        const prev = task.title;
        const id = task.id;
        store.update(id, { title: next }).then(() => {
          undoStack.push({ undo: async () => { await store.update(id, { title: prev }); } });
          localReload();
        });
      }
    } else if (editing.type === 'category') {
      const next = editing.text.trim();
      const prev = task.categories ?? [];
      const nextCats = next ? [next] : [];
      if (JSON.stringify(prev) !== JSON.stringify(nextCats)) {
        const id = task.id;
        store.update(id, { categories: nextCats }).then(() => {
          undoStack.push({ undo: async () => { await store.update(id, { categories: prev }); } });
          localReload();
        });
      }
    } else if (editing.type === 'description') {
      // Empty clears it — same convention as Focus mode's `e`.
      const next = editing.text.trim() === '' ? null : editing.text;
      const prev = task.description ?? null;
      if (next !== prev) {
        const id = task.id;
        store.update(id, { description: next }).then(() => {
          undoStack.push({ undo: async () => { await store.update(id, { description: prev }); } });
          localReload();
        });
      }
    }
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  const acceptEditCategoryGhost = () => {
    if (!editing || editing.type !== 'category' || !reviewCategoryAssist) return;
    // Replace what was typed with the stored category outright. Rebuilding it
    // as `editing.text + ghost` kept the user's casing for the typed prefix,
    // so "house" + " Work" saved a second category "house Work" alongside the
    // real "House Work" — see CategoryEditAssist.topMatch.
    const canonical = reviewCategoryAssist.topMatch ?? reviewCategoryAssist.didYouMean;
    if (!canonical) return;
    setEditing({ ...editing, text: canonical, cursor: canonical.length });
  };

  const currentSubtasks = useMemo(() => {
    if (!cursorId) return [];
    return subtaskMap.get(cursorId) ?? [];
  }, [cursorId, subtaskMap]);

  const moveParentCursor = (delta: number) => {
    if (orderedIds.length === 0) return;
    const idx = cursorId ? orderedIds.indexOf(cursorId) : 0;
    const next = Math.max(0, Math.min(orderedIds.length - 1, idx + delta));
    setCursorId(orderedIds[next]);
    setNavTarget('tasks');
    setSubtaskIndex(0);
  };

  const jumpCursor = (to: 'top' | 'bottom') => {
    if (navTarget === 'subtasks') {
      if (currentSubtasks.length === 0) return;
      setSubtaskIndex(to === 'top' ? 0 : currentSubtasks.length - 1);
      return;
    }
    if (orderedIds.length === 0) return;
    setCursorId(orderedIds[to === 'top' ? 0 : orderedIds.length - 1]);
    setSubtaskIndex(0);
  };

  const moveSubtaskCursor = (delta: number) => {
    if (currentSubtasks.length === 0) return;
    const next = Math.max(0, Math.min(currentSubtasks.length - 1, subtaskIndex + delta));
    setSubtaskIndex(next);
  };

  const getSelectedSubtask = (): Task | null => {
    if (navTarget !== 'subtasks') return null;
    return currentSubtasks[subtaskIndex] ?? null;
  };

  const updateSelected = (changes: TaskChanges) => {
    const task = getSelectedTask();
    if (!task) return;
    const prev: Partial<Task> = {};
    const taskRecord = task as unknown as Record<string, unknown>;
    const prevRecord = prev as Record<string, unknown>;
    for (const k of Object.keys(changes)) {
      prevRecord[k] = taskRecord[k];
    }
    const id = task.id;
    store.update(id, changes).then(() => {
      undoStack.push({ undo: async () => { await store.update(id, prev as typeof changes); } });
      localReload();
    });
  };

  // dd = cut-and-hold (parity with Focus/Plan): the task is removed but the
  // operation isn't final until paste (move) or Esc (confirmed delete). One
  // undo entry per resolved operation — never one on cut itself, which is
  // what made double-undo duplicate tasks in the other modes.
  const cutSelected = () => {
    const target = navTarget === 'subtasks' ? getSelectedSubtask() : getSelectedTask();
    if (!target) return;
    store.remove(target.id).then(({ index }) => {
      setClipboard({ task: target, index });
      setVimMode?.('holding');
      onHoldingChange?.(target.title);
      if (navTarget === 'subtasks') {
        const remaining = Math.max(0, currentSubtasks.length - 2);
        if (subtaskIndex > remaining) setSubtaskIndex(remaining);
      }
      localReload();
    });
  };

  const confirmCutDelete = () => {
    if (!clipboard) return;
    const { task, index } = clipboard;
    undoStack.push({ undo: async () => { await store.insertAt(task, index); } });
    setClipboard(null);
    setVimMode?.('normal');
    onHoldingChange?.(undefined);
  };

  const pasteClipboard = (above: boolean) => {
    if (!clipboard) return;
    store.load().then((allTasks) => {
      let targetIndex: number;
      const anchor = navTarget === 'subtasks'
        ? (getSelectedSubtask() ?? getSelectedTask())
        : getSelectedTask();
      if (anchor) {
        targetIndex = allTasks.findIndex(t => t.id === anchor.id);
        if (!above) targetIndex += 1;
      } else {
        targetIndex = allTasks.length;
      }

      const origClipboard = clipboard;
      const taskToInsert = { ...clipboard.task };
      // Pasting in subtask nav re-parents under the selected task; pasting
      // in parent nav promotes to top level (same rules as Focus mode).
      taskToInsert.parent_id = navTarget === 'subtasks' && cursorId ? cursorId : null;

      store.insertAt(taskToInsert, targetIndex).then(() => {
        undoStack.push({
          undo: async () => {
            await store.remove(taskToInsert.id);
            await store.insertAt(origClipboard.task, origClipboard.index);
          },
        });
        setClipboard(null);
        setVimMode?.('normal');
        onHoldingChange?.(undefined);
        localReload();
      });
    });
  };

  const startEditSubtaskTitle = (at: EditAt) => {
    const sub = getSelectedSubtask();
    if (!sub) return;
    setEditing({ id: sub.id, type: 'subtask-title', text: sub.title, cursor: cursorFor(sub.title, at) });
  };

  const startCreateSubtask = () => {
    if (!cursorId) return;
    setNavTarget('subtasks');
    setEditing({ id: cursorId, type: 'subtask-create', text: '', cursor: 0 });
  };

  const handleTab = () => {
    if (!cursorId) return;
    if (navTarget === 'tasks') {
      if (currentSubtasks.length === 0) {
        startCreateSubtask();
      } else {
        setNavTarget('subtasks');
        setSubtaskIndex(0);
      }
    } else {
      setNavTarget('tasks');
    }
  };

  const clearKeyBuffer = () => {
    keyBufferRef.current = '';
    if (keyBufferTimerRef.current) {
      clearTimeout(keyBufferTimerRef.current);
      keyBufferTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    if (keyBufferTimerRef.current) clearTimeout(keyBufferTimerRef.current);
  }, []);

  useInput((input, key) => {
    // --- Editing an inline field (title or category) ---
    if (editing) {
      if (key.escape) { cancelEdit(); return; }
      if (key.return) { saveEdit(); return; }
      if (key.tab && editing.type === 'category') { acceptEditCategoryGhost(); return; }
      const editMove = cursorMoveFor(input, key);
      if (editMove) {
        setEditing(prev => prev ? { ...prev, ...moveCursor(prev, editMove) } : prev);
        return;
      }
      if (key.backspace || key.delete) {
        setEditing(prev => prev ? { ...prev, ...deleteBack(prev) } : prev);
        return;
      }
      if (isPrintable(input, key)) {
        setEditing(prev => prev ? { ...prev, ...insertChar(prev, input) } : prev);
      }
      return;
    }

    // --- Holding a cut task: nav + paste + confirm only ---
    if (clipboard) {
      if (input === 'j' || key.downArrow) {
        if (navTarget === 'subtasks') moveSubtaskCursor(1);
        else moveParentCursor(1);
        return;
      }
      if (input === 'k' || key.upArrow) {
        if (navTarget === 'subtasks') moveSubtaskCursor(-1);
        else moveParentCursor(-1);
        return;
      }
      if (input === 'p') { pasteClipboard(false); return; }
      if (input === 'P') { pasteClipboard(true); return; }
      if (key.escape) { confirmCutDelete(); return; }
      return;
    }

    // --- Capture sub-mode ---
    if (subMode === 'capture') {
      if (key.escape) {
        if (orderedIds.length > 0) {
          changeSubMode('review');
          if (!cursorId) setCursorId(orderedIds[0]);
          setNavTarget('tasks');
        } else {
          onModeChange('focus');
        }
        return;
      }
      if (input === '~') { onCycleScope(); return; }
      if (key.tab) { acceptCategoryGhost(); return; }
      if (key.return) { submitCapture(); return; }
      const move = cursorMoveFor(input, key);
      if (move) { setCapture(prev => moveCursor(prev, move)); return; }
      if (key.backspace || key.delete) {
        setCapture(prev => deleteBack(prev));
        return;
      }
      if (isPrintable(input, key)) {
        setCapture(prev => insertChar(prev, input));
      }
      return;
    }

    // --- Review sub-mode ---
    const buffer = keyBufferRef.current;

    if (buffer === 'd' && input === 'd') {
      clearKeyBuffer();
      cutSelected();
      return;
    }
    if (buffer === 'g' && input === 'g') {
      clearKeyBuffer();
      jumpCursor('top');
      return;
    }
    if (buffer) clearKeyBuffer();

    if (input === 'G') { jumpCursor('bottom'); return; }

    // `c` opens the category editor immediately. It used to wait out the
    // sequence timeout in case a second `c` was coming; with `cc` gone
    // there's nothing to disambiguate.
    if (input === 'c') {
      if (navTarget === 'tasks') startEditCategory();
      return;
    }

    if (input === 'd' || input === 'g') {
      keyBufferRef.current = input;
      keyBufferTimerRef.current = setTimeout(() => {
        keyBufferRef.current = '';
        keyBufferTimerRef.current = null;
      }, SEQ_TIMEOUT);
      return;
    }

    if (key.escape) { onModeChange('focus'); return; }
    if (key.tab) { handleTab(); return; }
    if (input === 'w') { changeSubMode('capture'); return; }
    if (input === 'i') {
      if (navTarget === 'subtasks') { startEditSubtaskTitle('start'); return; }
      // On a parent task `i` means "go type" — capture is this pane's input.
      changeSubMode('capture');
      return;
    }
    // A: opens the title editor at the end of the line, matching Focus and Plan.
    if (input === 'A') {
      if (navTarget === 'subtasks') startEditSubtaskTitle('end');
      else startEditTitle();
      return;
    }
    if (input === 'j' || key.downArrow) {
      if (navTarget === 'subtasks') moveSubtaskCursor(1);
      else moveParentCursor(1);
      return;
    }
    if (input === 'k' || key.upArrow) {
      if (navTarget === 'subtasks') moveSubtaskCursor(-1);
      else moveParentCursor(-1);
      return;
    }
    // Capital P — priority. Lowercase p is reserved for paste (holding mode),
    // matching Focus/Plan.
    if (input === 'P' && navTarget === 'tasks') {
      const task = getSelectedTask();
      if (task) updateSelected({ priority: cyclePriority(task.priority) });
      return;
    }
    // Space — toggle focused, same as Plan mode. (Was `f`, which shadowed
    // the global switch-to-Focus key; see docs/controls-audit.md.)
    if (input === ' ' && navTarget === 'tasks') {
      const task = getSelectedTask();
      if (task) updateSelected({ focused: !task.focused });
      return;
    }
    if (input === 'e' && navTarget === 'tasks') { startEditDescription(); return; }
    if (input === 'u') {
      undoStack.pop().then((didUndo) => { if (didUndo) localReload(); });
      return;
    }
    if (input === 'T') { setTimeFilter(cycleTimeFilter(timeFilter)); return; }
    if (input === '~') { onCycleScope(); return; }
  });

  // Budget for EntryList height.
  // Reserved: Header(3) + Footer(4) + top pad/chip/pad(3).
  // Capture pane (when visible) ≈ 2 base rows + up to 3 optional rows + 2 padding.
  const capturePaneRows = subMode === 'capture'
    ? 2 /* padding */
      + 2 /* prompt + preview/help */
      + (categoryMatch.active && categoryMatch.list.length > 1 ? 1 : 0)
      + (categoryMatch.active && categoryMatch.didYouMean ? 1 : 0)
      + (anchorTitle ? 1 : 0)
    : 0;
  const entryListMaxRows = Math.max(3, termHeight - 10 - capturePaneRows);

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="space-between">
      <Box flexDirection="column">
        <Text> </Text>
        <Box>
          <TimeFilterChip active={timeFilter} />
          <SubModeChip active={subMode} />
        </Box>
        <Text> </Text>
        <EntryList
          tasks={filteredParents}
          subtaskMap={subtaskMap}
          config={config}
          cursorId={cursorId}
          subtaskCursorId={navTarget === 'subtasks' ? getSelectedSubtask()?.id ?? null : null}
          editing={editing ?? undefined}
          categoryAssist={reviewCategoryAssist}
          currentSessionId={currentSessionId}
          emptyMessage={timeFilter === 'today' ? 'Nothing captured today yet.' : 'No tasks.'}
          maxRows={entryListMaxRows}
          cursorTone={subMode === 'capture' ? 'magenta' : 'cyan'}
          captureAnchor={captureAnchor}
          showScope={scopeFilter === 'all'}
        />
      </Box>

      {subMode === 'capture' && (
        <Box flexDirection="column">
          <Text> </Text>
          <CapturePane
            inputText={inputText}
            cursor={capture.cursor}
            categoryMatch={categoryMatch}
            preview={preview}
            lastCreatedTitle={anchorTitle}
            isSubtaskInput={isSubtaskInput}
          />
          <Text> </Text>
        </Box>
      )}
    </Box>
  );
}
