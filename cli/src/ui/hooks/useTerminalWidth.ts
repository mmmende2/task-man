import { createContext, useContext, useState, useEffect } from 'react';
import { useStdout } from 'ink';

const MIN_INNER_WIDTH = 52;

const TerminalWidthContext = createContext<number>(MIN_INNER_WIDTH);

/**
 * Provider component — call useTerminalWidthSetup() at the app root
 * and pass the result to TerminalWidthProvider.
 */
export const TerminalWidthProvider = TerminalWidthContext.Provider;

/**
 * Setup hook — call once in the root component.
 * Returns the current inner width (columns - 2 for borders).
 * Listens for resize events.
 */
export function useTerminalWidthSetup(): number {
  const { stdout } = useStdout();

  const getWidth = () => Math.max(MIN_INNER_WIDTH, (stdout.columns ?? 54) - 2);

  const [width, setWidth] = useState(getWidth);

  useEffect(() => {
    const onResize = () => setWidth(getWidth());
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  return width;
}

/**
 * Consumer hook — call in any child component to read the terminal width.
 */
export function useTerminalWidth(): number {
  return useContext(TerminalWidthContext);
}
