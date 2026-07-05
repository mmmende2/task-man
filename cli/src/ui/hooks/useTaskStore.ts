import { useState, useCallback, useEffect, useRef } from 'react';
import { getStore } from '../../get-store.js';
import type { Task, TaskFilter } from '../../types.js';

export function useTaskStore(filter?: TaskFilter, pollInterval?: number) {
  const storeRef = useRef(getStore());
  const [tasks, setTasks] = useState<Task[]>([]);

  const reload = useCallback(() => {
    // Swallow poll failures and keep the last-known list — in remote mode a
    // deploy answers 502 for a few seconds, and an unhandled rejection here
    // crashed the whole TUI. The next 2s tick retries; the footer's server
    // indicator (useServerStatus) is the visible "unreachable" signal.
    storeRef.current.query(filter).then(setTasks).catch(() => {});
  }, [filter]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (pollInterval && pollInterval > 0) {
      const id = setInterval(reload, pollInterval);
      return () => clearInterval(id);
    }
  }, [pollInterval, reload]);

  return { tasks, reload, store: storeRef.current };
}
