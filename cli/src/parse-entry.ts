import type { TaskPriority, TaskScope } from './types.js';

// Quick-entry flag parser shared by the TUI Write mode (CapturePane)
// and the web Quick Capture. Both surfaces must parse identically, so
// this is the single source of truth — do not reimplement elsewhere.
//
// Syntax (richer than it looks):
//   clean dishes -c housework -p high -s personal
//   write report -c "deep work" -d "Q3 numbers" -f
//   buy milk - groceries           (bare "title - category" shorthand)
//
// Priority aliases: l/low, m/med/medium, h/high, u/urgent
// Scope aliases:    per/personal, pro/professional
// Default priority is `medium`.

export interface ParsedEntry {
  title: string;
  priority: TaskPriority;
  categories: string[];
  scope: TaskScope | null;
  description: string | null;
  focused: boolean;
}

export const PRIORITY_MAP: Record<string, TaskPriority> = {
  l: 'low', low: 'low',
  m: 'medium', medium: 'medium', med: 'medium',
  h: 'high', high: 'high',
  u: 'high', urgent: 'high',
};

export const SCOPE_MAP: Record<string, TaskScope> = {
  per: 'personal', personal: 'personal',
  pro: 'professional', professional: 'professional',
};

export function parseWriteInput(raw: string): ParsedEntry {
  const result: ParsedEntry = {
    title: '',
    priority: 'medium',
    categories: [],
    scope: null,
    description: null,
    focused: false,
  };

  const flagPattern = /\s+-[pcdsf]\b/;
  const firstFlagMatch = raw.match(flagPattern);

  if (!firstFlagMatch || firstFlagMatch.index === undefined) {
    const dashIdx = raw.lastIndexOf(' - ');
    if (dashIdx > 0) {
      result.title = raw.slice(0, dashIdx).trim();
      result.categories = [raw.slice(dashIdx + 3).trim()];
    } else {
      result.title = raw.trim();
    }
    return result;
  }

  result.title = raw.slice(0, firstFlagMatch.index).trim();
  const flagStr = raw.slice(firstFlagMatch.index);
  const tokens = flagStr.trim().split(/\s+/);

  const consumeQuoted = (startIdx: number): { value: string; nextIdx: number } => {
    const first = tokens[startIdx];
    if (first.startsWith('"') && !(first.endsWith('"') && first.length > 1)) {
      const acc: string[] = [first];
      let j = startIdx + 1;
      while (j < tokens.length) {
        acc.push(tokens[j]);
        if (tokens[j].endsWith('"')) break;
        j++;
      }
      return { value: acc.join(' ').replace(/^"|"$/g, ''), nextIdx: j + 1 };
    }
    return { value: first.replace(/^"|"$/g, ''), nextIdx: startIdx + 1 };
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '-p' && i + 1 < tokens.length) {
      const val = PRIORITY_MAP[tokens[i + 1].toLowerCase()];
      if (val) result.priority = val;
      i += 2;
    } else if (token === '-c' && i + 1 < tokens.length) {
      const { value, nextIdx } = consumeQuoted(i + 1);
      if (value.length > 0) result.categories.push(value);
      i = nextIdx;
    } else if (token === '-s' && i + 1 < tokens.length) {
      const val = SCOPE_MAP[tokens[i + 1].toLowerCase()];
      if (val) result.scope = val;
      i += 2;
    } else if (token === '-d' && i + 1 < tokens.length) {
      const { value, nextIdx } = consumeQuoted(i + 1);
      result.description = value;
      i = nextIdx;
    } else if (token === '-f') {
      result.focused = true;
      i += 1;
    } else {
      i += 1;
    }
  }

  return result;
}
