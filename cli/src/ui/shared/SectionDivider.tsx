import { Text } from 'ink';
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';

interface Props {
  label?: string;
}

export function SectionDivider({ label }: Props) {
  const width = useTerminalWidth();
  const innerWidth = width - 2; // account for leading indent

  if (label) {
    const prefix = '─── ' + label + ' ';
    const dashCount = Math.max(0, innerWidth - prefix.length);
    return <Text dimColor>{'  ' + prefix + '─'.repeat(dashCount)}</Text>;
  }
  return <Text dimColor>{'  ' + '─'.repeat(innerWidth)}</Text>;
}
