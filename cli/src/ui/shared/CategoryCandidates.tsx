import { Box, Text } from 'ink';
import { MAX_CATEGORY_CANDIDATES } from '../hooks/useCategoryMatch.js';

interface CategoryCandidateRowProps {
  list: string[];
  highlightIndex: number;
  /** Leading whitespace before the '↳' — differs by nesting depth at each call site. */
  indent: string;
  /**
   * Candidates beyond the shown/cycle-able set. Omit while `list` is still the
   * full live prefix-match list (pre-cycle) — it's derived from `list.length`
   * instead; pass it once a frozen cycle has already capped `list` and lost
   * the true count.
   */
  overflowCount?: number;
}

/** The '↳ candidate · candidate  [tab] cycle' row shown while Tab-cycling category matches. */
export function CategoryCandidateRow({ list, highlightIndex, indent, overflowCount }: CategoryCandidateRowProps) {
  const shown = list.slice(0, MAX_CATEGORY_CANDIDATES);
  const overflow = overflowCount ?? Math.max(0, list.length - MAX_CATEGORY_CANDIDATES);
  return (
    <Box>
      <Text dimColor>{indent}{'↳ '}</Text>
      {shown.map((name, i) => (
        <Text key={name} dimColor={i !== highlightIndex} bold={i === highlightIndex}>
          {i > 0 ? ' · ' : ''}{name}
        </Text>
      ))}
      {overflow > 0 && <Text dimColor>{`  +${overflow} more`}</Text>}
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
