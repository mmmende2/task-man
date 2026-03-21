import { createElement } from 'react';
import { Box, Text } from 'ink';
import { useTaskStore } from './hooks/useTaskStore.js';
import { useTerminalWidthSetup, TerminalWidthProvider } from './hooks/useTerminalWidth.js';
import { Header } from './shared/Header.js';
import { Footer } from './shared/Footer.js';
import { TaskRow } from './shared/TaskRow.js';
import { TaskRowExpanded } from './shared/TaskRowExpanded.js';
import { BorderRow, BorderRowEmpty } from './shared/BorderRow.js';

interface Props {
  interval: number;
}

export function WatchApp({ interval }: Props) {
  const width = useTerminalWidthSetup();
  return createElement(TerminalWidthProvider, { value: width }, createElement(WatchAppInner, { interval }));
}

function WatchAppInner({ interval }: Props) {
  const { tasks } = useTaskStore(undefined, interval);

  // Separate parent tasks from subtasks
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

  // Find the first focused, non-done task to expand
  const focusedActive = parentTasks.filter(t => t.focused && t.status !== 'done');
  const expandedTask = focusedActive[0];
  const compactTasks = focusedActive.slice(1);
  const backlogCount = parentTasks.filter(t => !t.focused || t.status === 'done').length;

  const focusedCount = parentTasks.filter(t => t.focused).length;

  return (
    <Box flexDirection="column">
      <Header
        mode="view"
        taskCount={{ focused: focusedCount, total: parentTasks.length }}
      />

      <BorderRowEmpty />

      {/* Expanded card for the top focused task */}
      {expandedTask && (
        <Box flexDirection="column">
          <TaskRowExpanded
            task={expandedTask}
            subtasks={subtaskMap.get(expandedTask.id) ?? []}
          />
          <BorderRowEmpty />
        </Box>
      )}

      {/* Compact rows for remaining focused tasks */}
      {compactTasks.map((task) => (
        <BorderRow key={task.id}>
          <TaskRow
            task={task}
            subtaskProgress={getSubtaskProgress(task.id, subtaskMap)}
          />
        </BorderRow>
      ))}

      {/* No tasks message */}
      {focusedActive.length === 0 && (
        <BorderRow>
          <Text dimColor>  No focused tasks. Use </Text>
          <Text color="cyan">task-man focus {'<id>'}</Text>
          <Text dimColor> to add some.</Text>
        </BorderRow>
      )}

      {/* Backlog count */}
      {backlogCount > 0 && (
        <BorderRow>
          <Text dimColor>{'                          + ' + backlogCount + ' more in backlog'}</Text>
        </BorderRow>
      )}

      <BorderRowEmpty />

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
