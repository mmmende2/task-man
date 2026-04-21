import { useState, useEffect } from 'react';

export const MAGENTA_PULSE = ['#ff79c6', '#cc5fa0', '#993f7a', '#cc5fa0'];
export const CYAN_PULSE = ['#00ffff', '#00cccc', '#009999', '#00cccc'];

interface Options {
  colors?: readonly string[];
  intervalMs?: number;
  active?: boolean;
}

export function usePulse({
  colors = MAGENTA_PULSE,
  intervalMs = 400,
  active = true,
}: Options = {}): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % colors.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, colors.length]);

  return colors[index % colors.length];
}
