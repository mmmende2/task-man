import { describe, it, expect } from 'vitest';
// Import via the same package path the Capture page uses. This test
// also acts as a wire check: it fails loudly if the cli's
// task-man/parse-entry export goes missing.
import { parseWriteInput } from 'task-man/parse-entry';

describe('parseWriteInput (web wire-up)', () => {
  it('defaults priority to medium, NOT high', () => {
    const p = parseWriteInput('plain title');
    expect(p.priority).toBe('medium');
  });

  it('parses the example from the plan', () => {
    const p = parseWriteInput('clean dishes -c housework -p high -s personal');
    expect(p.title).toBe('clean dishes');
    expect(p.priority).toBe('high');
    expect(p.scope).toBe('personal');
    expect(p.categories).toEqual(['housework']);
  });

  it('honors priority aliases', () => {
    expect(parseWriteInput('x -p l').priority).toBe('low');
    expect(parseWriteInput('x -p med').priority).toBe('medium');
    expect(parseWriteInput('x -p u').priority).toBe('high');
    expect(parseWriteInput('x -p urgent').priority).toBe('high');
  });

  it('supports quoted category names with spaces', () => {
    const p = parseWriteInput('write -c "deep work"');
    expect(p.categories).toEqual(['deep work']);
  });

  it('supports the bare "title - category" shorthand', () => {
    const p = parseWriteInput('buy milk - groceries');
    expect(p.title).toBe('buy milk');
    expect(p.categories).toEqual(['groceries']);
  });

  it('parses -f as focused', () => {
    expect(parseWriteInput('big task -f').focused).toBe(true);
  });
});
