import { useState, useEffect } from 'react';
import { Text } from 'ink';

interface Props {
  total: number;
  doneToday: number;
  donePrior: number;
  color?: string;
}

const FILLED = '▰';
const EMPTY = '▱';

// Brightness cycle for pulsing: bright → dim → bright
const PULSE_COLORS = ['#ff79c6', '#cc5fa0', '#993f7a', '#cc5fa0'];

export function PulsingProgressBar({ total, doneToday, donePrior, color = 'magenta' }: Props) {
  const [pulseIndex, setPulseIndex] = useState(0);

  useEffect(() => {
    if (doneToday === 0) return;
    const timer = setInterval(() => {
      setPulseIndex(i => (i + 1) % PULSE_COLORS.length);
    }, 400);
    return () => clearInterval(timer);
  }, [doneToday]);

  if (total === 0) return null;

  const remaining = total - doneToday - donePrior;

  // Build segments: prior (solid) | today (pulsing) | remaining (empty)
  const priorStr = FILLED.repeat(donePrior);
  const todayStr = FILLED.repeat(doneToday);
  const emptyStr = EMPTY.repeat(remaining);

  return (
    <Text>
      <Text dimColor>{donePrior + doneToday}/{total} </Text>
      {donePrior > 0 && <Text color={color}>{priorStr}</Text>}
      {doneToday > 0 && <Text color={PULSE_COLORS[pulseIndex]}>{todayStr}</Text>}
      {remaining > 0 && <Text dimColor>{emptyStr}</Text>}
    </Text>
  );
}
