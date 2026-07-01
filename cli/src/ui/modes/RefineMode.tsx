import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Task, TaskPriority, TaskScope, TimeEstimate, Vibe } from '../../types.js';
import type { Store } from '../../store-interface.js';
import type { AppMode } from '../types.js';
import { loadConfig } from '../../config.js';
import { buildRefineQueue } from '../../refine-queue.js';
import { usePulse, CYAN_PULSE } from '../hooks/usePulse.js';
import { RefineQuestion, type QuestionDef } from './RefineQuestion.js';

interface Props {
  store: Store;
  reload: () => void;
  onExit: (target: AppMode) => void;
  previousMode: AppMode;
}

interface UndoSnapshot {
  taskId: string;
  changes: Partial<Task>;
}

type Phase = 'asking' | 'between' | 'complete' | 'empty';

const MAX_QUESTIONS_PER_TASK = 3;
const FLASH_MS = 400;
const BETWEEN_MS = 150;
const COMPLETE_MS = 1500;

const COMMON_TYPOS: [RegExp, string][] = [
  [/\bteh\b/gi, 'the'],
  [/\brecieve\b/gi, 'receive'],
  [/\bUdpate\b/g, 'Update'],
  [/\budpate\b/g, 'update'],
  [/\badress\b/gi, 'address'],
  [/\bfreind\b/gi, 'friend'],
  [/\bocurr/gi, 'occurr'],
  [/\bseperate\b/gi, 'separate'],
  [/\bdefinately\b/gi, 'definitely'],
];

function suggestTitleFix(title: string): string | null {
  let fixed = title;

  // Trailing/leading space
  const trimmed = fixed.trim();
  if (trimmed !== fixed) fixed = trimmed;

  // All-caps (longer than one word)
  if (fixed.length > 3 && fixed === fixed.toUpperCase() && /[A-Z]/.test(fixed)) {
    fixed = fixed.charAt(0) + fixed.slice(1).toLowerCase();
  }

  // Common transpositions
  for (const [pattern, replacement] of COMMON_TYPOS) {
    fixed = fixed.replace(pattern, replacement);
  }

  return fixed !== title ? fixed : null;
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function buildQuestions(
  task: Task,
  allTasks: Task[],
  currentFocusedCount: number,
  maxFocused: number | null,
  knownCategories: string[],
): QuestionDef[] {
  const list: QuestionDef[] = [];

  // 1. Spelling/title correction
  const suggestion = suggestTitleFix(task.title);
  if (suggestion) {
    list.push({
      type: 'correction',
      prompt: 'Quick fix — does this look right?',
      original: task.title,
      suggestion,
    });
  }

  // 2. Missing scope
  if (!task.scope) {
    list.push({
      type: 'number',
      prompt: 'Work thing or personal thing?',
      options: [
        { label: 'personal', value: 'personal' },
        { label: 'professional', value: 'professional' },
        { label: 'skip', value: '__skip' },
      ],
    });
  }

  // 2b. Missing time estimate
  if (task.time_estimate == null) {
    list.push({
      type: 'number',
      prompt: 'How long will this take?',
      options: [
        { label: '<5m', value: '<5m' },
        { label: '20m', value: '20m' },
        { label: '45m', value: '45m' },
        { label: '>1h', value: '>1h' },
        { label: '>3h', value: '>3h' },
      ],
    });
  }

  // 2c. Missing vibe
  if (task.vibe == null) {
    list.push({
      type: 'number',
      prompt: 'Vibe check?',
      options: [
        { label: 'love', value: 'love' },
        { label: 'ok', value: 'ok' },
        { label: 'dread', value: 'dread' },
      ],
    });
  }

  // 3. Priority review
  const stale = task.status === 'todo' && daysSince(task.created_at) > 7 && task.priority !== 'high';
  if (task.created_by === 'claude' || stale) {
    list.push({
      type: 'list',
      prompt: 'How urgent is this, really?',
      options: [
        { label: 'high', value: 'high' },
        { label: 'medium', value: 'medium' },
        { label: 'low', value: 'low' },
      ],
    });
  }

  // 4. Focus nomination
  const focusCap = maxFocused ?? Infinity;
  if (!task.focused && currentFocusedCount < focusCap) {
    list.push({
      type: 'yesno',
      prompt: 'Pull this into tomorrow\'s focus?',
    });
  }

  // 5. AI task review — skip if user has already set any metadata on this task,
  // or if it has subtasks (a parent with children is clearly relevant).
  const hasEngagement =
    task.scope != null ||
    task.time_estimate != null ||
    task.vibe != null ||
    task.categories.length > 0 ||
    task.focused ||
    allTasks.some(t => t.parent_id === task.id);

  if (task.created_by === 'claude' && !task.description && !hasEngagement) {
    list.push({
      type: 'confirm',
      prompt: 'Claude added this — does it belong?',
    });
  }

  // 6. Category assignment
  if (task.categories.length === 0 && knownCategories.length > 0) {
    const options = knownCategories.slice(0, 5).map(c => ({ label: c, value: c }));
    options.push({ label: 'skip', value: '__skip' });
    list.push({
      type: 'number',
      prompt: 'File this under...?',
      options,
    });
  }

  return list.slice(0, MAX_QUESTIONS_PER_TASK);
}

export function RefineMode({ store, reload, onExit, previousMode }: Props) {
  const pulseColor = usePulse({ colors: CYAN_PULSE, intervalMs: 350 });

  const config = useMemo(() => loadConfig(), []);

  const [queue, setQueue] = useState<Task[]>([]);
  const [taskIndex, setTaskIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('asking');
  const [reviewedCount, setReviewedCount] = useState(0);

  const [listCursor, setListCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editCursor, setEditCursor] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<UndoSnapshot | null>(null);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
  }, []);

  const currentTask: Task | undefined = queue[taskIndex];

  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  useEffect(() => {
    store.load().then((tasks) => {
      setAllTasks(tasks);
      setTasksLoaded(true);
    });
  }, [store, reviewedCount]);

  // Seed the queue once, from the first load — later reloads (triggered by
  // reviewedCount) refresh allTasks/focusedCount context but must not reset
  // the in-progress queue.
  const queueInitialized = useRef(false);
  useEffect(() => {
    if (queueInitialized.current || !tasksLoaded) return;
    queueInitialized.current = true;
    const initialQueue = buildRefineQueue(allTasks);
    setQueue(initialQueue);
    setPhase(initialQueue.length === 0 ? 'empty' : 'asking');
  }, [tasksLoaded, allTasks]);

  const knownCategories = useMemo(() => {
    const set = new Set<string>();
    for (const t of allTasks) {
      for (const c of t.categories) set.add(c);
    }
    return Array.from(set);
  }, [allTasks]);

  const focusedCount = useMemo(() =>
    allTasks.filter(t => t.focused && t.status !== 'done').length,
  [allTasks]);

  const questions = useMemo<QuestionDef[]>(() => {
    if (!currentTask) return [];
    return buildQuestions(currentTask, allTasks, focusedCount, config.focus.maxFocused, knownCategories);
  }, [currentTask, allTasks, focusedCount, config.focus.maxFocused, knownCategories]);

  const currentQuestion = questions[questionIndex];

  // If current task has no applicable questions, advance silently
  useEffect(() => {
    if (phase !== 'asking') return;
    if (!currentTask) return;
    if (questions.length === 0) {
      advanceTask();
    } else if (questionIndex >= questions.length) {
      advanceTask();
    }
  }, [phase, currentTask?.id, questions.length, questionIndex]);

  const flashAndAdvance = useCallback((label: string) => {
    setFlash(label);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlash(null);
      setQuestionIndex(i => i + 1);
    }, FLASH_MS);
  }, []);

  const advanceTask = useCallback(() => {
    setReviewedCount(c => c + 1);
    setQuestionIndex(0);
    setListCursor(0);
    setEditing(false);
    setLastAction(null);
    setPhase('between');
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionTimer.current = setTimeout(() => {
      setTaskIndex(i => {
        const next = i + 1;
        if (next >= queue.length) {
          setPhase('complete');
          if (transitionTimer.current) clearTimeout(transitionTimer.current);
          transitionTimer.current = setTimeout(() => onExit(previousMode), COMPLETE_MS);
        } else {
          setPhase('asking');
        }
        return next;
      });
    }, BETWEEN_MS);
  }, [queue.length, onExit, previousMode]);

  const applyChange = useCallback(async (changes: Partial<Task>, flashLabel: string) => {
    if (!currentTask) return;
    const prev: Partial<Task> = {};
    for (const key of Object.keys(changes) as (keyof Task)[]) {
      (prev as Record<string, unknown>)[key] = currentTask[key];
    }
    setLastAction({ taskId: currentTask.id, changes: prev });
    await store.update(currentTask.id, changes as Parameters<typeof store.update>[1]);
    // Update local queue so subsequent question gating sees fresh state
    setQueue(q => q.map(t => t.id === currentTask.id ? { ...t, ...changes } as Task : t));
    reload();
    flashAndAdvance(flashLabel);
  }, [currentTask, store, reload, flashAndAdvance]);

  const skipQuestion = useCallback(() => {
    setLastAction(null);
    flashAndAdvance('skipped');
  }, [flashAndAdvance]);

  const skipTask = useCallback(() => {
    setLastAction(null);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(null);
    advanceTask();
  }, [advanceTask]);

  const undoLast = useCallback(async () => {
    if (!lastAction) return;
    await store.update(lastAction.taskId, lastAction.changes as Parameters<typeof store.update>[1]);
    setQueue(q => q.map(t => t.id === lastAction.taskId ? { ...t, ...lastAction.changes } as Task : t));
    setLastAction(null);
    reload();
    setFlash('undone');
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  }, [lastAction, store, reload]);

  useInput((input, key) => {
    if (phase === 'complete') {
      onExit(previousMode);
      return;
    }
    if (phase === 'empty') {
      if (key.escape || input === 'q') onExit(previousMode);
      return;
    }
    if (phase === 'between' || flash) return;
    if (!currentQuestion) return;

    // Editing mode (correction type)
    if (editing) {
      if (key.escape) {
        setEditing(false);
      } else if (key.return) {
        applyChange({ title: editText.trim() || currentTask!.title }, 'edited');
        setEditing(false);
      } else if (key.backspace || key.delete) {
        setEditText(t => {
          if (editCursor <= 0) return t;
          setEditCursor(c => c - 1);
          return t.slice(0, editCursor - 1) + t.slice(editCursor);
        });
      } else if (input && !key.ctrl && !key.meta && input.length === 1) {
        setEditText(t => t.slice(0, editCursor) + input + t.slice(editCursor));
        setEditCursor(c => c + 1);
      }
      return;
    }

    if (key.escape || input === 'q') {
      onExit(previousMode);
      return;
    }
    if (input === 'u') {
      undoLast();
      return;
    }
    if (input === 'S') {
      skipTask();
      return;
    }
    if (input === 's') {
      skipQuestion();
      return;
    }

    switch (currentQuestion.type) {
      case 'yesno': {
        if (input === 'y' || input === 't') {
          applyChange({ focused: true }, 'focused');
        } else if (input === 'n' || input === 'f') {
          skipQuestion();
        }
        break;
      }

      case 'confirm': {
        if (input === 'y') {
          flashAndAdvance('kept');
        } else if (input === 'd') {
          if (!currentTask) return;
          store.remove(currentTask.id).then(() => {
            reload();
            setLastAction(null);
            setFlash('deleted');
            if (flashTimer.current) clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => {
              setFlash(null);
              advanceTask();
            }, FLASH_MS);
          });
        } else if (input === 'e') {
          setEditText(currentTask?.title ?? '');
          setEditCursor(currentTask?.title.length ?? 0);
          setEditing(true);
        }
        break;
      }

      case 'list': {
        if (!currentQuestion.options) return;
        if (key.downArrow || input === 'j') {
          setListCursor(c => Math.min(c + 1, currentQuestion.options!.length - 1));
        } else if (key.upArrow || input === 'k') {
          setListCursor(c => Math.max(c - 1, 0));
        } else if (key.return || key.rightArrow) {
          const picked = currentQuestion.options[listCursor];
          if (picked.value === '__skip') {
            skipQuestion();
          } else if (currentQuestion.prompt.startsWith('How urgent')) {
            applyChange({ priority: picked.value as TaskPriority }, `priority: ${picked.value}`);
          }
          setListCursor(0);
        }
        break;
      }

      case 'number': {
        if (!currentQuestion.options) return;
        const n = parseInt(input, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= currentQuestion.options.length) {
          const picked = currentQuestion.options[n - 1];
          if (picked.value === '__skip') {
            skipQuestion();
          } else if (currentQuestion.prompt.startsWith('Work thing')) {
            applyChange({ scope: picked.value as TaskScope }, `scope: ${picked.value}`);
          } else if (currentQuestion.prompt.startsWith('How long')) {
            applyChange({ time_estimate: picked.value as TimeEstimate }, `time: ${picked.value}`);
          } else if (currentQuestion.prompt.startsWith('Vibe check')) {
            applyChange({ vibe: picked.value as Vibe }, `vibe: ${picked.value}`);
          } else if (currentQuestion.prompt.startsWith('File this')) {
            const nextCats = [...(currentTask?.categories ?? []), picked.value];
            applyChange({ categories: nextCats }, `filed: ${picked.value}`);
          }
        }
        break;
      }

      case 'correction': {
        if (input === 'y') {
          applyChange({ title: currentQuestion.suggestion ?? currentTask!.title }, 'fixed');
        } else if (input === 'n') {
          skipQuestion();
        } else if (input === 'e') {
          setEditText(currentQuestion.suggestion ?? currentTask?.title ?? '');
          setEditCursor((currentQuestion.suggestion ?? currentTask?.title ?? '').length);
          setEditing(true);
        }
        break;
      }
    }
  });

  // --- Empty state ---
  if (phase === 'empty') {
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Box borderStyle="double" borderColor={pulseColor} flexDirection="column" paddingX={2}>
          <Text> </Text>
          <Text bold color="cyan">  Nothing needs refine. Clean slate.</Text>
          <Text> </Text>
          <Text dimColor>  [esc] or [q] to exit</Text>
          <Text> </Text>
        </Box>
      </Box>
    );
  }

  // --- Complete state ---
  if (phase === 'complete') {
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Box borderStyle="double" borderColor="cyan" flexDirection="column" paddingX={2}>
          <Text> </Text>
          <Box>
            <Text bold color={pulseColor}>  REFINE COMPLETE  </Text>
            <Text color="greenBright">✓ {reviewedCount} task{reviewedCount === 1 ? '' : 's'} reviewed</Text>
          </Box>
          <Text> </Text>
        </Box>
      </Box>
    );
  }

  // --- Between tasks ---
  if (phase === 'between') {
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Box>
          <Text color={pulseColor}>  → next</Text>
        </Box>
      </Box>
    );
  }

  // --- Asking ---
  if (!currentTask) return null;

  const remaining = queue.length - taskIndex;
  const meta: string[] = [];
  meta.push(`created_by: ${currentTask.created_by}`);
  meta.push(`priority: ${currentTask.priority}`);
  if (currentTask.scope) meta.push(`scope: ${currentTask.scope}`);
  else meta.push('no scope');
  if (currentTask.time_estimate) meta.push(`time: ${currentTask.time_estimate}`);
  if (currentTask.vibe) meta.push(`vibe: ${currentTask.vibe}`);
  if (currentTask.categories.length > 0) meta.push(`cat: ${currentTask.categories.join(',')}`);

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Box borderStyle="double" borderColor={pulseColor} flexDirection="column" paddingX={2}>
        <Box>
          <Text bold color="cyan">REFINE  </Text>
          <Text dimColor>[{remaining} remaining]</Text>
        </Box>
        <Text> </Text>

        <Text bold>{currentTask.title}</Text>
        <Text dimColor>{meta.join('  |  ')}</Text>

        {currentQuestion && (
          <RefineQuestion
            question={currentQuestion}
            listCursor={listCursor}
            editing={editing}
            editText={editText}
            editCursor={editCursor}
            flash={flash ?? undefined}
          />
        )}
      </Box>
    </Box>
  );
}
