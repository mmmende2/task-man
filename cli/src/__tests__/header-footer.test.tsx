import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { Header } from '../ui/shared/Header.js';
import { Footer } from '../ui/shared/Footer.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

describe('Header', () => {
  let cleanup: () => void;

  afterEach(() => cleanup?.());

  it('renders exactly 3 lines', () => {
    const result = renderWithDimensions(
      createElement(Header, { mode: 'focus' }),
      { width: 78 },
    );
    cleanup = result.cleanup;

    expect(result.lines().length).toBe(3);
  });

  it('top border uses ╔ and ╗', () => {
    const result = renderWithDimensions(
      createElement(Header, { mode: 'focus' }),
      { width: 78 },
    );
    cleanup = result.cleanup;
    const line = result.lines()[0];

    expect(line.startsWith('╔')).toBe(true);
    expect(line.endsWith('╗')).toBe(true);
  });

  it('middle line has side borders', () => {
    const result = renderWithDimensions(
      createElement(Header, { mode: 'focus' }),
      { width: 78 },
    );
    cleanup = result.cleanup;
    const line = result.lines()[1];

    expect(line.startsWith('║')).toBe(true);
    expect(line.endsWith('║')).toBe(true);
  });

  it('bottom border uses ╚ and ╝ (self-contained box)', () => {
    const result = renderWithDimensions(
      createElement(Header, { mode: 'focus' }),
      { width: 78 },
    );
    cleanup = result.cleanup;
    const line = result.lines()[2];

    expect(line.startsWith('╚')).toBe(true);
    expect(line.endsWith('╝')).toBe(true);
  });

  it('displays TASK MAN title', () => {
    const result = renderWithDimensions(
      createElement(Header, { mode: 'focus' }),
    );
    cleanup = result.cleanup;

    expect(result.lines()[1]).toContain('TASK MAN');
  });

  it('displays mode label', () => {
    const result = renderWithDimensions(
      createElement(Header, { mode: 'plan' }),
    );
    cleanup = result.cleanup;

    expect(result.lines()[1]).toContain('PLAN');
  });

  it('all lines have consistent width', () => {
    const result = renderWithDimensions(
      createElement(Header, { mode: 'focus' }),
      { width: 60 },
    );
    cleanup = result.cleanup;

    const lengths = result.lines().map(l => l.length);
    // All lines should be the same width (Ink handles this)
    expect(new Set(lengths).size).toBe(1);
  });
});

describe('Footer', () => {
  let cleanup: () => void;

  afterEach(() => cleanup?.());

  it('renders exactly 3 lines', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
      { width: 78 },
    );
    cleanup = result.cleanup;

    expect(result.lines().length).toBe(3);
  });

  it('top border uses ╔ and ╗ (self-contained box)', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
      { width: 78 },
    );
    cleanup = result.cleanup;
    const line = result.lines()[0];

    expect(line.startsWith('╔')).toBe(true);
    expect(line.endsWith('╗')).toBe(true);
  });

  it('bottom border uses ╚ and ╝', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
      { width: 78 },
    );
    cleanup = result.cleanup;
    const line = result.lines()[2];

    expect(line.startsWith('╚')).toBe(true);
    expect(line.endsWith('╝')).toBe(true);
  });

  it('middle line has side borders', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
      { width: 78 },
    );
    cleanup = result.cleanup;
    const line = result.lines()[1];

    expect(line.startsWith('║')).toBe(true);
    expect(line.endsWith('║')).toBe(true);
  });

  it('shows focus mode keybindings', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
    );
    cleanup = result.cleanup;
    const line = result.lines()[1];

    expect(line).toContain('p:plan');
    expect(line).toContain('D:done');
    expect(line).toContain('tab:subtasks');
    expect(line).toContain('S:scope');
  });

  it('shows plan mode keybindings', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'plan' }),
    );
    cleanup = result.cleanup;

    expect(result.lines()[1]).toContain('spc:focus');
  });

  it('shows write mode keybindings', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'write' }),
    );
    cleanup = result.cleanup;

    expect(result.lines()[1]).toContain('esc:back');
  });

  it('shows refresh interval in watch mode', () => {
    const result = renderWithDimensions(
      createElement(Footer, { isWatch: true, interval: 3000 }),
    );
    cleanup = result.cleanup;

    expect(result.lines()[1]).toContain('Refreshing every 3s');
  });

  it('all lines have consistent width', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
      { width: 78 },
    );
    cleanup = result.cleanup;
    const lengths = result.lines().map(l => l.length);

    expect(new Set(lengths).size).toBe(1);
  });
});
