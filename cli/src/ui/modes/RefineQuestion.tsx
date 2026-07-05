import { Box, Text } from 'ink';
import { usePulse, CYAN_PULSE } from '../hooks/usePulse.js';
import { InlineEdit } from '../shared/InlineEdit.js';
import type { QuestionDef } from '../../refine-questions.js';

// Re-exported so existing importers (RefineMode) keep their one import site.
export type { QuestionType, QuestionOption, QuestionDef } from '../../refine-questions.js';

interface Props {
  question: QuestionDef;
  listCursor?: number;
  editing?: boolean;
  editText?: string;
  editCursor?: number;
  flash?: string;
}

export function RefineQuestion({
  question,
  listCursor = 0,
  editing = false,
  editText = '',
  editCursor = 0,
  flash,
}: Props) {
  const pulseColor = usePulse({ colors: CYAN_PULSE, intervalMs: 350 });

  if (flash) {
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Box>
          <Text color="greenBright">  ✓ {flash}</Text>
        </Box>
        <Text> </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Box>
        <Text color={pulseColor}>  ▶ </Text>
        <Text bold>{question.prompt}</Text>
      </Box>
      {question.note && (
        <Box>
          <Text color="yellow" dimColor>    ⚠ {question.note}</Text>
        </Box>
      )}
      <Text> </Text>
      {renderBody(question, listCursor, editing, editText, editCursor)}
      <Text> </Text>
    </Box>
  );
}

function renderBody(
  q: QuestionDef,
  listCursor: number,
  editing: boolean,
  editText: string,
  editCursor: number,
) {
  if (q.type === 'yesno') {
    return (
      <Box>
        <Text dimColor>    </Text>
        <Text color="cyan">[y]</Text><Text> Yes  </Text>
        <Text dimColor>·  </Text>
        <Text color="cyan">[n]</Text><Text> No / skip  </Text>
        <Text dimColor>·  </Text>
        <Text color="cyan">[esc]</Text><Text dimColor> Quit</Text>
      </Box>
    );
  }

  if (q.type === 'confirm') {
    return (
      <Box>
        <Text dimColor>    </Text>
        <Text color="cyan">[y]</Text><Text> Keep  </Text>
        <Text dimColor>·  </Text>
        <Text color="cyan">[d]</Text><Text> Delete  </Text>
        <Text dimColor>·  </Text>
        <Text color="cyan">[e]</Text><Text> Edit title  </Text>
        <Text dimColor>·  </Text>
        <Text color="cyan">[n]</Text><Text dimColor> Skip</Text>
      </Box>
    );
  }

  if (q.type === 'list' && q.options) {
    return (
      <Box flexDirection="column">
        {q.options.map((opt, i) => {
          const selected = i === listCursor;
          return (
            <Box key={opt.value}>
              <Text color={selected ? 'cyan' : undefined}>
                {selected ? '  → ' : '    '}
              </Text>
              <Text color={selected ? 'cyan' : undefined} bold={selected}>
                {opt.label}
              </Text>
            </Box>
          );
        })}
        <Text> </Text>
        <Box>
          <Text dimColor>    </Text>
          <Text color="cyan">[j/k]</Text><Text dimColor> nav  </Text>
          <Text color="cyan">[enter]</Text><Text dimColor> select  </Text>
          <Text color="cyan">[n]</Text><Text dimColor> skip</Text>
        </Box>
      </Box>
    );
  }

  if (q.type === 'number' && q.options) {
    return (
      <Box flexDirection="column">
        {q.options.map((opt, i) => (
          <Box key={opt.value}>
            <Text color="cyan">    [{i + 1}]</Text>
            <Text> {opt.label}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  if (q.type === 'correction') {
    if (editing) {
      return (
        <Box flexDirection="column">
          <InlineEdit text={editText} cursorPos={editCursor} prefix="    " />
          <Text> </Text>
          <Box>
            <Text dimColor>    </Text>
            <Text color="cyan">[enter]</Text><Text dimColor> save  </Text>
            <Text color="cyan">[esc]</Text><Text dimColor> cancel</Text>
          </Box>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>    "</Text>
          <Text>{q.original ?? ''}</Text>
          <Text dimColor>"</Text>
        </Box>
        <Box>
          <Text dimColor>        ↓</Text>
        </Box>
        <Box>
          <Text dimColor>    "</Text>
          <Text color="cyan">{q.suggestion ?? ''}</Text>
          <Text dimColor>"</Text>
        </Box>
        <Text> </Text>
        <Box>
          <Text dimColor>    </Text>
          <Text color="cyan">[y]</Text><Text> Accept  </Text>
          <Text dimColor>·  </Text>
          <Text color="cyan">[n]</Text><Text> Keep original  </Text>
          <Text dimColor>·  </Text>
          <Text color="cyan">[e]</Text><Text dimColor> Edit</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
