import { Box, Text } from 'ink';

interface Props {
  text: string;
  cursorPos: number;
  prefix?: string;
}

export function InlineEdit({ text, cursorPos, prefix = '    ' }: Props) {
  const before = text.slice(0, cursorPos);
  const cursorChar = text[cursorPos] ?? ' ';
  const after = text.slice(cursorPos + 1);

  return (
    <Box>
      <Text>{prefix}</Text>
      <Text color="magenta">{'> '}</Text>
      <Text>{before}</Text>
      <Text backgroundColor="magenta" color="white">{cursorChar}</Text>
      <Text>{after}</Text>
    </Box>
  );
}
