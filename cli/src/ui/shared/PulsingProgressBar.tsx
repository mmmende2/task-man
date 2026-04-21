import { Text } from 'ink';
import { usePulse, MAGENTA_PULSE } from '../hooks/usePulse.js';

interface Props {
  total: number;
  doneToday: number;
  donePrior: number;
  color?: string;
}

const FILLED = '▰';
const EMPTY = '▱';

export function PulsingProgressBar({ total, doneToday, donePrior, color = 'magenta' }: Props) {
  const pulseColor = usePulse({ colors: MAGENTA_PULSE, intervalMs: 400, active: doneToday > 0 });

  if (total === 0) return null;

  const remaining = total - doneToday - donePrior;

  const priorStr = FILLED.repeat(donePrior);
  const todayStr = FILLED.repeat(doneToday);
  const emptyStr = EMPTY.repeat(remaining);

  return (
    <Text>
      <Text dimColor>{donePrior + doneToday}/{total} </Text>
      {donePrior > 0 && <Text color={color}>{priorStr}</Text>}
      {doneToday > 0 && <Text color={pulseColor}>{todayStr}</Text>}
      {remaining > 0 && <Text dimColor>{emptyStr}</Text>}
    </Text>
  );
}
