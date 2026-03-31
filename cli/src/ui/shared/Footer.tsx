import { Box, Text } from 'ink';
import type { AppMode } from '../types.js';
import type { VimMode } from '../hooks/useVimKeys.js';

interface Props {
  mode?: AppMode;
  isWatch?: boolean;
  interval?: number;
  vimMode?: VimMode;
  holdingTitle?: string;
}

export function Footer({ mode, isWatch, interval, vimMode, holdingTitle }: Props) {
  let navContent: string;
  let pageContent: string;

  if (isWatch) {
    navContent = `Refreshing every ${(interval ?? 2000) / 1000}s · Ctrl+C to exit`;
    pageContent = '';
  } else if (vimMode === 'insert') {
    navContent = '';
    pageContent = 'esc:save  enter:save';
  } else if (vimMode === 'holding' && holdingTitle) {
    navContent = '';
    pageContent = `-- cut: ${holdingTitle} -- p:put P:put esc:delete`;
  } else if (mode === 'focus') {
    navContent = 't:triage w:write m:metrics ~:scope';
    pageContent = 'jk:nav tab:sub x:done dd:cut i:edit o:new /:find u:undo';
  } else if (mode === 'plan') {
    navContent = 'f:focus w:write m:metrics ~:scope';
    pageContent = 'jk:nav spc:focus dd:cut x:done i:edit o:new /:find u:undo';
  } else if (mode === 'write') {
    navContent = 'esc:back  ~:scope';
    pageContent = 'enter:add  :subtask  -p -c -s flags';
  } else if (mode === 'metrics') {
    navContent = 'f:focus  t:triage  w:write';
    pageContent = 'e:print report';
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
