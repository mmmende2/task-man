import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Task, TaskPriority, TaskScope } from '../../types.js';
import type { TaskStore } from '../../store.js';
import type { AppMode, WriteSubMode } from '../types.js';
import type { VimMode } from '../hooks/useVimKeys.js';
import { useUndoStack } from '../hooks/useUndoStack.js';
import { useTerminalHeight } from '../hooks/useTerminalWidth.js';
import { loadConfig } from '../../config.js';
import { getCurrentSessionId } from '../../sessions.js';
import {
  useCategoryMatch,
  getAllCategories,
  suggestPrefix,
  suggestFuzzy,
} from '../hooks/useCategoryMatch.js';
import { EntryList, orderedTaskIds, type EntryListEditing, type CategoryEditAssist, type CaptureAnchor } from './write/EntryList.js';
import { CapturePane } from './write/CapturePane.js';

export type TimeFilter = 'session' | 'today' | 'all';

interface Props {
  store: TaskStore;
  tasks?: Task[];
  reload: () => void;
  scopeFilter: TaskScope | 'all';
  onModeChange: (mode: AppMode) => void;
  onCycleScope: () => void;
  vimMode?: VimMode;
  setVimMode?: (mode: VimMode) => void;
  subMode?: WriteSubMode;
  onSubModeChange?: (sub: WriteSubMode) => void;
}

interface ParsedInput {
  title: string;
  priority: TaskPriority;
  categories: string[];
  scope: TaskScope | null;
  description: string | null;
  focused: boolean;
}

const PRIORITY_MAP: Record<string, TaskPriority> = {
  l: 'low', low: 'low',
  m: 'medium', medium: 'medium', med: 'medium',
  h: 'high', high: 'high',
  u: 'high', urgent: 'high',
};

const SCOPE_MAP: Record<string, TaskScope> = {
  per: 'personal', personal: 'personal',
  pro: 'professional', professional: 'professional',
};

function parseWriteInput(raw: string): ParsedInput {
  const result: ParsedInput = {
    title: '',
    priority: 'medium',
    categories: [],
    scope: null,
    description: null,
    focused: false,
  };

  const flagPattern = /\s+-[pcdsf]\b/;
  const firstFlagMatch = raw.match(flagPattern);

  if (!firstFlagMatch || firstFlagMatch.index === undefined) {
    const dashIdx = raw.lastIndexOf(' - ');
    if (dashIdx > 0) {
      result.title = raw.slice(0, dashIdx).trim();
      result.categories = [raw.slice(dashIdx + 3).trim()];
    } else {
      result.title = raw.trim();
    }
    return result;
  }

  result.title = raw.slice(0, firstFlagMatch.index).trim();
  const flagStr = raw.slice(firstFlagMatch.index);
  const tokens = flagStr.trim().split(/\s+/);

  const consumeQuoted = (startIdx: number): { value: string; nextIdx: number } => {
    const first = tokens[startIdx];
    if (first.startsWith('"') && !(first.endsWith('"') && first.length > 1)) {
      const acc: string[] = [first];
      let j = startIdx + 1;
      while (j < tokens.length) {
        acc.push(tokens[j]);
        if (tokens[j].endsWith('"')) break;
        j++;
      }
      return { value: acc.join(' ').replace(/^"|"$/g, ''), nextIdx: j + 1 };
    }
    return { value: first.replace(/^"|"$/g, ''), nextIdx: startIdx + 1 };
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '-p' && i + 1 < tokens.length) {
      const val = PRIORITY_MAP[tokens[i + 1].toLowerCase()];
      if (val) result.priority = val;
      i += 2;
    } else if (token === '-c' && i + 1 < tokens.length) {
      const { value, nextIdx } = consumeQuoted(i + 1);
      if (value.length > 0) result.categories.push(value);
      i = nextIdx;
    } else if (token === '-s' && i + 1 < tokens.length) {
      const val = SCOPE_MAP[tokens[i + 1].toLowerCase()];
      if (val) result.scope = val;
      i += 2;
    } else if (token === '-d' && i + 1 < tokens.length) {
      const { value, nextIdx } = consumeQuoted(i + 1);
      result.description = value;
      i = nextIdx;
    } else if (token === '-f') {
      result.focused = true;
      i += 1;
    } else {
      i += 1;
    }
  }

  return result;
}

function formatPreview(parsed: ParsedInput, isSubtask: boolean): string {
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

function toggleScope(s: TaskScope): TaskScope {
  return s === 'personal' ? 'professional' : 'personal';
}

function cycleTimeFilter(f: TimeFilter): TimeFilter {
  return f === 'session' ? 'today' : f === 'today' ? 'all' : 'session';
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
      {opt('session', 'session')}
      <Text dimColor>{' · '}</Text>
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

  const [inputText, setInputText] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('session');
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [navTarget, setNavTarget] = useState<'tasks' | 'subtasks'>('tasks');
  const [subtaskIndex, setSubtaskIndex] = useState(0);
  const [editing, setEditing] = useState<EntryListEditing | null>(null);
  const [tick, setTick] = useState(0);

  const keyBufferRef = useRef('');
  const keyBufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const undoStack = useUndoStack();
  const termHeight = useTerminalHeight();

  const config = useMemo(() => loadConfig(), []);
  const currentSessionId = useMemo(() => getCurrentSessionId(), []);

  const allTasks = useMemo(() => tasksProp ?? store.load(), [tasksProp, store, tick]);

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

  const today = new Date().toISOString().slice(0, 10);
  const filteredParents = useMemo(() => {
    let list = parents;
    if (scopeFilter !== 'all') list = list.filter(t => t.scope === scopeFilter);
    if (timeFilter === 'session') {
      list = list.filter(t => t.session_id === currentSessionId);
    } else if (timeFilter === 'today') {
      list = list.filter(t => t.created_at.startsWith(today));
    } else {
      list = list.filter(t => t.status !== 'done').slice(0, 100);
    }
    return list;
  }, [parents, scopeFilter, timeFilter, currentSessionId, today]);

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
      previewText: isSubtaskInput ? (liveParsed?.title ?? '') : '',
    };
  }, [subMode, cursorId, isSubtaskInput, liveParsed]);

  const categoriesList = useMemo(() => getAllCategories(allTasks), [allTasks]);
  const reviewCategoryAssist: CategoryEditAssist | null = useMemo(() => {
    if (editing?.type !== 'category') return null;
    const partial = editing.text;
    if (!partial) return { ghost: null, list: [], didYouMean: null };
    const { top, list } = suggestPrefix(partial, categoriesList);
    if (top) {
      return {
        ghost: top.name.length > partial.length ? top.name.slice(partial.length) : null,
        list: list.map(c => c.name),
        didYouMean: null,
      };
    }
    const fuzzy = suggestFuzzy(partial, categoriesList);
    return { ghost: null, list: [], didYouMean: fuzzy?.name ?? null };
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
    }
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  const acceptEditCategoryGhost = () => {
    if (!editing || editing.type !== 'category' || !reviewCategoryAssist) return;
    const canonical = (() => {
      if (reviewCategoryAssist.ghost) return editing.text + reviewCategoryAssist.ghost;
      return reviewCategoryAssist.didYouMean;
    })();
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

  const updateSelected = (changes: Parameters<TaskStore['update']>[1]) => {
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

  const deleteSelected = () => {
    const target = navTarget === 'subtasks' ? getSelectedSubtask() : getSelectedTask();
    if (!target) return;
    store.remove(target.id).then(({ index }) => {
      undoStack.push({ undo: async () => { await store.insertAt(target, index); } });
      if (navTarget === 'subtasks') {
        const remaining = Math.max(0, currentSubtasks.length - 2);
        if (subtaskIndex > remaining) setSubtaskIndex(remaining);
      }
      localReload();
    });
  };

  const startEditSubtaskTitle = () => {
    const sub = getSelectedSubtask();
    if (!sub) return;
    setEditing({ id: sub.id, type: 'subtask-title', text: sub.title, cursor: sub.title.length });
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
      if (key.backspace || key.delete) {
        setEditing(prev => {
          if (!prev) return prev;
          if (prev.cursor <= 0) return prev;
          return {
            ...prev,
            text: prev.text.slice(0, prev.cursor - 1) + prev.text.slice(prev.cursor),
            cursor: prev.cursor - 1,
          };
        });
        return;
      }
      if (!key.ctrl && !key.meta && input && input.length === 1) {
        setEditing(prev => prev ? {
          ...prev,
          text: prev.text.slice(0, prev.cursor) + input + prev.text.slice(prev.cursor),
          cursor: prev.cursor + 1,
        } : prev);
      }
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
      if (key.backspace || key.delete) {
        setInputText(prev => prev.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && input && input.length === 1) {
        setInputText(prev => prev + input);
      }
      return;
    }

    // --- Review sub-mode ---
    const buffer = keyBufferRef.current;

    if (buffer === 'c' && input === 'c') {
      clearKeyBuffer();
      if (navTarget === 'subtasks') startEditSubtaskTitle();
      else startEditTitle();
      return;
    }
    if (buffer === 'd' && input === 'd') {
      clearKeyBuffer();
      deleteSelected();
      return;
    }
    if (buffer === 'g' && input === 'g') {
      clearKeyBuffer();
      jumpCursor('top');
      return;
    }
    if (buffer) clearKeyBuffer();

    if (input === 'G') { jumpCursor('bottom'); return; }

    if (input === 'c' || input === 'd' || input === 'g') {
      keyBufferRef.current = input;
      keyBufferTimerRef.current = setTimeout(() => {
        const pending = keyBufferRef.current;
        keyBufferRef.current = '';
        keyBufferTimerRef.current = null;
        if (pending === 'c' && navTarget === 'tasks') startEditCategory();
      }, SEQ_TIMEOUT);
      return;
    }

    if (key.escape) { onModeChange('focus'); return; }
    if (key.tab) { handleTab(); return; }
    if (input === 'w') { changeSubMode('capture'); return; }
    if (input === 'i') {
      if (navTarget === 'subtasks') { startEditSubtaskTitle(); return; }
      changeSubMode('capture');
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
    if (input === 'p' && navTarget === 'tasks') {
      const task = getSelectedTask();
      if (task) updateSelected({ priority: cyclePriority(task.priority) });
      return;
    }
    if (input === 's' && navTarget === 'tasks') {
      const task = getSelectedTask();
      if (task) updateSelected({ scope: toggleScope(task.scope) });
      return;
    }
    if (input === 'f' && navTarget === 'tasks') {
      const task = getSelectedTask();
      if (task) updateSelected({ focused: !task.focused });
      return;
    }
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
          emptyMessage={timeFilter === 'session' ? 'No tasks in this session yet.' : 'No tasks.'}
          maxRows={entryListMaxRows}
          cursorTone={subMode === 'capture' ? 'magenta' : 'cyan'}
          captureAnchor={captureAnchor}
        />
      </Box>

      {subMode === 'capture' && (
        <Box flexDirection="column">
          <Text> </Text>
          <CapturePane
            inputText={inputText}
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
