import { Box, Text } from 'ink';

interface CategoryCandidateRowProps {
  list: string[];
  highlightIndex: number;
  /** Leading whitespace before the '↳' — differs by nesting depth at each call site. */
  indent: string;
}

/** The '↳ candidate · candidate  [tab] cycle' row shown while Tab-cycling category matches. */
export function CategoryCandidateRow({ list, highlightIndex, indent }: CategoryCandidateRowProps) {
  return (
    <Box>
      <Text dimColor>{indent}{'↳ '}</Text>
      {list.slice(0, 5).map((name, i) => (
        <Text key={name} dimColor={i !== highlightIndex} bold={i === highlightIndex}>
          {i > 0 ? ' · ' : ''}{name}
        </Text>
      ))}
      <Text dimColor>{'  [tab] cycle'}</Text>
    </Box>
  );
}

interface DidYouMeanRowProps {
  name: string;
  indent: string;
}

/** The '↳ Did you mean: X?  [tab]' row shown for a near-miss fuzzy suggestion. */
export function DidYouMeanRow({ name, indent }: DidYouMeanRowProps) {
  return (
    <Box>
      <Text dimColor>{indent}{'↳ Did you mean: '}</Text>
      <Text color="yellow">{name}</Text>
      <Text dimColor>?  [tab]</Text>
    </Box>
  );
}
