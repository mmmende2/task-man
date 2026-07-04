import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { Task, TaskManConfig } from '../../../types.js';
import { SCOPE_LABELS } from '../../../constants.js';
import { getSessionHexColor } from '../../../sessions.js';
import { PriorityDot } from '../../shared/PriorityDot.js';
import { InlineEdit } from '../../shared/InlineEdit.js';
import { CURSOR_GLYPH, type CursorTone } from '../../shared/selection.js';

export type EditingField = 'title' | 'category' | 'subtask-title' | 'subtask-create';

export interface EntryListEditing {
  /** For title/category: parent task id. For subtask-title: subtask id. For subtask-create: parent id. */
  id: string;
  type: EditingField;
  text: string;
  cursor: number;
}

export interface CategoryEditAssist {
  ghost: string | null;
  list: string[];
  didYouMean: string | null;
}

export interface CaptureAnchor {
  /** Parent task id where new subtasks will be attached. */
  parentId: string;
  /** True when the capture input starts with ':' (subtask mode). */
  isTypingSubtask: boolean;
  /** Live title text parsed from capture input (empty when not typing). */
  previewText: string;
}

interface Props {
  tasks: Task[];
  subtaskMap: Map<string, Task[]>;
  config: TaskManConfig;
  cursorId?: string | null;
  subtaskCursorId?: string | null;
  editing?: EntryListEditing;
  categoryAssist?: CategoryEditAssist | null;
  currentSessionId?: string | null;
  emptyMessage?: string;
  /** Max display rows to render. Extra rows are hidden behind scroll. */
  maxRows?: number;
  /** Color for the parent-task cursor highlight. Defaults to 'cyan' (review). */
  cursorTone?: CursorTone;
  /** Capture-mode anchor: renders a subtask-target hint under the parent. */
  captureAnchor?: CaptureAnchor | null;
  /** Show a dim per/pro tag per row — passed when the scope filter is 'all'. */
  showScope?: boolean;
}

interface CategoryGroup {
  category: string;
  tasks: Task[];
}

export function groupByCategory(tasks: Task[]): CategoryGroup[] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const c = t.categories?.[0] ?? '';
    if (!map.has(c)) map.set(c, []);
    map.get(c)!.push(t);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === '' && b !== '') return 1;
    if (a !== '' && b === '') return -1;
    return a.localeCompare(b);
  });
  return keys.map(k => ({ category: k, tasks: map.get(k)! }));
}

export function orderedTaskIds(tasks: Task[]): string[] {
  const groups = groupByCategory(tasks);
  const ids: string[] = [];
  for (const g of groups) for (const t of g.tasks) ids.push(t.id);
  return ids;
}

export function EntryList({
  tasks,
  subtaskMap,
  config,
  cursorId,
  subtaskCursorId,
  editing,
  categoryAssist,
  currentSessionId,
  emptyMessage,
  maxRows,
  cursorTone = 'cyan',
  captureAnchor,
  showScope,
}: Props) {
  const tone = cursorTone;
  const [scrollOffset, setScrollOffset] = useState(0);

  const groups = tasks.length === 0 ? [] : groupByCategory(tasks);
  const rows: React.ReactNode[] = [];
  // Track the display-row index of the cursor (parent task or any related edit row).
  let cursorRowIdx = -1;

  for (const group of groups) {
    const label = group.category || '(uncategorized)';
    rows.push(<Text key={`cat-${group.category}`} dimColor>{'  '}{label}</Text>);

    for (const task of group.tasks) {
      if (cursorId === task.id && cursorRowIdx < 0) cursorRowIdx = rows.length;
      const selected = cursorId === task.id;
      const isEditingTitle = editing?.id === task.id && editing.type === 'title';
      const isEditingCategory = editing?.id === task.id && editing.type === 'category';
      const terminalColor = getSessionHexColor(task.session_id, config);
      const isCurrent = !!currentSessionId && task.session_id === currentSessionId;
      const gutter = selected ? `  ${CURSOR_GLYPH}` : '    ';

      const isAnchor = captureAnchor?.parentId === task.id;

      if (isEditingTitle) {
        rows.push(
          <Box key={task.id}>
            <Text color={tone}>{gutter} </Text>
            <InlineEdit text={editing!.text} cursorPos={editing!.cursor} prefix="" />
          </Box>,
        );
      } else {
        const titleColor = selected ? tone : isCurrent ? terminalColor ?? undefined : undefined;
        const titleDim = !selected && !isCurrent && !task.focused;
        rows.push(
          <Box key={task.id}>
            <Text color={selected ? tone : undefined} dimColor={!selected}>{gutter} </Text>
            <PriorityDot priority={task.priority} filled={task.status !== 'todo'} terminalColor={terminalColor} />
            <Text color={titleColor} dimColor={titleDim}>{' '}{task.title}</Text>
            {showScope && <Text dimColor>{' ·'}{SCOPE_LABELS[task.scope]}</Text>}
            {task.focused && <Text color="yellow">{' ★'}</Text>}
            {task.status === 'done' && <Text dimColor>{' ✓'}</Text>}
            {selected && <Text color={tone}>{' ──────'}</Text>}
          </Box>,
        );
      }

      if (isEditingCategory) {
        rows.push(
          <Box key={`edit-cat-${task.id}`}>
            <Text dimColor>{'       category: '}</Text>
            <Text>{editing!.text.slice(0, editing!.cursor)}</Text>
            <Text backgroundColor="magenta" color="white">{editing!.text[editing!.cursor] ?? ' '}</Text>
            <Text>{editing!.text.slice(editing!.cursor + 1)}</Text>
            {categoryAssist?.ghost ? (
              <Text dimColor>{categoryAssist.ghost}</Text>
            ) : null}
          </Box>,
        );
        if (categoryAssist?.list && categoryAssist.list.length > 1) {
          rows.push(
            <Box key={`edit-cat-list-${task.id}`}>
              <Text dimColor>{'         ↳ '}</Text>
              {categoryAssist.list.slice(0, 5).map((name, i) => (
                <Text key={name} dimColor={i !== 0} bold={i === 0}>
                  {i > 0 ? ' · ' : ''}{name}
                </Text>
              ))}
            </Box>,
          );
        } else if (categoryAssist?.didYouMean) {
          rows.push(
            <Box key={`edit-cat-dym-${task.id}`}>
              <Text dimColor>{'         ↳ Did you mean: '}</Text>
              <Text color="yellow">{categoryAssist.didYouMean}</Text>
              <Text dimColor>?  [tab]</Text>
            </Box>,
          );
        }
      }

      const subs = subtaskMap.get(task.id) ?? [];
      for (const sub of subs) {
        const subSelected = subtaskCursorId === sub.id;
        if (subSelected) cursorRowIdx = rows.length;
        const isEditingSub = editing?.id === sub.id && editing.type === 'subtask-title';
        if (isEditingSub) {
          rows.push(
            <Box key={sub.id}>
              <Text color="cyan">{`     ${CURSOR_GLYPH} └─ `}</Text>
              <InlineEdit text={editing!.text} cursorPos={editing!.cursor} prefix="" />
            </Box>,
          );
        } else {
          rows.push(
            <Box key={sub.id}>
              <Text color={subSelected ? 'cyan' : undefined} dimColor={!subSelected}>
                {subSelected ? `     ${CURSOR_GLYPH} └─ ` : '       └─ '}
              </Text>
              <Text color={subSelected ? 'cyan' : undefined} dimColor={!subSelected}>{sub.title}</Text>
              {sub.status === 'done' && <Text dimColor>{' ✓'}</Text>}
              {subSelected && <Text color="cyan">{' ──────'}</Text>}
            </Box>,
          );
        }
      }

      if (editing?.id === task.id && editing.type === 'subtask-create') {
        rows.push(
          <Box key={`edit-sub-create-${task.id}`}>
            <Text color="cyan">{`     ${CURSOR_GLYPH} └─ `}</Text>
            <InlineEdit text={editing.text} cursorPos={editing.cursor} prefix="" />
          </Box>,
        );
      }

      const showCaptureGhost =
        isAnchor && !(editing?.id === task.id && editing.type === 'subtask-create');
      if (showCaptureGhost) {
        if (captureAnchor!.isTypingSubtask) {
          rows.push(
            <Box key={`capture-anchor-${task.id}`}>
              <Text color="magenta">{'       └─ '}</Text>
              <Text color="magenta">{captureAnchor!.previewText}</Text>
              <Text color="magenta">█</Text>
            </Box>,
          );
        } else {
          rows.push(
            <Box key={`capture-anchor-${task.id}`}>
              <Text dimColor>{'       └─ '}</Text>
              <Text dimColor italic>{'type ":" to add subtask here'}</Text>
            </Box>,
          );
        }
      }
    }

    rows.push(<Text key={`spacer-${group.category}`}> </Text>);
  }

  // Drop the trailing spacer after the final group so "more below" isn't stuck on.
  if (rows.length > 0) rows.pop();

  // Windowed scrolling — keep cursor row in view. Reserve 2 rows for scroll hints.
  const window = maxRows && maxRows > 0 ? Math.max(1, maxRows - 2) : rows.length;
  const maxScroll = Math.max(0, rows.length - window);
  const selRow = cursorRowIdx >= 0 ? cursorRowIdx : 0;
  let target = Math.min(Math.max(scrollOffset, 0), maxScroll);
  if (selRow < target) target = selRow;
  else if (selRow >= target + window) target = selRow - window + 1;

  // Snap to top: when only the leading category header would be hidden, use the
  // slot for content instead of an "↑ 1 more above" hint.
  if (target === 1 && selRow < window) target = 0;

  useEffect(() => {
    if (target !== scrollOffset) setScrollOffset(target);
  }, [target, scrollOffset]);

  if (tasks.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>  {emptyMessage ?? 'No tasks yet.'}</Text>
      </Box>
    );
  }

  const hasAbove = target > 0;
  const hasBelow = target + window < rows.length;
  const visibleRows = maxRows ? rows.slice(target, target + window) : rows;

  return (
    <Box flexDirection="column" flexShrink={0}>
      {hasAbove && <Text dimColor>  ↑ {target} more above</Text>}
      {visibleRows}
      {hasBelow && <Text dimColor>  ↓ {rows.length - target - window} more below</Text>}
    </Box>
  );
}
