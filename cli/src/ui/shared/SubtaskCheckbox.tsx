import { Text } from 'ink';
import type { Task } from '../../types.js';

interface Props {
  subtask: Task;
}

export function SubtaskCheckbox({ subtask }: Props) {
  const checked = subtask.status === 'done';
  return (
    <Text>
      <Text>{checked ? '☑' : '☐'}</Text>
      {' '}
      <Text dimColor={checked}>{subtask.title}</Text>
    </Text>
  );
}
