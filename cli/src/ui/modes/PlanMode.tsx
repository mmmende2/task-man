import { Box, Text, useInput } from 'ink';
import type { Task } from '../../types.js';
import type { TaskStore } from '../../store.js';
import { TaskRow } from '../shared/TaskRow.js';
import { SectionDivider } from '../shared/SectionDivider.js';

interface Props {
  focusedTasks: Task[];
  backlogTasks: Task[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  store: TaskStore;
  reload: () => void;
}

export function PlanMode({ focusedTasks, backlogTasks, selectedIndex, onSelectedIndexChange, store, reload }: Props) {
  const totalCount = focusedTasks.length + backlogTasks.length;

  useInput((input, key) => {
    if (totalCount === 0) return;
    if (key.downArrow || input === 'j') {
      onSelectedIndexChange(Math.min(selectedIndex + 1, totalCount - 1));
    } else if (key.upArrow || input === 'k') {
      onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
    } else if (input === ' ') {
      const task = selectedIndex < focusedTasks.length
        ? focusedTasks[selectedIndex]
        : backlogTasks[selectedIndex - focusedTasks.length];
      if (task) {
        store.update(task.id, { focused: !task.focused }).then(() => reload());
      }
    }
  });

  const focusedRows = focusedTasks.length === 0
    ? [<Text key="focused-empty" dimColor>    No focused tasks. Press space to focus.</Text>]
    : focusedTasks.map((task, i) => (
        <TaskRow key={task.id} task={task} isSelected={selectedIndex === i} />
      ));

  const backlogRows = backlogTasks.length === 0
    ? [<Text key="backlog-empty" dimColor>    No backlog tasks.</Text>]
    : backlogTasks.map((task, i) => (
        <TaskRow key={task.id} task={task} isSelected={selectedIndex === focusedTasks.length + i} />
      ));

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <SectionDivider label={`FOCUSED (${focusedTasks.length})`} />
      {focusedRows}
      <Text> </Text>
      <SectionDivider label={`BACKLOG (${backlogTasks.length})`} />
      {backlogRows}
      <Text> </Text>
    </Box>
  );
}
