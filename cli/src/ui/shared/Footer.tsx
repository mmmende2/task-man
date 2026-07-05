import { Box, Text } from 'ink';
import type { AppMode, WriteSubMode } from '../types.js';
import type { VimMode } from '../hooks/useVimKeys.js';
import { useServerStatus } from '../hooks/useServerStatus.js';

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
  const server = useServerStatus();
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
    navContent = 't:triage w:write m:metrics r:refine ~:scope';
    pageContent = 'jk:nav gg/G:top/bot tab:sub x:done S:scope D:date e:desc dd:cut i:edit /:find';
  } else if (mode === 'plan' && planFocus === 'categories') {
    navContent = 'f:focus w:write m:metrics r:refine ~:scope';
    pageContent = 'jk:nav gg/G:top/bot hl:pane spc:toggle esc:tasks';
  } else if (mode === 'plan') {
    navContent = 'f:focus w:write m:metrics r:refine ~:scope';
    pageContent = 'jk:nav gg/G:top/bot hl:pane spc:focus dd:cut x:done S:scope i:edit o:new /:find u:undo';
  } else if (mode === 'write' && writeSubMode === 'review') {
    navContent = 'esc:focus  w:capture  T:time';
    pageContent = 'jk:nav gg/G:top/bot tab:sub cc:title c:cat P:pri S:scope spc:focus dd:cut u:undo';
  } else if (mode === 'write') {
    navContent = 'esc:review  ~:scope';
    pageContent = 'enter:add  tab:accept  :subtask  -p -c -s flags';
  } else if (mode === 'metrics') {
    navContent = 'f:focus  t:triage  w:write  r:refine  ~:scope';
    pageContent = 'D:date';
  } else if (mode === 'refine') {
    navContent = 'N:skip task  u:undo  q:quit';
    pageContent = 'n:skip  y:yes  1-9  jk:nav';
  } else {
    navContent = '';
    pageContent = '';
  }

  return (
    <Box borderStyle="double" borderColor="magenta" flexShrink={0} flexDirection="column">
      <Box justifyContent="space-between">
        <Text dimColor>  {navContent || ' '}</Text>
        {server.running && (
          <Text color="#ff79c6" dimColor>● {server.remoteUrl ? 'remote' : `web :${server.port}`}  </Text>
        )}
      </Box>
      <Text color="#00a5a5">  {pageContent || ' '}</Text>
    </Box>
  );
}
