import { createContext, useContext, useState, useEffect } from 'react';
import { useStdout } from 'ink';

const MIN_INNER_WIDTH = 52;

export interface TerminalDimensions {
  width: number;
  height: number;
}

const TerminalDimensionsContext = createContext<TerminalDimensions>({
  width: MIN_INNER_WIDTH,
  height: 24,
});

export const TerminalDimensionsProvider = TerminalDimensionsContext.Provider;

/**
 * Setup hook — call once in the root component.
 * Returns terminal dimensions: inner width and raw height.
 */
export function useTerminalDimensionsSetup(): TerminalDimensions {
  const { stdout } = useStdout();

  const getDimensions = (): TerminalDimensions => {
    const width = Math.max(MIN_INNER_WIDTH, (stdout.columns ?? 54) - 2);
    const height = stdout.rows ?? 24;
    return { width, height };
  };

  const [dims, setDims] = useState(getDimensions);

  useEffect(() => {
    const onResize = () => setDims(getDimensions());
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  return dims;
}

/**
 * Consumer hook — returns the inner width (columns - 2 for borders).
 */
export function useTerminalWidth(): number {
  return useContext(TerminalDimensionsContext).width;
}

/**
 * Consumer hook — returns the raw terminal height.
 */
export function useTerminalHeight(): number {
  return useContext(TerminalDimensionsContext).height;
}
