import { Box, Text } from 'ink';
import type { Task } from '../../types.js';
import { SCOPE_LABELS } from '../../constants.js';
import { PriorityDot } from './PriorityDot.js';
import { SessionDot } from './SessionDot.js';
import { SubtaskCheckbox } from './SubtaskCheckbox.js';
import { ProgressBar } from './ProgressBar.js';
import { InlineEdit } from './InlineEdit.js';
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';
import { CURSOR_GLYPH } from './selection.js';
import { wrapText } from './wrapText.js';

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
  sessionColor?: string | null;
  sessionActive?: boolean;
  sessionName?: string | null;
  /** Append a personal/professional tag to the card's corner label (scope filter = 'all'). */
  showScope?: boolean;
}

export function TaskRowExpanded({ task, subtasks, subtaskProgress, inSubtaskNav, selectedSubtaskIndex, editingSubtaskId, editingDateId, editingDescriptionId, editText, cursorPos, sessionColor, sessionActive, sessionName, showScope }: Props) {
  const width = useTerminalWidth();
  const cardInner = width - 2;

  const borderColor = inSubtaskNav ? 'white' : 'cyan';

  const showSessionDot = task.parent_id === null && !!sessionColor;
  // ' ◉' plus ' name' — must be counted in the border math or the card overflows.
  const sessionSuffixLen = showSessionDot ? 2 + (sessionName ? sessionName.length + 1 : 0) : 0;

  const baseLabel = task.categories?.length ? task.categories[0] : task.status;
  const bottomLabel = showScope ? `${baseLabel} · ${SCOPE_LABELS[task.scope]}` : baseLabel;

  const isEditingTaskDate = editingDateId === task.id && editText !== undefined && cursorPos !== undefined;
  const isEditingDescription = editingDescriptionId === task.id && editText !== undefined && cursorPos !== undefined;

  // Single-line view for tasks with no subtasks
  if (subtasks.length === 0) {
    // ── ●  Title ◉ name ────── category ──
    // Truncate rather than let a long title push past the terminal edge and wrap.
    const maxTitleLen = Math.max(8, cardInner - 14 - bottomLabel.length - sessionSuffixLen);
    const displayTitle = task.title.length > maxTitleLen ? task.title.slice(0, maxTitleLen - 1) + '…' : task.title;
    const midDashes = Math.max(4, cardInner - 10 - displayTitle.length - bottomLabel.length - sessionSuffixLen);

    return (
      <Box flexDirection="column">
        <Box>
          <Text>{' '}</Text>
          <Text color={borderColor}>{'── '}</Text>
          <PriorityDot priority={task.priority} filled={task.status !== 'todo'} />
          <Text color={borderColor}>{' '}</Text>
          <Text color={borderColor}>{displayTitle}</Text>
          {showSessionDot && <SessionDot color={sessionColor!} active={sessionActive ?? false} name={sessionName} />}
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
          <Box flexDirection="column">
            {wrapText(task.description, Math.max(8, cardInner - 5)).map((line, i) => (
              <Box key={i}>
                <Text>{'     '}</Text>
                <Text dimColor>{line}</Text>
              </Box>
            ))}
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
  const bottomDash = Math.max(0, cardInner - 10 - bottomLabel.length);

  const descriptionRows = isEditingDescription
    ? [<Box key="desc"><Text color={borderColor}>{' │ '}</Text><InlineEdit text={editText} cursorPos={cursorPos} prefix="" /></Box>]
    : task.description
      ? wrapText(task.description, Math.max(8, cardInner - 3)).map((line, i) => (
          <Box key={`desc-${i}`}><Text color={borderColor}>{' │ '}</Text><Text dimColor>{line}</Text></Box>
        ))
      : null;

  const dateEditRow = isEditingTaskDate
    ? <Box key="date-edit"><Text color={borderColor}>{' │ '}</Text><InlineEdit text={editText} cursorPos={cursorPos} prefix="" /></Box>
    : null;

  const spacerRow = (task.description || subtasks.length > 0 || isEditingTaskDate || isEditingDescription)
    ? <Box key="spacer-mid"><Text color={borderColor}>{' │'}</Text></Box>
    : null;

  const subtaskRows = subtasks.flatMap((sub, i) => {
    const isSelected = inSubtaskNav && selectedSubtaskIndex === i;
    const indicator = isSelected ? `${CURSOR_GLYPH} ` : '  ';

    if ((editingSubtaskId === sub.id || editingDateId === sub.id) && editText !== undefined && cursorPos !== undefined) {
      return [
        <Box key={sub.id}>
          <Text color={borderColor}>{' │ '}</Text>
          <InlineEdit text={editText} cursorPos={cursorPos} prefix="" />
        </Box>,
      ];
    }

    // Wrap long titles ourselves: left to Ink, wrapping happens at the terminal
    // edge, dropping the │ border and squeezing the checkbox column.
    const checked = sub.status === 'done';
    const [firstLine, ...restLines] = wrapText(sub.title, Math.max(8, cardInner - 7));
    return [
      <Box key={sub.id}>
        <Text color={borderColor}>{' │ '}</Text>
        <Text color={isSelected ? 'cyan' : undefined}>{indicator}</Text>
        <SubtaskCheckbox subtask={sub} highlighted={isSelected} titleLine={firstLine} />
      </Box>,
      ...restLines.map((line, j) => (
        <Box key={`${sub.id}-wrap-${j}`}>
          <Text color={borderColor}>{' │ '}</Text>
          <Text>{'    '}</Text>
          <Text color={isSelected ? 'cyan' : undefined} dimColor={checked && !isSelected}>{line}</Text>
        </Box>
      )),
    ];
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

  // ┌─ ●  Title{progressText} ◉ name {pad}────
  // Truncate rather than let a long title push past the terminal edge and wrap.
  const maxTitleLen = Math.max(8, cardInner - 12 - progressText.length - sessionSuffixLen);
  const displayTitle = task.title.length > maxTitleLen ? task.title.slice(0, maxTitleLen - 1) + '…' : task.title;
  const contentWidth = 2 + 1 + 2 + displayTitle.length + progressText.length + sessionSuffixLen + 1;
  const trailingDashes = Math.max(4, cardInner - contentWidth - 1);

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{' '}</Text>
        <Text color={borderColor}>{'┌─ '}</Text>
        <PriorityDot priority={task.priority} filled={task.status !== 'todo'} />
        <Text color={borderColor}>{' '}</Text>
        <Text color={borderColor}>{displayTitle}</Text>
        {subtaskProgress && subtaskProgress.total > 0 ? (
          <Text>{' '}<ProgressBar current={subtaskProgress.done} total={subtaskProgress.total} width={subtaskProgress.total} /></Text>
        ) : null}
        {showSessionDot && <SessionDot color={sessionColor!} active={sessionActive ?? false} name={sessionName} />}
        <Text color={borderColor}>{' ' + '─'.repeat(Math.max(0, trailingDashes - 1)) + '┐'}</Text>
      </Box>
      <Box><Text color={borderColor}>{' │'}</Text></Box>
      {descriptionRows}
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
