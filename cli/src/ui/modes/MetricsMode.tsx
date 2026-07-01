import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { setExitOutput } from '../exitOutput.js';
import type { DayReport, Task } from '../../types.js';
import type { Store } from '../../store-interface.js';
import { buildDayReport } from '../../report.js';
import { EMPTY_DAY_REPORT } from '../shared/emptyDayReport.js';
import { getMidDayMessage } from '../../messages.js';
import { renderDayReportMarkdown } from '../../render-terminal.js';
import { ProgressBar } from '../shared/ProgressBar.js';
import { PulsingProgressBar } from '../shared/PulsingProgressBar.js';
import { SectionDivider } from '../shared/SectionDivider.js';
import { PriorityDot } from '../shared/PriorityDot.js';
import { InlineEdit } from '../shared/InlineEdit.js';
import { localDateString } from '../../local-date.js';

interface Props {
  store: Store;
}

interface SubtaskInfo {
  subtasks: Task[];
  doneToday: number;
  donePrior: number;
  total: number;
}

export function MetricsMode({ store }: Props) {
  const { exit } = useApp();
  const realToday = localDateString();
  const [viewDate, setViewDate] = useState(realToday);
  const [editingDate, setEditingDate] = useState(false);
  const [dateText, setDateText] = useState('');
  const [dateCursor, setDateCursor] = useState(0);

  const today = viewDate;
  const [report, setReport] = useState<DayReport>(EMPTY_DAY_REPORT);
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([buildDayReport(store, today), store.load()]).then(([r, tasks]) => {
      if (!cancelled) {
        setReport(r);
        setAllTasks(tasks);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store, today]);

  const { stats } = report;

  const allParents = allTasks.filter(t => t.parent_id === null);

  // Build subtask info per parent: split done-today vs done-prior
  const subtaskInfoMap = new Map<string, SubtaskInfo>();
  for (const t of allTasks) {
    if (!t.parent_id) continue;
    const info = subtaskInfoMap.get(t.parent_id) ?? { subtasks: [], doneToday: 0, donePrior: 0, total: 0 };
    info.subtasks.push(t);
    info.total++;
    if (t.status === 'done') {
      if (t.completed_at && t.completed_at.startsWith(today)) {
        info.doneToday++;
      } else {
        info.donePrior++;
      }
    }
    subtaskInfoMap.set(t.parent_id, info);
  }

  // Only show tasks that had activity today:
  // parent completed today, OR has subtasks completed today.
  // Focus state is intentionally ignored — metrics reflect actual activity,
  // not current focus membership.
  const todayTasks = allParents.filter(task => {
    const completedToday = task.status === 'done' && task.completed_at?.startsWith(today);
    const info = subtaskInfoMap.get(task.id);
    const hasSubtasksDoneToday = info ? info.doneToday > 0 : false;
    return completedToday || hasSubtasksDoneToday;
  });

  // Sort: done first, then in_progress, then todo
  const sortedFocused = [...todayTasks].sort((a, b) => {
    const order: Record<string, number> = { done: 0, in_progress: 1, todo: 2 };
    return (order[a.status] ?? 2) - (order[b.status] ?? 2);
  });

  // Progress bar: today's completion rate (done today vs. active today),
  // derived from report stats so it stays independent of focus state.
  const progressDone = stats.completed;
  const progressTotal = stats.completed + stats.inProgress;
  const progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;

  // Cyan pulse for fully-done parent tasks — same cadence as PulsingProgressBar
  const CYAN_PULSE = ['#00ffff', '#00cccc', '#009999', '#00cccc'];
  const hasFullyDone = sortedFocused.some(task => {
    if (task.status !== 'done') return false;
    const info = subtaskInfoMap.get(task.id);
    return !info || info.total === info.doneToday + info.donePrior;
  });
  const [pulseIndex, setPulseIndex] = useState(0);
  useEffect(() => {
    if (!hasFullyDone) return;
    const timer = setInterval(() => {
      setPulseIndex(i => (i + 1) % CYAN_PULSE.length);
    }, 400);
    return () => clearInterval(timer);
  }, [hasFullyDone]);

  useInput((input, key) => {
    if (editingDate) {
      if (key.return) {
        const d = dateText.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d).getTime())) {
          setViewDate(d);
        }
        setEditingDate(false);
      } else if (key.escape) {
        setViewDate(realToday);
        setEditingDate(false);
      } else if (key.backspace || key.delete) {
        if (dateCursor > 0) {
          setDateText(prev => prev.slice(0, dateCursor - 1) + prev.slice(dateCursor));
          setDateCursor(c => c - 1);
        }
      } else if (input && !key.ctrl && !key.meta) {
        setDateText(prev => prev.slice(0, dateCursor) + input + prev.slice(dateCursor));
        setDateCursor(c => c + 1);
      }
      return;
    }

    if (input === 'D') {
      setDateText(viewDate);
      setDateCursor(viewDate.length);
      setEditingDate(true);
    } else if (input === 'e') {
      const md = renderDayReportMarkdown(report, allTasks);
      setExitOutput(md + '\n');
      exit();
    }
  });

  const focusedRows = sortedFocused.length === 0
    ? [<Text key="no-focused" dimColor>    No focused tasks.</Text>]
    : sortedFocused.flatMap((task) => {
        const info = subtaskInfoMap.get(task.id);
        const rows: React.ReactNode[] = [];

        // Check if task and all subtasks are done
        const isFullyDone = task.status === 'done' && (!info || info.total === info.doneToday + info.donePrior);

        // Parent task row: dot + title + progress bar
        rows.push(
          <Box key={task.id}>
            <Text>  </Text>
            {isFullyDone
              ? <Text color={CYAN_PULSE[pulseIndex]}>{'◉'}</Text>
              : <Text color={task.status === 'done' ? 'white' : undefined}>{task.status !== 'todo' ? '◉' : '○'}</Text>}
            <Text color={isFullyDone ? 'cyan' : task.status === 'done' ? 'white' : undefined}> {task.title} </Text>
            {info && info.total > 0 ? (
              <PulsingProgressBar
                total={info.total}
                doneToday={info.doneToday}
                donePrior={info.donePrior}
              />
            ) : null}
          </Box>
        );

        // Subtask tree rows
        if (info && info.subtasks.length > 0) {
          info.subtasks.forEach((sub, i) => {
            const isLast = i === info.subtasks.length - 1;
            const connector = isLast ? '└─' : '├─';
            const isDone = sub.status === 'done';
            const isDoneToday = isDone && sub.completed_at?.startsWith(today);
            const marker = isDone ? '◉' : '○';

            rows.push(
              <Box key={sub.id}>
                <Text>  </Text>
                <Text dimColor>{connector} </Text>
                <Text color={isDoneToday ? '#ff79c6' : isDone ? 'white' : undefined}>{marker} {sub.title}</Text>
              </Box>
            );
          });
        }

        return rows;
      });

  const isViewingPast = viewDate !== realToday;
  const dateLabel = isViewingPast ? `Done on ${viewDate}` : 'Done today';
  const sectionLabel = isViewingPast ? `Progress — ${viewDate}` : "Today's Progress";

  return (
    <Box flexDirection="column">
      <Text> </Text>

      {editingDate ? (
        <Box>
          <Text>  </Text>
          <Text color="cyan" bold>Go to date: </Text>
          <InlineEdit text={dateText} cursorPos={dateCursor} prefix="" />
        </Box>
      ) : (
        <Box>
          <Text>  </Text>
          <Text color="green" bold>{dateLabel}: {stats.completed}</Text>
          <Text>                        </Text>
          <ProgressBar current={progressDone} total={progressTotal} width={10} color="magenta" />
        </Box>
      )}

      <Box>
        <Text>  </Text>
        <Text dimColor>You: {stats.completedByHuman}  Claude: {stats.completedByClaude}</Text>
        {stats.subtasksCompleted > 0 ? <Text dimColor>  ·  Subtasks: {stats.subtasksCompleted}</Text> : null}
      </Box>

      <Text> </Text>

      <SectionDivider label={sectionLabel} />

      {focusedRows}

      <Text> </Text>

      {report.insight ? (
        <Box><Text>  {'>>>'} </Text><Text color="cyan">{report.insight}</Text></Box>
      ) : null}

      <Box>
        <Text>  </Text>
        <Text color="yellow">{getMidDayMessage(progressPercent)}</Text>
      </Box>

      <Text> </Text>
    </Box>
  );
}
