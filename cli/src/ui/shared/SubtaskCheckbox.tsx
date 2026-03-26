import { Text } from 'ink';
import type { Task } from '../../types.js';

interface Props {
  subtask: Task;
  highlighted?: boolean;
}

export function SubtaskCheckbox({ subtask, highlighted }: Props) {
  const checked = subtask.status === 'done';
  return (
    <Text>
      <Text color={highlighted ? 'cyan' : undefined} dimColor={checked && !highlighted}>{checked ? '◉' : '○'}</Text>
      {' '}
      <Text dimColor={checked && !highlighted} color={highlighted ? 'cyan' : undefined}>{subtask.title}</Text>
    </Text>
  );
}
