import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TaskScope } from '../../types.js';
import type { TaskStore } from '../../store.js';
import type { AppMode } from '../types.js';
import { BorderRow, BorderRowEmpty, BorderFill } from '../shared/BorderRow.js';

interface Props {
  store: TaskStore;
  reload: () => void;
  scopeFilter: TaskScope | 'all';
  onModeChange: (mode: AppMode) => void;
  onCycleScope: () => void;
}

type Phase = 'title' | 'priority';

interface WrittenEntry {
  title: string;
  isSubtask: boolean;
  parentTitle?: string;
}

export function WriteMode({ store, reload, scopeFilter, onModeChange, onCycleScope }: Props) {
  const [inputText, setInputText] = useState('');
  const [phase, setPhase] = useState<Phase>('title');
  const [parsedTitle, setParsedTitle] = useState('');
  const [parsedCategory, setParsedCategory] = useState('');
  const [isSubtask, setIsSubtask] = useState(false);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [lastCreatedTitle, setLastCreatedTitle] = useState<string | null>(null);
  const [entries, setEntries] = useState<WrittenEntry[]>([]);

  useInput((input, key) => {
    // ESC → back to view mode
    if (key.escape) {
      onModeChange('view');
      return;
    }

    // Shift+Tab → cycle scope
    if (key.tab && key.shift) {
      onCycleScope();
      return;
    }

    if (phase === 'title') {
      if (key.return) {
        if (inputText.trim().length === 0) return;

        // Parse "title - category" format
        const text = inputText.trim();
        const subtask = text.startsWith(':');
        const cleanText = subtask ? text.slice(1).trim() : text;

        const dashIdx = cleanText.lastIndexOf(' - ');
        if (dashIdx > 0) {
          setParsedTitle(cleanText.slice(0, dashIdx).trim());
          setParsedCategory(cleanText.slice(dashIdx + 3).trim());
        } else {
          setParsedTitle(cleanText);
          setParsedCategory('');
        }

        setIsSubtask(subtask && lastCreatedId !== null);
        setPhase('priority');
        setInputText('');
      } else if (key.backspace || key.delete) {
        setInputText(prev => prev.slice(0, -1));
      } else if (!key.ctrl && !key.meta && input && input.length === 1) {
        setInputText(prev => prev + input);
      }
    } else if (phase === 'priority') {
      const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
        l: 'low',
        m: 'medium',
        h: 'high',
        u: 'urgent',
      };

      if (input && priorityMap[input]) {
        const priority = priorityMap[input];
        const scope: TaskScope = scopeFilter !== 'all' ? scopeFilter : 'personal';
        const isSub = isSubtask && lastCreatedId !== null;

        store.add({
          title: parsedTitle,
          priority,
          scope,
          categories: parsedCategory ? [parsedCategory] : [],
          parent_id: isSub ? lastCreatedId : undefined,
          focused: false,
          created_by: 'human',
        }).then((task) => {
          const entry: WrittenEntry = {
            title: parsedTitle,
            isSubtask: isSub,
            parentTitle: isSub ? lastCreatedTitle ?? undefined : undefined,
          };
          if (!isSub) {
            setLastCreatedId(task.id);
            setLastCreatedTitle(parsedTitle);
          }
          setEntries(prev => [...prev, entry]);
          setPhase('title');
          setInputText('');
          setParsedTitle('');
          setParsedCategory('');
          setIsSubtask(false);
          reload();
        });
      } else if (key.escape) {
        // Cancel back to title phase
        setPhase('title');
        setInputText('');
      }
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="space-between">
      {/* Top: list of written tasks */}
      <Box flexDirection="column">
        <BorderRowEmpty />
        {entries.map((entry, i) => (
          <BorderRow key={i}>
            {entry.isSubtask ? (
              <Text color="green">      └─ ✓ {entry.title}</Text>
            ) : (
              <Text color="green">  ✓ {entry.title}</Text>
            )}
          </BorderRow>
        ))}
        {entries.length === 0 && (
          <BorderRow>
            <Text dimColor>  No tasks added yet.</Text>
          </BorderRow>
        )}
      </Box>

      {/* Fill middle with bordered empty space */}
      <BorderFill />

      {/* Bottom: input area pinned near footer */}
      <Box flexDirection="column">
        <BorderRowEmpty />

        {phase === 'title' && (
          <Box flexDirection="column">
            <BorderRow>
              <Text>  {'> '}</Text>
              <Text color="white">{inputText}</Text>
              <Text color="magenta">█</Text>
            </BorderRow>
            <BorderRow>
              <Text dimColor>  Type task title. Use "title - category" format.</Text>
            </BorderRow>
            {lastCreatedId && (
              <BorderRow>
                <Text dimColor>  Start with ":" to add subtask of </Text>
                <Text dimColor italic>{lastCreatedTitle}</Text>
              </BorderRow>
            )}
          </Box>
        )}

        {phase === 'priority' && (
          <Box flexDirection="column">
            <BorderRow>
              <Text>  </Text>
              <Text color="white" bold>{parsedTitle}</Text>
              {parsedCategory && <Text dimColor> [{parsedCategory}]</Text>}
              {isSubtask && <Text color="cyan"> (subtask)</Text>}
            </BorderRow>
            <BorderRow>
              <Text>  Priority: </Text>
              <Text color="gray">(l)</Text><Text>ow  </Text>
              <Text color="cyan">(m)</Text><Text>ed  </Text>
              <Text color="magenta">(h)</Text><Text>igh  </Text>
              <Text color="red">(u)</Text><Text>rgent</Text>
            </BorderRow>
          </Box>
        )}

        <BorderRowEmpty />
      </Box>
    </Box>
  );
}
