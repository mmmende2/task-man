import { render } from 'ink-testing-library';
import { createElement } from 'react';
import stripAnsi from 'strip-ansi';
import { TerminalDimensionsProvider } from '../../ui/hooks/useTerminalWidth.js';
import type { TerminalDimensions } from '../../ui/hooks/useTerminalWidth.js';

const DEFAULT_DIMS: TerminalDimensions = { width: 78, height: 24 };

export function renderWithDimensions(
  element: React.ReactElement,
  dims: Partial<TerminalDimensions> = {},
) {
  const merged = { ...DEFAULT_DIMS, ...dims };
  const instance = render(
    createElement(TerminalDimensionsProvider, { value: merged }, element),
  );
  return {
    stdin: instance.stdin,
    lastFrame: () => instance.lastFrame(),
    cleanup: () => instance.cleanup(),
    /** Return lines of the last frame, ANSI stripped */
    lines(): string[] {
      const frame = instance.lastFrame();
      if (!frame) return [];
      return stripAnsi(frame).split('\n');
    },
    /** Return raw last frame, ANSI stripped */
    text(): string {
      return stripAnsi(instance.lastFrame() ?? '');
    },
    /** Return raw last frame with ANSI codes preserved */
    rawText(): string {
      return instance.lastFrame() ?? '';
    },
    /** Return lines of the last frame with ANSI codes preserved */
    rawLines(): string[] {
      const frame = instance.lastFrame();
      if (!frame) return [];
      return frame.split('\n');
    },
  };
}
