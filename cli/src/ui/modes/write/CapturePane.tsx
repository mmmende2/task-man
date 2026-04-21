import { Box, Text } from 'ink';
import type { CategoryMatchResult } from '../../hooks/useCategoryMatch.js';

interface Props {
  inputText: string;
  categoryMatch: CategoryMatchResult;
  preview: string;
  lastCreatedTitle: string | null;
  isSubtaskInput: boolean;
}

export function CapturePane({ inputText, categoryMatch, preview, lastCreatedTitle, isSubtaskInput }: Props) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text>  {'> '}</Text>
        {isSubtaskInput ? (
          <Text color="magenta" dimColor italic>↓ subtask inline</Text>
        ) : (
          <>
            <Text color="white">{inputText}</Text>
            {categoryMatch.ghost ? (
              <Text dimColor>{categoryMatch.ghost}</Text>
            ) : null}
            <Text color="magenta">█</Text>
          </>
        )}
      </Box>
      {preview ? (
        <Box>
          <Text dimColor>  {preview}</Text>
        </Box>
      ) : (
        <Text dimColor>  Type task title. Flags: -p priority -c category -s scope</Text>
      )}
      {categoryMatch.active && categoryMatch.list.length > 1 && (
        <Box>
          <Text dimColor>  {'↳ '}</Text>
          {categoryMatch.list.slice(0, 5).map((name, i) => (
            <Text key={name} dimColor={i !== 0} bold={i === 0}>
              {i > 0 ? ' · ' : ''}{name}
            </Text>
          ))}
        </Box>
      )}
      {categoryMatch.active && categoryMatch.didYouMean && (
        <Box>
          <Text dimColor>  {'↳ Did you mean: '}</Text>
          <Text color="yellow">{categoryMatch.didYouMean}</Text>
          <Text dimColor>?  [tab]</Text>
        </Box>
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
