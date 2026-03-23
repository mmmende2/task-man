import { Box, Text } from 'ink';
import type { Task } from '../../types.js';
import { PriorityDot } from './PriorityDot.js';
import { StatusBadge } from './StatusBadge.js';
import { SubtaskCheckbox } from './SubtaskCheckbox.js';
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';

interface Props {
  task: Task;
  subtasks: Task[];
}

export function TaskRowExpanded({ task, subtasks }: Props) {
  const width = useTerminalWidth();
  const cardInner = width - 4;

  const titleLine = `─ ${task.title} `;
  const titlePad = Math.max(0, cardInner - titleLine.length - 6);
  const bottomDash = Math.max(0, cardInner - 18);

  const descriptionRow = task.description
    ? <Box key="desc"><Text>{'    │  '}</Text><Text dimColor>{task.description}</Text></Box>
    : null;

  const spacerRow = (task.description || subtasks.length > 0)
    ? <Box key="spacer-mid"><Text>{'    │'}</Text></Box>
    : null;

  const subtaskRows = subtasks.map((sub) => (
    <Box key={sub.id}><Text>{'    │  '}</Text><SubtaskCheckbox subtask={sub} /></Box>
  ));

  const postSubtaskSpacer = subtasks.length > 0
    ? <Box key="spacer-post"><Text>{'    │'}</Text></Box>
    : null;

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{'    '}</Text>
        <Text color="white">{'┌' + titleLine + '─'.repeat(titlePad) + ' '}</Text>
        <PriorityDot priority={task.priority} />
        <Text color="white">{' ─┐'}</Text>
      </Box>
      <Box><Text>{'    │'}</Text></Box>
      {descriptionRow}
      {spacerRow}
      {subtaskRows}
      {postSubtaskSpacer}
      <Box>
        <Text>{'    '}</Text>
        <Text color="white">{'└' + '─'.repeat(bottomDash) + ' '}</Text>
        <StatusBadge status={task.status} />
        <Text color="white">{' ─────┘'}</Text>
      </Box>
    </Box>
  );
}
