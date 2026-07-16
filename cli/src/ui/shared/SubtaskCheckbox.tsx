import { Text } from 'ink';
import type { Task } from '../../types.js';

interface Props {
  subtask: Task;
  highlighted?: boolean;
  /** First line of a pre-wrapped title — callers render continuation lines themselves. */
  titleLine?: string;
}

export function SubtaskCheckbox({ subtask, highlighted, titleLine }: Props) {
  const checked = subtask.status === 'done';
  return (
    <Text>
      <Text color={highlighted ? 'cyan' : undefined} dimColor={checked && !highlighted}>{checked ? '◉' : '○'}</Text>
      {' '}
      <Text dimColor={checked && !highlighted} color={highlighted ? 'cyan' : undefined}>{titleLine ?? subtask.title}</Text>
    </Text>
  );
}
