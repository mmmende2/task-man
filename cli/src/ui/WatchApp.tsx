import { createElement } from 'react';
import { Box, Text } from 'ink';
import { useTaskStore } from './hooks/useTaskStore.js';
import { useTerminalDimensionsSetup, TerminalDimensionsProvider, useTerminalHeight } from './hooks/useTerminalWidth.js';
import { Header } from './shared/Header.js';
import { Footer } from './shared/Footer.js';
import { TaskRow } from './shared/TaskRow.js';
import { TaskRowExpanded } from './shared/TaskRowExpanded.js';

interface Props {
  interval: number;
}

export function WatchApp({ interval }: Props) {
  const dims = useTerminalDimensionsSetup();
  return createElement(TerminalDimensionsProvider, { value: dims }, createElement(WatchAppInner, { interval }));
}

function WatchAppInner({ interval }: Props) {
  const { tasks } = useTaskStore(undefined, interval);
  const termHeight = useTerminalHeight();

  const subtaskMap = new Map<string, typeof tasks>();
  const parentTasks: typeof tasks = [];

  for (const t of tasks) {
    if (t.parent_id) {
      const existing = subtaskMap.get(t.parent_id) ?? [];
      existing.push(t);
      subtaskMap.set(t.parent_id, existing);
    } else {
      parentTasks.push(t);
    }
  }

  const focusedActive = parentTasks.filter(t => t.focused && t.status !== 'done');
  const expandedTask = focusedActive[0];
  const compactTasks = focusedActive.slice(1);
  const backlogCount = parentTasks.filter(t => !t.focused || t.status === 'done').length;
  const focusedCount = parentTasks.filter(t => t.focused).length;

  const expandedRow = expandedTask
    ? <Box flexDirection="column" key="expanded">
        <TaskRowExpanded
          task={expandedTask}
          subtasks={subtaskMap.get(expandedTask.id) ?? []}
        />
        <Text> </Text>
      </Box>
    : null;

  const emptyRow = focusedActive.length === 0
    ? <Text key="empty" dimColor>  No focused tasks. Use <Text color="cyan">task-man focus {'<id>'}</Text> to add some.</Text>
    : null;

  const backlogRow = backlogCount > 0
    ? <Text key="backlog" dimColor>{'  + ' + backlogCount + ' more in backlog'}</Text>
    : null;

  return (
    <Box flexDirection="column" height={termHeight}>
      <Header
        mode="view"
        taskCount={{ focused: focusedCount, total: parentTasks.length }}
      />

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <Text> </Text>

        {expandedRow}

        {compactTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            subtaskProgress={getSubtaskProgress(task.id, subtaskMap)}
          />
        ))}

        {emptyRow}
        {backlogRow}

        <Text> </Text>
        <Box flexGrow={1} />
      </Box>

      <Footer isWatch interval={interval} />
    </Box>
  );
}

function getSubtaskProgress(
  parentId: string,
  subtaskMap: Map<string, { status: string }[]>,
): { done: number; total: number } | undefined {
  const subs = subtaskMap.get(parentId);
  if (!subs || subs.length === 0) return undefined;
  return {
    done: subs.filter(s => s.status === 'done').length,
    total: subs.length,
  };
}
