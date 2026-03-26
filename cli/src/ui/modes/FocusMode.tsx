import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Task } from '../../types.js';
import type { TaskStore } from '../../store.js';
import { TaskRow } from '../shared/TaskRow.js';
import { TaskRowExpanded } from '../shared/TaskRowExpanded.js';

interface Props {
  focusedTasks: Task[];
  backlogCount: number;
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

export function FocusMode({ focusedTasks, backlogCount, subtaskMap, selectedIndex, onSelectedIndexChange, store, reload }: Props) {
  // 'tasks' = navigating parent tasks, 'subtasks' = navigating subtasks of selected task
  const [navTarget, setNavTarget] = useState<'tasks' | 'subtasks'>('tasks');
  const [subtaskIndex, setSubtaskIndex] = useState(0);

  const selectedTask = focusedTasks[selectedIndex];
  const currentSubtasks = selectedTask ? (subtaskMap.get(selectedTask.id) ?? []) : [];

  useInput((input, key) => {
    if (focusedTasks.length === 0) return;

    // Tab toggles between task and subtask navigation
    if (key.tab && !key.shift) {
      if (navTarget === 'tasks' && currentSubtasks.length > 0) {
        setNavTarget('subtasks');
        setSubtaskIndex(0);
      } else {
        setNavTarget('tasks');
      }
      return;
    }

    if (navTarget === 'subtasks') {
      if (key.downArrow || input === 'j') {
        setSubtaskIndex(Math.min(subtaskIndex + 1, currentSubtasks.length - 1));
      } else if (key.upArrow || input === 'k') {
        setSubtaskIndex(Math.max(subtaskIndex - 1, 0));
      } else if (input === 'D') {
        const sub = currentSubtasks[subtaskIndex];
        if (sub) {
          const newStatus = sub.status === 'done' ? 'todo' : 'done';
          store.update(sub.id, { status: newStatus }).then(() => reload());
        }
      }
    } else {
      if (key.downArrow || input === 'j') {
        onSelectedIndexChange(Math.min(selectedIndex + 1, focusedTasks.length - 1));
        setNavTarget('tasks');
        setSubtaskIndex(0);
      } else if (key.upArrow || input === 'k') {
        onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
        setNavTarget('tasks');
        setSubtaskIndex(0);
      } else if (input === 'D') {
        const task = focusedTasks[selectedIndex];
        if (task) {
          store.update(task.id, { status: 'done' }).then(() => reload());
        }
      }
    }
  });

  if (focusedTasks.length === 0) {
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

  const taskRows = focusedTasks.map((task, i) => {
    if (selectedIndex === i) {
      return (
        <Box flexDirection="column" key={task.id}>
          <TaskRowExpanded
            task={task}
            subtasks={subtaskMap.get(task.id) ?? []}
            subtaskProgress={getSubtaskProgress(task.id, subtaskMap)}
            inSubtaskNav={navTarget === 'subtasks'}
            selectedSubtaskIndex={subtaskIndex}
          />
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
      />
    );
  });

  const backlogRow = backlogCount > 0
    ? <Text key="backlog" dimColor>{'  + ' + backlogCount + ' more in backlog'}</Text>
    : null;

  return (
    <Box flexDirection="column">
      <Text> </Text>
      {taskRows}
      {backlogRow}
      <Text> </Text>
    </Box>
  );
}
