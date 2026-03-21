import { Box, Text } from 'ink';
import type { Task } from '../../types.js';
import { PriorityDot } from './PriorityDot.js';
import { ProgressBar } from './ProgressBar.js';

interface Props {
  task: Task;
  isSelected?: boolean;
  subtaskProgress?: { done: number; total: number };
}

export function TaskRow({ task, isSelected, subtaskProgress }: Props) {
  return (
    <Box>
      <Text>{isSelected ? '  ▸ ' : '    '}</Text>
      <PriorityDot priority={task.priority} filled={task.status !== 'todo'} />
      <Text> {task.title}  </Text>
      {subtaskProgress && subtaskProgress.total > 0 && (
        <ProgressBar
          current={subtaskProgress.done}
          total={subtaskProgress.total}
          width={subtaskProgress.total}
        />
      )}
    </Box>
  );
}
