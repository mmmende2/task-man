import { Text } from 'ink';

interface Props {
  current: number;
  total: number;
  width?: number;
  showPercent?: boolean;
  color?: string;
}

export function ProgressBar({ current, total, width = 3, showPercent = false, color = 'magenta' }: Props) {
  if (total === 0) return null;

  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = '▰'.repeat(filled) + '▱'.repeat(empty);

  return (
    <Text>
      <Text dimColor>{current}/{total}</Text>
      {' '}
      <Text color={color}>{bar}</Text>
      {showPercent && <Text dimColor> {Math.round((current / total) * 100)}%</Text>}
    </Text>
  );
}
