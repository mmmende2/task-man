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
  const modeLabel = mode.toUpperCase();

  return (
    <Box borderStyle="double" borderColor="magenta" flexShrink={0}>
      <Box justifyContent="space-between" flexGrow={1}>
        <Text bold color="magenta">  TASK MAN</Text>
        <Box>
          {category ? <Text bold color="magenta">{category}  </Text> : null}
          {/* Scope is always visible so `~` stays discoverable: dim `all`
              when unfiltered, loud when a scope filter is active. */}
          {scope ? (
            scope === 'all'
              ? <Text dimColor>{'all'}  </Text>
              : <Text bold color="magenta">{SCOPE_LABELS[scope]}  </Text>
          ) : null}
          <Text color="#00a5a5">{modeLabel}  </Text>
        </Box>
      </Box>
    </Box>
  );
}
