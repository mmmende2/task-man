import { Box, Text } from 'ink';
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';

interface Props {
  children?: React.ReactNode;
}

export function BorderRow({ children }: Props) {
  const width = useTerminalWidth();

  return (
    <Box width={width + 2}>
      <Text color="magenta" bold>{'║'}</Text>
      <Box width={width} flexGrow={1}>
        {children}
      </Box>
      <Text color="magenta" bold>{'║'}</Text>
    </Box>
  );
}

/** Empty border row — just ║ ... ║ */
export function BorderRowEmpty() {
  const width = useTerminalWidth();

  return (
    <Box width={width + 2}>
      <Text color="magenta" bold>{'║'}</Text>
      <Box width={width}>
        <Text>{' '.repeat(width)}</Text>
      </Box>
      <Text color="magenta" bold>{'║'}</Text>
    </Box>
  );
}

/** Fills remaining vertical space with bordered empty rows */
export function BorderFill() {
  const width = useTerminalWidth();

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexGrow={1} width={width + 2}>
        <Text color="magenta" bold>{'║'}</Text>
        <Box width={width} flexGrow={1} />
        <Text color="magenta" bold>{'║'}</Text>
      </Box>
    </Box>
  );
}
