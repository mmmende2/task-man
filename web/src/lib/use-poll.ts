import { useEffect, useRef, useState } from 'react';

/** How often the task views (Focus, Backlog) refetch. Was 2s; at ~700 KB per fetch that was ~26 GB/day per open tab. */
export const TASK_POLL_MS = 10_000;

interface PollState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  failures: number;
  refresh: () => void;
}

/**
 * Poll a fetcher every `intervalMs` while the tab is foregrounded.
 * Pauses when document.hidden — there's no point burning battery
 * polling for tasks while the phone is in your pocket. Re-fires
 * immediately on visibility-change so the view is fresh when you
 * pull the phone back out.
 */
export function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [failures, setFailures] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelRef.current) return;
      try {
        const v = await fetcherRef.current();
        if (cancelRef.current) return;
        setData(v);
        setError(undefined);
        setFailures(0);
      } catch (err) {
        if (cancelRef.current) return;
        setError(err as Error);
        setFailures((n) => n + 1);
      } finally {
        if (!cancelRef.current) setLoading(false);
      }
      schedule();
    };

    const schedule = () => {
      if (document.hidden) return;
      timer = setTimeout(tick, intervalMs);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    tick();

    return () => {
      cancelRef.current = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return {
    data,
    error,
    loading,
    failures,
    refresh: () => {
      fetcherRef.current().then(setData).catch(setError);
    },
  };
}
