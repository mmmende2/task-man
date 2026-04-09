import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Task } from '../../types.js';
import type { TaskStore } from '../../store.js';
import { buildDayReport } from '../../report.js';
import { getMidDayMessage } from '../../messages.js';
import { renderDayReportTerminal } from '../../render-terminal.js';
import { ProgressBar } from '../shared/ProgressBar.js';
import { PulsingProgressBar } from '../shared/PulsingProgressBar.js';
import { SectionDivider } from '../shared/SectionDivider.js';
import { PriorityDot } from '../shared/PriorityDot.js';
import { InlineEdit } from '../shared/InlineEdit.js';

interface Props {
  store: TaskStore;
}

interface SubtaskInfo {
  subtasks: Task[];
  doneToday: number;
  donePrior: number;
  total: number;
}

export function MetricsMode({ store }: Props) {
  const realToday = new Date().toISOString().slice(0, 10);
  const [viewDate, setViewDate] = useState(realToday);
  const [editingDate, setEditingDate] = useState(false);
  const [dateText, setDateText] = useState('');
  const [dateCursor, setDateCursor] = useState(0);

  const today = viewDate;
  const report = buildDayReport(store, today);
  const { stats } = report;

  const allTasks = store.load();
  const focusedTasks = allTasks.filter(t => t.focused);
  const focusedDone = focusedTasks.filter(t => t.status === 'done').length;
  const focusedTotal = focusedTasks.length;

  const focusedParents = focusedTasks.filter(t => t.parent_id === null);

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
  // parent completed today, OR has subtasks completed today
  const todayTasks = focusedParents.filter(task => {
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

  const progressPercent = focusedTotal > 0 ? Math.round((focusedDone / focusedTotal) * 100) : 0;

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
      const output = renderDayReportTerminal(report);
      process.stdout.write('\x1B[2J\x1B[H');
      process.stdout.write(output + '\n');
      process.exit(0);
    }
  });

  const focusedRows = sortedFocused.length === 0
    ? [<Text key="no-focused" dimColor>    No focused tasks.</Text>]
    : sortedFocused.flatMap((task) => {
        const info = subtaskInfoMap.get(task.id);
        const rows: React.ReactNode[] = [];

        // Parent task row: dot + title + progress bar
        rows.push(
          <Box key={task.id}>
            <Text>  </Text>
            <PriorityDot priority={task.priority} filled={task.status !== 'todo'} />
            <Text color={task.status === 'done' ? 'white' : undefined}> {task.title} </Text>
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
          <ProgressBar current={focusedDone} total={focusedTotal} width={10} color="magenta" />
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
