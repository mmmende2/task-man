import { Box, Text } from 'ink';
import type { AppMode, WriteSubMode } from '../types.js';
import type { VimMode } from '../hooks/useVimKeys.js';

interface Props {
  mode?: AppMode;
  isWatch?: boolean;
  interval?: number;
  vimMode?: VimMode;
  holdingTitle?: string;
  writeSubMode?: WriteSubMode;
  planFocus?: 'tasks' | 'categories';
}

export function Footer({ mode, isWatch, interval, vimMode, holdingTitle, writeSubMode, planFocus }: Props) {
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
    pageContent = 'jk:nav tab:sub x:done D:date e:desc dd:cut i:edit /:find';
  } else if (mode === 'plan' && planFocus === 'categories') {
    navContent = 'f:focus w:write m:metrics ~:scope';
    pageContent = 'jk:nav hl:pane spc:toggle esc:tasks';
  } else if (mode === 'plan') {
    navContent = 'f:focus w:write m:metrics ~:scope';
    pageContent = 'jk:nav hl:pane spc:focus dd:cut x:done i:edit o:new /:find u:undo';
  } else if (mode === 'write' && writeSubMode === 'review') {
    navContent = 'esc:focus  w:capture  T:time';
    pageContent = 'jk:nav tab:sub cc:title c:cat p:pri s:scope f:focus dd:del u:undo';
  } else if (mode === 'write') {
    navContent = 'esc:review  ~:scope';
    pageContent = 'enter:add  tab:accept  :subtask  -p -c -s flags';
  } else if (mode === 'metrics') {
    navContent = 'f:focus  t:triage  w:write';
    pageContent = 'D:date  e:print report';
  } else if (mode === 'refine') {
    navContent = 'S:skip task  u:undo  q:quit';
    pageContent = 's:skip  y/n  1-9  jk:nav';
  } else {
    navContent = '';
    pageContent = '';
  }

  return (
    <Box borderStyle="double" borderColor="magenta" flexShrink={0} flexDirection="column">
      <Text dimColor>  {navContent || ' '}</Text>
      <Text color="#00a5a5">  {pageContent || ' '}</Text>
    </Box>
  );
}
