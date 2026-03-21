import { Box, Text } from 'ink';
import type { AppMode } from '../types.js';
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';

interface Props {
  mode?: AppMode;
  isWatch?: boolean;
  interval?: number;
}

export function Footer({ mode, isWatch, interval }: Props) {
  const width = useTerminalWidth();

  let navContent: string;
  let pageContent: string;
  if (isWatch) {
    navContent = `Refreshing every ${(interval ?? 2000) / 1000}s · Ctrl+C to exit`;
    pageContent = '';
  } else if (mode === 'view') {
    navContent = 'p:plan w:write m:metrics S-tab:scope';
    pageContent = 'jk:nav d:done ret:expand';
  } else if (mode === 'plan') {
    navContent = 'v:view w:write m:metrics S-tab:scope';
    pageContent = 'jk:nav spc:focus';
  } else if (mode === 'write') {
    navContent = 'esc:back  S-tab:scope';
    pageContent = 'enter:add  :subtask';
  } else if (mode === 'metrics') {
    navContent = 'v:view  p:plan  w:write';
    pageContent = 'e:end-day';
  } else {
    navContent = '';
    pageContent = '';
  }

  const gap = Math.max(1, width - navContent.length - pageContent.length - 2);
  const line = '  ' + navContent + ' '.repeat(gap) + pageContent;

  return (
    <Box flexDirection="column">
      <Text color="magenta" bold>{'╠' + '═'.repeat(width) + '╣'}</Text>
      <Text color="magenta" bold>{'║'}<Text dimColor>{' '.repeat(2) + navContent}</Text>{' '.repeat(gap)}<Text color="#00a5a5">{pageContent}</Text>{'║'}</Text>
      <Text color="magenta" bold>{'╚' + '═'.repeat(width) + '╝'}</Text>
    </Box>
  );
}
