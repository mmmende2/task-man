import { useState, useCallback, useEffect, useRef } from 'react';
import { TaskStore } from '../../store.js';
import type { Task, TaskFilter } from '../../types.js';

export function useTaskStore(filter?: TaskFilter, pollInterval?: number) {
  const storeRef = useRef(new TaskStore());
  const [tasks, setTasks] = useState<Task[]>(() => storeRef.current.query(filter));

  const reload = useCallback(() => {
    setTasks(storeRef.current.query(filter));
  }, [filter]);

  useEffect(() => {
    if (pollInterval && pollInterval > 0) {
      const id = setInterval(reload, pollInterval);
      return () => clearInterval(id);
    }
  }, [pollInterval, reload]);

  return { tasks, reload, store: storeRef.current };
}
