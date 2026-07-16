import { Box, Text } from 'ink';
import type { Task } from '../../types.js';
import { SCOPE_LABELS } from '../../constants.js';
import { PriorityDot } from './PriorityDot.js';
import { ProgressBar } from './ProgressBar.js';
import { SessionDot } from './SessionDot.js';
import { CURSOR_GLYPH } from './selection.js';

interface Props {
  task: Task;
  isSelected?: boolean;
  subtaskProgress?: { done: number; total: number };
  sessionColor?: string | null;
  sessionActive?: boolean;
  /** Show a dim personal/professional tag — passed when the scope filter is 'all', where rows are otherwise indistinguishable. */
  showScope?: boolean;
}

export function TaskRow({ task, isSelected, subtaskProgress, sessionColor, sessionActive, showScope }: Props) {
  const isDone = task.status === 'done';

  return (
    <Box>
      <Text>{isSelected ? `  ${CURSOR_GLYPH} ` : '    '}</Text>
      <PriorityDot priority={task.priority} filled={task.status !== 'todo'} />
      <Text dimColor={isDone}> {task.title}</Text>
      {showScope && <Text dimColor> ·{SCOPE_LABELS[task.scope]}</Text>}
      <Text>{'  '}</Text>
      {subtaskProgress && subtaskProgress.total > 0 && (
        <ProgressBar
          current={subtaskProgress.done}
          total={subtaskProgress.total}
          width={subtaskProgress.total}
        />
      )}
      {isDone && <Text dimColor> ✓</Text>}
      {task.parent_id === null && sessionColor && (
        <SessionDot color={sessionColor} active={sessionActive ?? false} />
      )}
    </Box>
  );
}
