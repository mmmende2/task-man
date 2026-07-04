import { Box, Text } from 'ink';
import type { Task } from '../../types.js';
import { SCOPE_LABELS } from '../../constants.js';
import { PriorityDot } from './PriorityDot.js';
import { SubtaskCheckbox } from './SubtaskCheckbox.js';
import { ProgressBar } from './ProgressBar.js';
import { InlineEdit } from './InlineEdit.js';
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';
import { CURSOR_GLYPH } from './selection.js';

interface Props {
  task: Task;
  subtasks: Task[];
  subtaskProgress?: { done: number; total: number };
  inSubtaskNav?: boolean;
  selectedSubtaskIndex?: number;
  editingSubtaskId?: string | null;
  editingDateId?: string | null;
  editingDescriptionId?: string | null;
  editText?: string;
  cursorPos?: number;
  terminalColor?: string | null;
  /** Append a per/pro tag to the card's corner label (scope filter = 'all'). */
  showScope?: boolean;
}

export function TaskRowExpanded({ task, subtasks, subtaskProgress, inSubtaskNav, selectedSubtaskIndex, editingSubtaskId, editingDateId, editingDescriptionId, editText, cursorPos, terminalColor, showScope }: Props) {
  const width = useTerminalWidth();
  const cardInner = width - 2;

  // Session color overrides default; otherwise cyan for task nav, white for subtask nav
  const borderColor = terminalColor ?? (inSubtaskNav ? 'white' : 'cyan');

  const baseLabel = task.categories?.length ? task.categories[0] : task.status;
  const bottomLabel = showScope ? `${baseLabel} · ${SCOPE_LABELS[task.scope]}` : baseLabel;

  const isEditingTaskDate = editingDateId === task.id && editText !== undefined && cursorPos !== undefined;
  const isEditingDescription = editingDescriptionId === task.id && editText !== undefined && cursorPos !== undefined;

  // Single-line view for tasks with no subtasks
  if (subtasks.length === 0) {
    // ── ●  Title ────── category ──
    const midDashes = Math.max(4, cardInner - 10 - task.title.length - bottomLabel.length);

    return (
      <Box flexDirection="column">
        <Box>
          <Text>{' '}</Text>
          <Text color={borderColor}>{'── '}</Text>
          <PriorityDot priority={task.priority} filled={task.status !== 'todo'} terminalColor={terminalColor} />
          <Text color={borderColor}>{' '}</Text>
          <Text color={borderColor}>{task.title}</Text>
          <Text color={borderColor}>{' ' + '─'.repeat(midDashes) + ' '}</Text>
          <Text dimColor>{bottomLabel}</Text>
          <Text color={borderColor}>{' ──'}</Text>
        </Box>
        {isEditingDescription ? (
          <Box>
            <Text>{'     '}</Text>
            <InlineEdit text={editText} cursorPos={cursorPos} prefix="" />
          </Box>
        ) : task.description ? (
          <Box>
            <Text>{'     '}</Text>
            <Text dimColor>{task.description}</Text>
          </Box>
        ) : null}
        {isEditingTaskDate && (
          <Box>
            <Text>{'     '}</Text>
            <InlineEdit text={editText} cursorPos={cursorPos} prefix="" />
          </Box>
        )}
      </Box>
    );
  }

  // Full box view for tasks with subtasks
  const bottomDash = Math.max(0, cardInner - 14 - bottomLabel.length);

  const descriptionRow = isEditingDescription
    ? <Box key="desc"><Text color={borderColor}>{' │ '}</Text><InlineEdit text={editText} cursorPos={cursorPos} prefix="" /></Box>
    : task.description
      ? <Box key="desc"><Text color={borderColor}>{' │ '}</Text><Text dimColor>{task.description}</Text></Box>
      : null;

  const dateEditRow = isEditingTaskDate
    ? <Box key="date-edit"><Text color={borderColor}>{' │ '}</Text><InlineEdit text={editText} cursorPos={cursorPos} prefix="" /></Box>
    : null;

  const spacerRow = (task.description || subtasks.length > 0 || isEditingTaskDate || isEditingDescription)
    ? <Box key="spacer-mid"><Text color={borderColor}>{' │'}</Text></Box>
    : null;

  const subtaskRows = subtasks.map((sub, i) => {
    const isSelected = inSubtaskNav && selectedSubtaskIndex === i;
    const indicator = isSelected ? `${CURSOR_GLYPH} ` : '  ';

    if ((editingSubtaskId === sub.id || editingDateId === sub.id) && editText !== undefined && cursorPos !== undefined) {
      return (
        <Box key={sub.id}>
          <Text color={borderColor}>{' │ '}</Text>
          <InlineEdit text={editText} cursorPos={cursorPos} prefix="" />
        </Box>
      );
    }

    return (
      <Box key={sub.id}>
        <Text color={borderColor}>{' │ '}</Text>
        <Text color={isSelected ? 'cyan' : undefined}>{indicator}</Text>
        <SubtaskCheckbox subtask={sub} highlighted={isSelected} />
      </Box>
    );
  });

  const postSubtaskSpacer = subtasks.length > 0
    ? <Box key="spacer-post"><Text color={borderColor}>{' │'}</Text></Box>
    : null;

  // Build the title line content to measure for padding
  let progressText = '';
  if (subtaskProgress && subtaskProgress.total > 0) {
    const filled = Math.round((subtaskProgress.done / subtaskProgress.total) * subtaskProgress.total);
    const empty = subtaskProgress.total - filled;
    progressText = ` ${subtaskProgress.done}/${subtaskProgress.total} ${'▰'.repeat(filled)}${'▱'.repeat(empty)}`;
  }

  // ┌─ ●  Title{progressText} {pad}────
  const contentWidth = 2 + 1 + 2 + task.title.length + progressText.length + 1;
  const trailingDashes = Math.max(4, cardInner - contentWidth - 1);

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{' '}</Text>
        <Text color={borderColor}>{'┌─ '}</Text>
        <PriorityDot priority={task.priority} filled={task.status !== 'todo'} terminalColor={terminalColor} />
        <Text color={borderColor}>{' '}</Text>
        <Text color={borderColor}>{task.title}</Text>
        {subtaskProgress && subtaskProgress.total > 0 ? (
          <Text>{' '}<ProgressBar current={subtaskProgress.done} total={subtaskProgress.total} width={subtaskProgress.total} /></Text>
        ) : null}
        <Text color={borderColor}>{' ' + '─'.repeat(Math.max(0, trailingDashes - 1)) + '┐'}</Text>
      </Box>
      <Box><Text color={borderColor}>{' │'}</Text></Box>
      {descriptionRow}
      {dateEditRow}
      {spacerRow}
      {subtaskRows}
      {postSubtaskSpacer}
      <Box>
        <Text>{' '}</Text>
        <Text color={borderColor}>{'└' + '─'.repeat(bottomDash) + ' '}</Text>
        <Text dimColor>{bottomLabel}</Text>
        <Text color={borderColor}>{' ─────┘'}</Text>
      </Box>
    </Box>
  );
}
