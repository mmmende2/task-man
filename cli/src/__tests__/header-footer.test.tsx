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
      { width: 120 },
    );
    cleanup = result.cleanup;

    expect(result.lines().length).toBe(3);
  });

  it('top border uses ╔ and ╗', () => {
    const result = renderWithDimensions(
      createElement(Header, { mode: 'focus' }),
      { width: 120 },
    );
    cleanup = result.cleanup;
    const line = result.lines()[0];

    expect(line.startsWith('╔')).toBe(true);
    expect(line.endsWith('╗')).toBe(true);
  });

  it('middle line has side borders', () => {
    const result = renderWithDimensions(
      createElement(Header, { mode: 'focus' }),
      { width: 120 },
    );
    cleanup = result.cleanup;
    const line = result.lines()[1];

    expect(line.startsWith('║')).toBe(true);
    expect(line.endsWith('║')).toBe(true);
  });

  it('bottom border uses ╚ and ╝ (self-contained box)', () => {
    const result = renderWithDimensions(
      createElement(Header, { mode: 'focus' }),
      { width: 120 },
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

  it('renders exactly 4 lines', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
      { width: 120 },
    );
    cleanup = result.cleanup;

    const lines = result.lines().filter(l => l.length > 0);
    expect(lines.length).toBe(4);
  });

  it('top border uses ╔ and ╗ (self-contained box)', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
      { width: 120 },
    );
    cleanup = result.cleanup;
    const line = result.lines()[0];

    expect(line.startsWith('╔')).toBe(true);
    expect(line.endsWith('╗')).toBe(true);
  });

  it('bottom border uses ╚ and ╝', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
      { width: 120 },
    );
    cleanup = result.cleanup;
    const lines = result.lines().filter(l => l.length > 0);
    const line = lines[lines.length - 1];

    expect(line.startsWith('╚')).toBe(true);
    expect(line.endsWith('╝')).toBe(true);
  });

  it('middle line has side borders', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
      { width: 120 },
    );
    cleanup = result.cleanup;
    const line = result.lines()[1];

    expect(line.startsWith('║')).toBe(true);
    expect(line.endsWith('║')).toBe(true);
  });

  it('shows focus mode keybindings', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'focus' }),
      { width: 200 },
    );
    cleanup = result.cleanup;
    const navLine = result.lines()[1];
    const pageLine = result.lines()[2];

    expect(navLine).toContain('t:triage');
    expect(navLine).toContain('~:scope');
    expect(pageLine).toContain('x:done');
    expect(pageLine).toContain('tab:sub');
  });

  it('shows plan mode keybindings', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'plan' }),
    );
    cleanup = result.cleanup;

    expect(result.lines()[2]).toContain('spc:focus');
  });

  it('shows write mode keybindings (capture)', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'write', writeSubMode: 'capture' }),
    );
    cleanup = result.cleanup;

    expect(result.lines()[1]).toContain('esc:review');
    expect(result.lines()[2]).toContain('tab:accept');
  });

  it('shows write mode keybindings (review)', () => {
    const result = renderWithDimensions(
      createElement(Footer, { mode: 'write', writeSubMode: 'review' }),
    );
    cleanup = result.cleanup;

    expect(result.lines()[1]).toContain('w:capture');
    expect(result.lines()[2]).toContain('jk:nav');
    expect(result.lines()[2]).toContain('tab:sub');
    expect(result.lines()[2]).not.toContain('x:done');
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
      { width: 120 },
    );
    cleanup = result.cleanup;
    const lengths = result.lines().map(l => l.length);

    expect(new Set(lengths).size).toBe(1);
  });
});
