import { useRef } from 'react';

interface UndoEntry {
  undo: () => Promise<void>;
}

const MAX_UNDO = 10;

export function useUndoStack() {
  const stackRef = useRef<UndoEntry[]>([]);

  const push = (entry: UndoEntry) => {
    stackRef.current.push(entry);
    if (stackRef.current.length > MAX_UNDO) {
      stackRef.current.shift();
    }
  };

  const pop = async (): Promise<boolean> => {
    const entry = stackRef.current.pop();
    if (!entry) return false;
    await entry.undo();
    return true;
  };

  const clear = () => {
    stackRef.current = [];
  };

  return { push, pop, clear };
}
