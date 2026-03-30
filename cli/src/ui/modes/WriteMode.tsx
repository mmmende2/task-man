import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TaskPriority, TaskScope } from '../../types.js';
import type { TaskStore } from '../../store.js';
import type { AppMode } from '../types.js';

interface Props {
  store: TaskStore;
  reload: () => void;
  scopeFilter: TaskScope | 'all';
  onModeChange: (mode: AppMode) => void;
  onCycleScope: () => void;
}

interface WrittenEntry {
  title: string;
  isSubtask: boolean;
  parentTitle?: string;
}

interface ParsedInput {
  title: string;
  priority: TaskPriority;
  categories: string[];
  scope: TaskScope | null;
  description: string | null;
  focused: boolean;
}

const PRIORITY_MAP: Record<string, TaskPriority> = {
  l: 'low', low: 'low',
  m: 'medium', medium: 'medium', med: 'medium',
  h: 'high', high: 'high',
  u: 'high', urgent: 'high',
};

const SCOPE_MAP: Record<string, TaskScope> = {
  per: 'personal', personal: 'personal',
  pro: 'professional', professional: 'professional',
};

function parseWriteInput(raw: string): ParsedInput {
  const result: ParsedInput = {
    title: '',
    priority: 'medium',
    categories: [],
    scope: null,
    description: null,
    focused: false,
  };

  // Check for flags: -p, -c, -s, -d, -f
  const flagPattern = /\s+-[pcdsf]\b/;
  const firstFlagMatch = raw.match(flagPattern);

  if (!firstFlagMatch || firstFlagMatch.index === undefined) {
    // No flags — fall back to "title - category" parsing
    const dashIdx = raw.lastIndexOf(' - ');
    if (dashIdx > 0) {
      result.title = raw.slice(0, dashIdx).trim();
      result.categories = [raw.slice(dashIdx + 3).trim()];
    } else {
      result.title = raw.trim();
    }
    return result;
  }

  // Title is everything before the first flag
  result.title = raw.slice(0, firstFlagMatch.index).trim();
  const flagStr = raw.slice(firstFlagMatch.index);

  // Tokenize the flag portion
  const tokens = flagStr.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '-p' && i + 1 < tokens.length) {
      const val = PRIORITY_MAP[tokens[i + 1].toLowerCase()];
      if (val) result.priority = val;
      i += 2;
    } else if (token === '-c' && i + 1 < tokens.length) {
      result.categories.push(tokens[i + 1]);
      i += 2;
    } else if (token === '-s' && i + 1 < tokens.length) {
      const val = SCOPE_MAP[tokens[i + 1].toLowerCase()];
      if (val) result.scope = val;
      i += 2;
    } else if (token === '-d' && i + 1 < tokens.length) {
      // Description: consume everything until next flag or end
      // Support quoted strings
      if (tokens[i + 1].startsWith('"')) {
        const descTokens: string[] = [];
        let j = i + 1;
        while (j < tokens.length) {
          descTokens.push(tokens[j]);
          if (tokens[j].endsWith('"')) break;
          j++;
        }
        result.description = descTokens.join(' ').replace(/^"|"$/g, '');
        i = j + 1;
      } else {
        result.description = tokens[i + 1];
        i += 2;
      }
    } else if (token === '-f') {
      result.focused = true;
      i += 1;
    } else {
      i += 1;
    }
  }

  return result;
}

function formatPreview(parsed: ParsedInput, isSubtask: boolean): string {
  const parts: string[] = [];
  if (parsed.priority !== 'medium') parts.push(`Priority: ${parsed.priority}`);
  if (parsed.categories.length > 0) parts.push(`Category: ${parsed.categories.join(', ')}`);
  if (parsed.scope) parts.push(`Scope: ${parsed.scope}`);
  if (parsed.description) parts.push(`Desc: ${parsed.description}`);
  if (parsed.focused) parts.push('Focused');
  if (isSubtask) parts.push('Subtask');
  return parts.length > 0 ? parts.join(' | ') : '';
}

export function WriteMode({ store, reload, scopeFilter, onModeChange, onCycleScope }: Props) {
  const [inputText, setInputText] = useState('');
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [lastCreatedTitle, setLastCreatedTitle] = useState<string | null>(null);
  const [entries, setEntries] = useState<WrittenEntry[]>([]);

  // Live parse for preview
  const trimmed = inputText.trim();
  const isSubtaskInput = trimmed.startsWith(':');
  const cleanInput = isSubtaskInput ? trimmed.slice(1).trim() : trimmed;
  const liveParsed = cleanInput.length > 0 ? parseWriteInput(cleanInput) : null;
  const preview = liveParsed ? formatPreview(liveParsed, isSubtaskInput && lastCreatedId !== null) : '';

  useInput((input, key) => {
    if (key.escape) {
      onModeChange('focus');
      return;
    }

    if (input === 'S') {
      onCycleScope();
      return;
    }

    if (key.return) {
      if (inputText.trim().length === 0) return;

      const text = inputText.trim();
      const subtask = text.startsWith(':');
      const cleanText = subtask ? text.slice(1).trim() : text;
      const parsed = parseWriteInput(cleanText);

      if (parsed.title.length === 0) return;

      const scope: TaskScope = parsed.scope ?? (scopeFilter !== 'all' ? scopeFilter : 'personal');
      const isSub = subtask && lastCreatedId !== null;

      store.add({
        title: parsed.title,
        priority: parsed.priority,
        scope,
        categories: parsed.categories,
        description: parsed.description ?? undefined,
        parent_id: isSub ? lastCreatedId : undefined,
        focused: parsed.focused,
        created_by: 'human',
      }).then((task) => {
        const entry: WrittenEntry = {
          title: parsed.title,
          isSubtask: isSub,
          parentTitle: isSub ? lastCreatedTitle ?? undefined : undefined,
        };
        if (!isSub) {
          setLastCreatedId(task.id);
          setLastCreatedTitle(parsed.title);
        }
        setEntries(prev => [...prev, entry]);
        setInputText('');
        reload();
      });
    } else if (key.backspace || key.delete) {
      setInputText(prev => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input && input.length === 1) {
      setInputText(prev => prev + input);
    }
  });

  const entryRows = entries.length === 0
    ? [<Text key="empty" dimColor>  No tasks added yet.</Text>]
    : entries.map((entry, i) => (
        entry.isSubtask
          ? <Text key={i} color="green">      └─ ✓ {entry.title}</Text>
          : <Text key={i} color="green">  ✓ {entry.title}</Text>
      ));

  const subtaskHint = lastCreatedId
    ? <Box key="subtask-hint">
        <Text dimColor>  Start with ":" to add subtask of </Text>
        <Text dimColor italic>{lastCreatedTitle}</Text>
      </Box>
    : null;

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="space-between">
      {/* Top: list of written tasks */}
      <Box flexDirection="column">
        <Text> </Text>
        {entryRows}
      </Box>

      {/* Bottom: input area pinned near footer */}
      <Box flexDirection="column">
        <Text> </Text>

        <Box flexDirection="column">
          <Box>
            <Text>  {'> '}</Text>
            <Text color="white">{inputText}</Text>
            <Text color="magenta">█</Text>
          </Box>
          {preview ? (
            <Box>
              <Text dimColor>  {preview}</Text>
            </Box>
          ) : (
            <Text dimColor>  Type task title. Flags: -p priority -c category -s scope</Text>
          )}
          {subtaskHint}
        </Box>

        <Text> </Text>
      </Box>
    </Box>
  );
}
