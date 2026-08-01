import { Box, Text } from 'ink';

interface Props {
  query: string;
  /** Caret position within `query`. Defaults to the end. */
  cursor?: number;
}

export function SearchBar({ query, cursor }: Props) {
  const pos = cursor ?? query.length;
  const atEnd = pos >= query.length;
  return (
    <Box>
      <Text color="magenta">{'  / '}</Text>
      <Text>{query.slice(0, pos)}</Text>
      {atEnd ? (
        <Text backgroundColor="magenta" color="white">{' '}</Text>
      ) : (
        <>
          <Text backgroundColor="magenta" color="white">{query[pos]}</Text>
          <Text>{query.slice(pos + 1)}</Text>
        </>
      )}
    </Box>
  );
}
