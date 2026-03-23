import { Box, Text } from 'ink';
import type { AppMode } from '../types.js';
import type { TaskScope } from '../../types.js';
import { SCOPE_LABELS } from '../../constants.js';

interface Props {
  mode: AppMode;
  scope?: TaskScope | 'all';
  taskCount?: { focused: number; total: number };
  category?: string;
}

export function Header({ mode, scope, taskCount, category }: Props) {
  const scopeLabel = scope && scope !== 'all' ? SCOPE_LABELS[scope] : undefined;

  const modeLabel = mode.toUpperCase();
  const rightParts: string[] = [];
  if (scopeLabel) rightParts.push(scopeLabel);
  if (category) rightParts.push(category);
  const rightMeta = rightParts.join(' · ');

  return (
    <Box borderStyle="double" borderColor="magenta" flexShrink={0}>
      <Box justifyContent="space-between" flexGrow={1}>
        <Text bold color="magenta">  TASK MAN</Text>
        <Box>
          {rightMeta ? <Text bold color="magenta">{rightMeta}  </Text> : null}
          <Text color="#00a5a5">{modeLabel}  </Text>
        </Box>
      </Box>
    </Box>
  );
}
