import { useRef, useEffect, useCallback } from 'react';
import { useInput } from 'ink';

export type VimMode = 'normal' | 'insert' | 'holding';

export type VimAction =
  | { type: 'move'; direction: 'up' | 'down' }
  | { type: 'cut' }
  | { type: 'paste'; above: boolean }
  | { type: 'edit'; variant: 'start' | 'end' | 'clear' }
  | { type: 'create'; above: boolean }
  | { type: 'mark-done' }
  | { type: 'undo' }
  | { type: 'search' }
  | { type: 'cancel' }
  | { type: 'toggle-focus' }
  | { type: 'tab' };

export interface UseVimKeysOptions {
  isActive: boolean;
  onAction: (action: VimAction) => void;
  onInsertChar?: (char: string) => void;
  onInsertBackspace?: () => void;
  onInsertEnter?: () => void;
  onInsertEscape?: () => void;
}

const SEQUENCE_TIMEOUT = 300;

export function useVimKeys(
  vimMode: VimMode,
  setVimMode: (mode: VimMode) => void,
  options: UseVimKeysOptions,
) {
  // Refs only for state mutated inside the handler itself (between renders)
  const keyBufferRef = useRef('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBuffer = useCallback(() => {
    keyBufferRef.current = '';
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useInput((input, key) => {
    if (!options.isActive) return;

    // --- Insert mode ---
    if (vimMode === 'insert') {
      if (key.escape) {
        options.onInsertEscape?.();
      } else if (key.return) {
        options.onInsertEnter?.();
      } else if (key.backspace || key.delete) {
        options.onInsertBackspace?.();
      } else if (input && !key.ctrl && !key.meta) {
        options.onInsertChar?.(input);
      }
      return;
    }

    // --- Holding mode ---
    if (vimMode === 'holding') {
      if (input === 'p') {
        options.onAction({ type: 'paste', above: false });
      } else if (input === 'P') {
        options.onAction({ type: 'paste', above: true });
      } else if (key.escape) {
        options.onAction({ type: 'cancel' });
      }
      return;
    }

    // --- Normal mode ---
    const buffer = keyBufferRef.current;

    // Check for second key in sequence
    if (buffer === 'd' && input === 'd') {
      clearBuffer();
      options.onAction({ type: 'cut' });
      return;
    }
    if (buffer === 'c' && input === 'c') {
      clearBuffer();
      options.onAction({ type: 'edit', variant: 'clear' });
      return;
    }

    // If buffer has a pending key but this isn't the expected follow-up, clear it
    if (buffer) {
      clearBuffer();
    }

    // Start a sequence
    if (input === 'd' || input === 'c') {
      keyBufferRef.current = input;
      timeoutRef.current = setTimeout(() => {
        keyBufferRef.current = '';
        timeoutRef.current = null;
      }, SEQUENCE_TIMEOUT);
      return;
    }

    // Single-key actions
    if (key.downArrow || input === 'j') {
      options.onAction({ type: 'move', direction: 'down' });
    } else if (key.upArrow || input === 'k') {
      options.onAction({ type: 'move', direction: 'up' });
    } else if (input === 'i') {
      options.onAction({ type: 'edit', variant: 'start' });
    } else if (input === 'A') {
      options.onAction({ type: 'edit', variant: 'end' });
    } else if (input === 'o') {
      options.onAction({ type: 'create', above: false });
    } else if (input === 'O') {
      options.onAction({ type: 'create', above: true });
    } else if (input === 'x') {
      options.onAction({ type: 'mark-done' });
    } else if (input === 'u') {
      options.onAction({ type: 'undo' });
    } else if (input === '/') {
      options.onAction({ type: 'search' });
    } else if (input === ' ') {
      options.onAction({ type: 'toggle-focus' });
    } else if (key.tab && !key.shift) {
      options.onAction({ type: 'tab' });
    } else if (key.escape) {
      options.onAction({ type: 'cancel' });
    }
  });
}
