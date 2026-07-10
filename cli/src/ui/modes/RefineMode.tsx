import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Task, TaskPriority, TaskScope, TimeEstimate, Vibe } from '../../types.js';
import type { Store } from '../../store-interface.js';
import type { AppMode } from '../types.js';
import { loadConfig } from '../../config.js';
import { buildRefineQueue } from '../../refine-queue.js';
import { filterByScope } from '../../task-filters.js';
import { buildQuestions, deriveCategories, type QuestionDef } from '../../refine-questions.js';
import { usePulse, CYAN_PULSE } from '../hooks/usePulse.js';
import { RefineQuestion } from './RefineQuestion.js';

interface Props {
  store: Store;
  reload: () => void;
  onExit: (target: AppMode) => void;
  previousMode: AppMode;
  /** Active global scope filter. The refine session queues only tasks matching
      it ('all' → no filter). Mirrors the web (Refine.tsx). */
  scopeFilter?: TaskScope | 'all';
}

interface UndoSnapshot {
  taskId: string;
  changes: Partial<Task>;
}

type Phase = 'asking' | 'between' | 'complete' | 'empty';

const FLASH_MS = 400;
const BETWEEN_MS = 150;
const COMPLETE_MS = 1500;

export function RefineMode({ store, reload, onExit, previousMode, scopeFilter = 'all' }: Props) {
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
  // Focus questions shown this session, capped at 2 (queue is priority-sorted,
  // so the highest-priority tasks get the asks). Never reset — one session.
  const focusAsksUsed = useRef(0);

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
  // Scope can't change mid-session: global keys (incl. `~`) are disabled while
  // refining (InteractiveApp guards them), and the queue seeds exactly once
  // via queueInitialized — so there is no rebuild-on-scope-change to handle.
  const queueInitialized = useRef(false);
  useEffect(() => {
    if (queueInitialized.current || !tasksLoaded) return;
    queueInitialized.current = true;
    const scoped = filterByScope(allTasks, scopeFilter === 'all' ? undefined : scopeFilter);
    const initialQueue = buildRefineQueue(scoped);
    setQueue(initialQueue);
    setPhase(initialQueue.length === 0 ? 'empty' : 'asking');
  }, [tasksLoaded, allTasks, scopeFilter]);

  // Latest loaded tasks, read by the freeze effect below so it captures fresh
  // context (category set, focused count) without listing `allTasks` in its
  // deps — which would rebuild the frozen list mid-task on a background reload.
  const allTasksRef = useRef(allTasks);
  useEffect(() => { allTasksRef.current = allTasks; }, [allTasks]);

  // The frozen question list for the current task. Built ONCE when a task
  // becomes current (keyed on task identity) and walked by index — never
  // rebuilt as answers mutate the task. Rebuilding-on-answer would drop the
  // just-answered card and shift the survivors down while the flash timer
  // still bumps questionIndex, skipping the next card. Mirrors the web
  // (web/src/pages/Refine.tsx).
  const [activeQuestions, setActiveQuestions] = useState<QuestionDef[]>([]);
  const currentQuestion = activeQuestions[questionIndex];

  const flashAndAdvance = useCallback((label: string) => {
    setFlash(label);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlash(null);
      setQuestionIndex(i => i + 1);
    }, FLASH_MS);
  }, []);

  const advanceTask = useCallback(() => {
    // Cancel any pending flash-advance so a stale timer can't bump the index
    // on the next task after we've moved on.
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(null);
    setActiveQuestions([]);
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

  // Hold advanceTask behind a ref so the effects below can CALL the latest one
  // without listing it as a dependency. advanceTask's identity changes on every
  // parent render (onExit=switchMode is a fresh function each InteractiveApp
  // render, and the store polls every 2s) — listing it made the freeze effect
  // re-run on every poll/reload, resetting questionIndex to 0 and rebuilding the
  // question list mid-task, which manifested as cards flashing past on their own.
  const advanceTaskRef = useRef(advanceTask);
  useEffect(() => { advanceTaskRef.current = advanceTask; }, [advanceTask]);

  // Freeze the question list when a task becomes current. Keyed on task
  // identity + phase, so it does NOT re-run as the current task's own fields
  // change under applyChange — that's what keeps the list stable while you
  // answer it. Reads the freshest allTasks via ref for gating context.
  useEffect(() => {
    if (phase !== 'asking' || !currentTask) return;
    const all = allTasksRef.current;
    const focused = all.filter(t => t.focused && t.status !== 'done').length;
    // Scope the offered categories to the session's scope (and case-dedupe) so
    // e.g. work categories don't surface while refining personal tasks.
    const cats = deriveCategories(all, scopeFilter === 'all' ? undefined : scopeFilter);
    const qs = buildQuestions(currentTask, all, focused, config.focus.maxFocused, cats, focusAsksUsed.current >= 2);
    // Charge an ask only for a focus card that survived the question slice
    // (see the web's matching note in Refine.tsx). Undo doesn't refund it.
    if (qs.some(q => q.prompt.startsWith('Pull this into'))) focusAsksUsed.current += 1;
    setActiveQuestions(qs);
    setQuestionIndex(0);
    setListCursor(0);
    if (qs.length === 0) advanceTaskRef.current();
  }, [currentTask?.id, phase, config.focus.maxFocused]);

  // Walked past the end of a task's frozen list → next task. (The empty-list
  // case is handled at freeze time above.)
  useEffect(() => {
    if (phase !== 'asking') return;
    if (activeQuestions.length > 0 && questionIndex >= activeQuestions.length) advanceTaskRef.current();
  }, [phase, questionIndex, activeQuestions.length]);

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
    // n/N — vim-style "next": n skips the question, N skips the whole task.
    // (Was s/S, which collided with S-for-Scope everywhere else; `n` also
    // reads naturally as "no" on the yes/no and confirm cards below.)
    if (input === 'N') {
      skipTask();
      return;
    }
    if (input === 'n') {
      skipQuestion();
      return;
    }

    switch (currentQuestion.type) {
      case 'yesno': {
        if (input === 'y' || input === 't') {
          applyChange({ focused: true }, 'focused');
        } else if (input === 'f') {
          // 'n' is handled by the generic skip above — same outcome.
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
          // 'n' (keep as-is) is handled by the generic skip above.
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
