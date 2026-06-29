import { useRef, useEffect, useCallback } from 'react';
import { useInput } from 'ink';

export type VimMode = 'normal' | 'insert' | 'holding';

export type VimAction =
  | { type: 'move'; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'jump'; to: 'top' | 'bottom' }
  | { type: 'cut' }
  | { type: 'paste'; above: boolean }
  | { type: 'edit'; variant: 'start' | 'end' }
  | { type: 'edit-date' }
  | { type: 'edit-description' }
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
  const keyBufferRef = useRef('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs so the useInput handler always reads the latest values without
  // depending on Ink re-registering the callback after every render.
  const vimModeRef = useRef(vimMode);
  vimModeRef.current = vimMode;
  const optionsRef = useRef(options);
  optionsRef.current = options;

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
    const mode = vimModeRef.current;
    const opts = optionsRef.current;

    if (!opts.isActive) return;

    // --- Insert mode ---
    if (mode === 'insert') {
      if (key.escape) {
        opts.onInsertEscape?.();
      } else if (key.return) {
        opts.onInsertEnter?.();
      } else if (key.backspace || key.delete) {
        opts.onInsertBackspace?.();
      } else if (input && !key.ctrl && !key.meta) {
        opts.onInsertChar?.(input);
      }
      return;
    }

    // --- Holding mode ---
    if (mode === 'holding') {
      if (key.downArrow || input === 'j') {
        opts.onAction({ type: 'move', direction: 'down' });
      } else if (key.upArrow || input === 'k') {
        opts.onAction({ type: 'move', direction: 'up' });
      } else if (input === 'p') {
        opts.onAction({ type: 'paste', above: false });
      } else if (input === 'P') {
        opts.onAction({ type: 'paste', above: true });
      } else if (key.escape) {
        opts.onAction({ type: 'cancel' });
      }
      return;
    }

    // --- Normal mode ---
    const buffer = keyBufferRef.current;

    // Check for second key in sequence
    if (buffer === 'd' && input === 'd') {
      clearBuffer();
      opts.onAction({ type: 'cut' });
      return;
    }
    if (buffer === 'g' && input === 'g') {
      clearBuffer();
      opts.onAction({ type: 'jump', to: 'top' });
      return;
    }

    // If buffer has a pending key but this isn't the expected follow-up, clear it
    if (buffer) {
      clearBuffer();
    }

    // Start a sequence
    if (input === 'd' || input === 'g') {
      keyBufferRef.current = input;
      timeoutRef.current = setTimeout(() => {
        keyBufferRef.current = '';
        timeoutRef.current = null;
      }, SEQUENCE_TIMEOUT);
      return;
    }

    // Single-key actions
    if (key.downArrow || input === 'j') {
      opts.onAction({ type: 'move', direction: 'down' });
    } else if (key.upArrow || input === 'k') {
      opts.onAction({ type: 'move', direction: 'up' });
    } else if (key.leftArrow || input === 'h') {
      opts.onAction({ type: 'move', direction: 'left' });
    } else if (key.rightArrow || input === 'l') {
      opts.onAction({ type: 'move', direction: 'right' });
    } else if (input === 'i') {
      opts.onAction({ type: 'edit', variant: 'start' });
    } else if (input === 'A') {
      opts.onAction({ type: 'edit', variant: 'end' });
    } else if (input === 'o') {
      opts.onAction({ type: 'create', above: false });
    } else if (input === 'O') {
      opts.onAction({ type: 'create', above: true });
    } else if (input === 'D') {
      opts.onAction({ type: 'edit-date' });
    } else if (input === 'e') {
      opts.onAction({ type: 'edit-description' });
    } else if (input === 'x') {
      opts.onAction({ type: 'mark-done' });
    } else if (input === 'G') {
      opts.onAction({ type: 'jump', to: 'bottom' });
    } else if (input === 'u') {
      opts.onAction({ type: 'undo' });
    } else if (input === '/') {
      opts.onAction({ type: 'search' });
    } else if (input === ' ') {
      opts.onAction({ type: 'toggle-focus' });
    } else if (key.tab && !key.shift) {
      opts.onAction({ type: 'tab' });
    } else if (key.escape) {
      opts.onAction({ type: 'cancel' });
    }
  });
}
