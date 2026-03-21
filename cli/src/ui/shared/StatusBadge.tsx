import { Text } from 'ink';
import type { TaskStatus } from '../../types.js';
import { STATUS_COLORS } from '../../constants.js';

const INK_COLORS: Record<string, string> = {
  green: 'green',
  yellow: 'yellow',
  white: 'white',
};

interface Props {
  status: TaskStatus;
}

export function StatusBadge({ status }: Props) {
  const color = INK_COLORS[STATUS_COLORS[status]] ?? 'white';
  return <Text color={color}>{status}</Text>;
}
