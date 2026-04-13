import { Box, Text } from 'ink';
import type { Task } from '../../types.js';
import { PriorityDot } from './PriorityDot.js';
import { ProgressBar } from './ProgressBar.js';

interface Props {
  task: Task;
  isSelected?: boolean;
  subtaskProgress?: { done: number; total: number };
  terminalColor?: string | null;
  sessionActive?: boolean;
}

export function TaskRow({ task, isSelected, subtaskProgress, terminalColor, sessionActive }: Props) {
  const isDone = task.status === 'done';

  return (
    <Box>
      <Text>{isSelected ? '  ▸ ' : '    '}</Text>
      <PriorityDot priority={task.priority} filled={task.status !== 'todo'} terminalColor={terminalColor} />
      <Text dimColor={isDone}> {task.title}  </Text>
      {subtaskProgress && subtaskProgress.total > 0 && (
        <ProgressBar
          current={subtaskProgress.done}
          total={subtaskProgress.total}
          width={subtaskProgress.total}
        />
      )}
      {isDone && <Text dimColor> ✓</Text>}
      {sessionActive && <Text color={terminalColor ?? 'white'}>{' ◉'}</Text>}
    </Box>
  );
}
