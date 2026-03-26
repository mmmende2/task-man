import { Box, Text } from 'ink';
import type { AppMode } from '../types.js';

interface Props {
  mode?: AppMode;
  isWatch?: boolean;
  interval?: number;
}

export function Footer({ mode, isWatch, interval }: Props) {
  let navContent: string;
  let pageContent: string;
  if (isWatch) {
    navContent = `Refreshing every ${(interval ?? 2000) / 1000}s · Ctrl+C to exit`;
    pageContent = '';
  } else if (mode === 'focus') {
    navContent = 'p:plan w:write m:metrics S:scope';
    pageContent = 'jk:nav tab:subtasks D:done';
  } else if (mode === 'plan') {
    navContent = 'f:focus w:write m:metrics S:scope';
    pageContent = 'jk:nav spc:focus';
  } else if (mode === 'write') {
    navContent = 'esc:back  S:scope';
    pageContent = 'enter:add  :subtask';
  } else if (mode === 'metrics') {
    navContent = 'f:focus  p:plan  w:write';
    pageContent = 'e:end-day';
  } else {
    navContent = '';
    pageContent = '';
  }

  return (
    <Box borderStyle="double" borderColor="magenta" flexShrink={0}>
      <Box justifyContent="space-between" flexGrow={1}>
        <Text dimColor>  {navContent}</Text>
        {pageContent ? <Text color="#00a5a5">{pageContent}  </Text> : null}
      </Box>
    </Box>
  );
}
