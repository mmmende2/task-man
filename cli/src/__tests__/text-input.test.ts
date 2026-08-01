import { describe, it, expect } from 'vitest';
import type { Key } from 'ink';
import {
  cursorMoveFor,
  moveCursor,
  insertChar,
  deleteBack,
  isPrintable,
} from '../ui/shared/textInput.js';

/** A Key with every flag off, so each test only sets what it means. */
function key(over: Partial<Key> = {}): Key {
  return {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, home: false, end: false,
    return: false, escape: false, ctrl: false, shift: false, tab: false,
    backspace: false, delete: false, meta: false,
    ...over,
  } as Key;
}

describe('cursorMoveFor', () => {
  it('maps the arrow keys', () => {
    expect(cursorMoveFor('', key({ leftArrow: true }))).toBe('left');
    expect(cursorMoveFor('', key({ rightArrow: true }))).toBe('right');
  });

  it('maps Home/End and their readline equivalents', () => {
    expect(cursorMoveFor('', key({ home: true }))).toBe('home');
    expect(cursorMoveFor('', key({ end: true }))).toBe('end');
    // Plenty of terminals never send Home/End, so Ctrl-A/Ctrl-E stand in.
    expect(cursorMoveFor('a', key({ ctrl: true }))).toBe('home');
    expect(cursorMoveFor('e', key({ ctrl: true }))).toBe('end');
  });

  it('returns null for text and unrelated keys', () => {
    expect(cursorMoveFor('a', key())).toBeNull();
    expect(cursorMoveFor('e', key())).toBeNull();
    expect(cursorMoveFor('', key({ tab: true }))).toBeNull();
  });
});

describe('moveCursor', () => {
  const buf = { text: 'hello', cursor: 2 };

  it('moves within the line', () => {
    expect(moveCursor(buf, 'left').cursor).toBe(1);
    expect(moveCursor(buf, 'right').cursor).toBe(3);
    expect(moveCursor(buf, 'home').cursor).toBe(0);
    expect(moveCursor(buf, 'end').cursor).toBe(5);
  });

  it('clamps at both ends', () => {
    expect(moveCursor({ text: 'hi', cursor: 0 }, 'left').cursor).toBe(0);
    expect(moveCursor({ text: 'hi', cursor: 2 }, 'right').cursor).toBe(2);
  });

  it('returns the same object when nothing moves', () => {
    const at0 = { text: 'hi', cursor: 0 };
    expect(moveCursor(at0, 'home')).toBe(at0);
  });
});

describe('insertChar', () => {
  it('inserts at the cursor, not the end', () => {
    expect(insertChar({ text: 'helo', cursor: 3 }, 'l')).toEqual({ text: 'hello', cursor: 4 });
  });

  it('keeps spaces — the bug that made a typed space look like a dead key', () => {
    expect(insertChar({ text: 'ab', cursor: 2 }, ' ')).toEqual({ text: 'ab ', cursor: 3 });
  });
});

describe('deleteBack', () => {
  it('deletes before the cursor', () => {
    expect(deleteBack({ text: 'hello', cursor: 3 })).toEqual({ text: 'helo', cursor: 2 });
  });

  it('is a no-op at the start of the line', () => {
    const at0 = { text: 'hi', cursor: 0 };
    expect(deleteBack(at0)).toBe(at0);
  });
});

describe('isPrintable', () => {
  it('accepts single characters including space', () => {
    expect(isPrintable('a', key())).toBe(true);
    expect(isPrintable(' ', key())).toBe(true);
  });

  it('rejects chords and empty input', () => {
    expect(isPrintable('a', key({ ctrl: true }))).toBe(false);
    expect(isPrintable('a', key({ meta: true }))).toBe(false);
    expect(isPrintable('', key())).toBe(false);
  });
});
