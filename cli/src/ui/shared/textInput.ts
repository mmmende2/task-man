import type { Key } from 'ink';

/**
 * The one-line text buffer every editable field in the TUI shares.
 *
 * Every field used to be append-only: characters landed at the end and
 * backspace ate from the end, so fixing a typo mid-title meant retyping the
 * rest of it. These helpers give all of them the same cursor.
 *
 * Deliberately NOT handled: forward delete. Ink reports the mac Delete key
 * (0x7f) and fn+Delete (CSI 3~) under the same `key.delete`, so the two cannot
 * be told apart — both stay bound to delete-backwards, which is the one users
 * press constantly.
 */
export interface TextBuffer {
  text: string;
  cursor: number;
}

export type CursorMove = 'left' | 'right' | 'home' | 'end';

/**
 * The cursor move a keypress asks for, or null when it isn't one.
 *
 * Ctrl-A/Ctrl-E are accepted alongside Home/End because plenty of terminals
 * never send Home/End at all, and the readline pair is what fingers already
 * know. (Ink reports ctrl chords with the letter in `input`.)
 */
export function cursorMoveFor(input: string, key: Key): CursorMove | null {
  if (key.leftArrow) return 'left';
  if (key.rightArrow) return 'right';
  if (key.home) return 'home';
  if (key.end) return 'end';
  if (key.ctrl && input === 'a') return 'home';
  if (key.ctrl && input === 'e') return 'end';
  return null;
}

export function moveCursor(buf: TextBuffer, to: CursorMove): TextBuffer {
  const next =
    to === 'left' ? buf.cursor - 1 :
    to === 'right' ? buf.cursor + 1 :
    to === 'home' ? 0 :
    buf.text.length;
  const clamped = Math.max(0, Math.min(buf.text.length, next));
  return clamped === buf.cursor ? buf : { ...buf, cursor: clamped };
}

export function insertChar(buf: TextBuffer, char: string): TextBuffer {
  return {
    text: buf.text.slice(0, buf.cursor) + char + buf.text.slice(buf.cursor),
    cursor: buf.cursor + char.length,
  };
}

/** Delete the character before the cursor. A no-op at the start of the line. */
export function deleteBack(buf: TextBuffer): TextBuffer {
  if (buf.cursor <= 0) return buf;
  return {
    text: buf.text.slice(0, buf.cursor - 1) + buf.text.slice(buf.cursor),
    cursor: buf.cursor - 1,
  };
}

/** True for a keypress that should be inserted as literal text. */
export function isPrintable(input: string, key: Key): boolean {
  return !!input && !key.ctrl && !key.meta && input.length === 1;
}
