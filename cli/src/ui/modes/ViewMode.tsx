import { Box, Text, useInput } from 'ink';
import type { Task } from '../../types.js';
import type { TaskStore } from '../../store.js';
import { TaskRow } from '../shared/TaskRow.js';
import { TaskRowExpanded } from '../shared/TaskRowExpanded.js';
import { BorderRow, BorderRowEmpty } from '../shared/BorderRow.js';

interface Props {
  tasks: Task[];
  subtaskMap: Map<string, Task[]>;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  store: TaskStore;
  reload: () => void;
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

export function ViewMode({ tasks, subtaskMap, selectedIndex, onSelectedIndexChange, store, reload }: Props) {
  const focusedActive = tasks.filter(t => t.focused && t.status !== 'done');

  useInput((input, key) => {
    if (key.downArrow || input === 'j') {
      onSelectedIndexChange(Math.min(selectedIndex + 1, focusedActive.length - 1));
    } else if (key.upArrow || input === 'k') {
      onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
    } else if ((input === 'd' || input === 'D') && focusedActive.length > 0) {
      const task = focusedActive[selectedIndex];
      if (task) {
        store.update(task.id, { status: 'done' }).then(() => reload());
      }
    } else if (key.return && focusedActive.length > 0 && selectedIndex !== 0) {
      onSelectedIndexChange(0);
    }
  });

  const expandedTask = focusedActive[selectedIndex] ?? focusedActive[0];
  const backlogCount = tasks.filter(t => !t.focused || t.status === 'done').length;

  if (focusedActive.length === 0) {
    return (
      <Box flexDirection="column">
        <BorderRowEmpty />
        <BorderRow>
          <Text dimColor>  No focused tasks. Use </Text>
          <Text color="cyan">task-man focus {'<id>'}</Text>
          <Text dimColor> to add some.</Text>
        </BorderRow>
        {backlogCount > 0 && (
          <BorderRow>
            <Text dimColor>{'                          + ' + backlogCount + ' in backlog'}</Text>
          </BorderRow>
        )}
        <BorderRowEmpty />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <BorderRowEmpty />

      {/* Expanded card for the selected task */}
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
      {focusedActive.map((task, i) => {
        if (i === selectedIndex) return null;
        return (
          <BorderRow key={task.id}>
            <TaskRow
              task={task}
              isSelected={false}
              subtaskProgress={getSubtaskProgress(task.id, subtaskMap)}
            />
          </BorderRow>
        );
      })}

      {/* Backlog count */}
      {backlogCount > 0 && (
        <BorderRow>
          <Text dimColor>{'                          + ' + backlogCount + ' more in backlog'}</Text>
        </BorderRow>
      )}

      <BorderRowEmpty />
    </Box>
  );
}
