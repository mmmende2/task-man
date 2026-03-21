import { Box, Text } from 'ink';
import type { AppMode } from '../types.js';
import type { TaskScope } from '../../types.js';
import { SCOPE_LABELS } from '../../constants.js';
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';

interface Props {
  mode: AppMode;
  scope?: TaskScope | 'all';
  taskCount?: { focused: number; total: number };
  category?: string;
}

export function Header({ mode, scope, taskCount, category }: Props) {
  const width = useTerminalWidth();
  const scopeLabel = scope && scope !== 'all' ? SCOPE_LABELS[scope] : undefined;

  const left = '  TASK MAN';
  const modeLabel = mode.toUpperCase();
  const rightParts: string[] = [];
  if (scopeLabel) rightParts.push(scopeLabel);
  if (category) rightParts.push(category);
  const rightMeta = rightParts.join(' · ');
  const right = [rightMeta].filter(Boolean).join('   ');

  // Layout: left + gap + right (scope) + gap + modeLabel
  const rightStr = right ? `${right}  ` : '';
  const pad = Math.max(1, width - left.length - rightStr.length - modeLabel.length - 2);

  return (
    <Box flexDirection="column">
      <Text color="magenta" bold>{'╔' + '═'.repeat(width) + '╗'}</Text>
      <Text color="magenta" bold>{'║'}<Text color="magenta" bold>{left}</Text>{' '.repeat(pad)}<Text color="magenta" bold>{rightStr}</Text><Text color="#00a5a5">{modeLabel}</Text>{'  ║'}</Text>
      <Text color="magenta" bold>{'╠' + '═'.repeat(width) + '╣'}</Text>
    </Box>
  );
}
