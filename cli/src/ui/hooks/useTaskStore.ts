import { useState, useCallback, useEffect, useRef } from 'react';
import { getStore } from '../../get-store.js';
import type { Task, TaskFilter } from '../../types.js';

export function useTaskStore(filter?: TaskFilter, pollInterval?: number) {
  const storeRef = useRef(getStore());
  const [tasks, setTasks] = useState<Task[]>([]);

  const reload = useCallback(() => {
    storeRef.current.query(filter).then(setTasks);
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
