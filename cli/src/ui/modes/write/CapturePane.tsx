import { Box, Text } from 'ink';
import type { CategoryMatchResult } from '../../hooks/useCategoryMatch.js';
import { CategoryCandidateRow, DidYouMeanRow } from '../../shared/CategoryCandidates.js';

interface Props {
  inputText: string;
  /** Caret position within `inputText`. At the end it renders as the trailing block. */
  cursor: number;
  categoryMatch: CategoryMatchResult;
  preview: string;
  lastCreatedTitle: string | null;
  isSubtaskInput: boolean;
}

export function CapturePane({ inputText, cursor, categoryMatch, preview, lastCreatedTitle, isSubtaskInput }: Props) {
  const atEnd = cursor >= inputText.length;
  return (
    <Box flexDirection="column">
      <Box>
        <Text>  {'> '}</Text>
        {isSubtaskInput ? (
          <Text color="magenta" dimColor italic>↓ subtask inline</Text>
        ) : (
          <>
            <Text color="white">{inputText.slice(0, cursor)}</Text>
            {/* Mid-line the caret inverts the character it sits on; at the end
                there is nothing to invert, so it stays the solid block. */}
            {atEnd ? null : (
              <>
                <Text backgroundColor="magenta" color="white">{inputText[cursor]}</Text>
                <Text color="white">{inputText.slice(cursor + 1)}</Text>
              </>
            )}
            {categoryMatch.ghost ? (
              <Text dimColor>{categoryMatch.ghost}</Text>
            ) : null}
            {atEnd ? <Text color="magenta">█</Text> : null}
          </>
        )}
      </Box>
      {preview ? (
        <Box>
          <Text dimColor>  {preview}</Text>
        </Box>
      ) : (
        <Text dimColor>  Type task title. Flags: -p pri -c cat -s scope -d "desc" -f focus</Text>
      )}
      {categoryMatch.active && categoryMatch.list.length > 1 && (
        <CategoryCandidateRow
          list={categoryMatch.list}
          highlightIndex={categoryMatch.highlightIndex ?? 0}
          indent="  "
          overflowCount={categoryMatch.overflowCount}
        />
      )}
      {categoryMatch.active && categoryMatch.didYouMean && (
        <DidYouMeanRow name={categoryMatch.didYouMean} indent="  " />
      )}
      {!isSubtaskInput && lastCreatedTitle && (
        <Box>
          <Text dimColor>  Start with ":" to add subtask of </Text>
          <Text dimColor italic>{lastCreatedTitle}</Text>
        </Box>
      )}
    </Box>
  );
}
