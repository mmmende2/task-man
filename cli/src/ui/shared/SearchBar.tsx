import { Box, Text } from 'ink';

interface Props {
  query: string;
}

export function SearchBar({ query }: Props) {
  return (
    <Box>
      <Text color="magenta">{'  / '}</Text>
      <Text>{query}</Text>
      <Text backgroundColor="magenta" color="white">{' '}</Text>
    </Box>
  );
}
