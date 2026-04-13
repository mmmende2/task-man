import { Text } from 'ink';
import type { TaskPriority } from '../../types.js';
import { PRIORITY_COLORS } from '../../constants.js';

const INK_COLORS: Record<string, string> = {
  red: 'red',
  magenta: 'magenta',
  cyan: 'cyan',
  gray: 'gray',
};

interface Props {
  priority: TaskPriority;
  filled?: boolean;
  terminalColor?: string | null;
}

export function PriorityDot({ priority, filled = true, terminalColor }: Props) {
  const color = terminalColor ?? INK_COLORS[PRIORITY_COLORS[priority]] ?? 'white';
  return <Text color={color}>{filled ? '●' : '○'}</Text>;
}
