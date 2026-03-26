import { Box, Text } from 'ink';
import type { Task } from '../../types.js';
import { PriorityDot } from './PriorityDot.js';
import { StatusBadge } from './StatusBadge.js';
import { SubtaskCheckbox } from './SubtaskCheckbox.js';
import { ProgressBar } from './ProgressBar.js';
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';

interface Props {
  task: Task;
  subtasks: Task[];
  subtaskProgress?: { done: number; total: number };
  inSubtaskNav?: boolean;
  selectedSubtaskIndex?: number;
}

export function TaskRowExpanded({ task, subtasks, subtaskProgress, inSubtaskNav, selectedSubtaskIndex }: Props) {
  const width = useTerminalWidth();
  const cardInner = width - 4;

  // Border color: cyan when navigating tasks, white when navigating subtasks
  const borderColor = inSubtaskNav ? 'white' : 'cyan';

  const bottomDash = Math.max(0, cardInner - 18);

  const descriptionRow = task.description
    ? <Box key="desc"><Text color={borderColor}>{'    │  '}</Text><Text dimColor>{task.description}</Text></Box>
    : null;

  const spacerRow = (task.description || subtasks.length > 0)
    ? <Box key="spacer-mid"><Text color={borderColor}>{'    │'}</Text></Box>
    : null;

  const subtaskRows = subtasks.map((sub, i) => {
    const isSelected = inSubtaskNav && selectedSubtaskIndex === i;
    const indicator = isSelected ? '▸ ' : '  ';
    return (
      <Box key={sub.id}>
        <Text color={borderColor}>{'    │ '}</Text>
        <Text color={isSelected ? 'cyan' : undefined}>{indicator}</Text>
        <SubtaskCheckbox subtask={sub} highlighted={isSelected} />
      </Box>
    );
  });

  const postSubtaskSpacer = subtasks.length > 0
    ? <Box key="spacer-post"><Text color={borderColor}>{'    │'}</Text></Box>
    : null;

  // Build the title line content to measure for padding
  // Format: ┌─ ●  Title 0/9 ▰▱▱ ────
  // We need to calculate the visible width of the progress portion
  let progressText = '';
  if (subtaskProgress && subtaskProgress.total > 0) {
    const filled = Math.round((subtaskProgress.done / subtaskProgress.total) * subtaskProgress.total);
    const empty = subtaskProgress.total - filled;
    progressText = ` ${subtaskProgress.done}/${subtaskProgress.total} ${'▰'.repeat(filled)}${'▱'.repeat(empty)}`;
  }

  // ┌─ ●  Title{progressText} {pad}────
  const contentWidth = 2 + 1 + 2 + task.title.length + progressText.length + 1; // "─ " + dot + "  " + title + progress + " "
  const trailingDashes = Math.max(4, cardInner - contentWidth - 1); // -1 for the ┌

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{'    '}</Text>
        <Text color={borderColor}>{'┌─ '}</Text>
        <PriorityDot priority={task.priority} filled={task.status !== 'todo'} />
        <Text color={borderColor}>{' '}</Text>
        <Text color={borderColor}>{task.title}</Text>
        {subtaskProgress && subtaskProgress.total > 0 ? (
          <Text>{' '}<ProgressBar current={subtaskProgress.done} total={subtaskProgress.total} width={subtaskProgress.total} /></Text>
        ) : null}
        <Text color={borderColor}>{' ' + '─'.repeat(Math.max(0, trailingDashes - 1)) + '┐'}</Text>
      </Box>
      <Box><Text color={borderColor}>{'    │'}</Text></Box>
      {descriptionRow}
      {spacerRow}
      {subtaskRows}
      {postSubtaskSpacer}
      <Box>
        <Text>{'    '}</Text>
        <Text color={borderColor}>{'└' + '─'.repeat(bottomDash) + ' '}</Text>
        <StatusBadge status={task.status} />
        <Text color={borderColor}>{' ─────┘'}</Text>
      </Box>
    </Box>
  );
}
