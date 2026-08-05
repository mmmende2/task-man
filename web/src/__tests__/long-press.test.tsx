import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useLongPress } from '../lib/use-long-press';

function Row({ onHold, onTap }: { onHold: () => void; onTap: () => void }) {
  const longPress = useLongPress(onHold, 400);
  return (
    <button onClick={onTap} {...longPress}>
      row
    </button>
  );
}

/** jsdom has no PointerEvent constructor; MouseEvent carries what we read. */
function pointer(type: string, el: Element, x = 0, y = 0, button = 0) {
  el.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button }),
  );
}

function setup() {
  const onHold = vi.fn();
  const onTap = vi.fn();
  render(<Row onHold={onHold} onTap={onTap} />);
  return { onHold, onTap, row: screen.getByRole('button') };
}

describe('useLongPress', () => {
  it('fires after the hold, and swallows the tap that follows the release', () => {
    vi.useFakeTimers();
    const { onHold, onTap, row } = setup();

    pointer('pointerdown', row);
    act(() => { vi.advanceTimersByTime(450); });
    expect(onHold).toHaveBeenCalledTimes(1);

    pointer('pointerup', row);
    pointer('click', row);
    // Without the click guard, holding a row would edit it AND toggle it.
    expect(onTap).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('leaves a short tap alone', () => {
    vi.useFakeTimers();
    const { onHold, onTap, row } = setup();

    pointer('pointerdown', row);
    act(() => { vi.advanceTimersByTime(120); });
    pointer('pointerup', row);
    pointer('click', row);

    expect(onHold).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('loses to a scroll — movement past the slop cancels the hold', () => {
    vi.useFakeTimers();
    const { onHold, onTap, row } = setup();

    pointer('pointerdown', row, 0, 0);
    act(() => { vi.advanceTimersByTime(100); });
    pointer('pointermove', row, 0, 40); // finger flicked the list
    act(() => { vi.advanceTimersByTime(500); });

    expect(onHold).not.toHaveBeenCalled();
    pointer('pointerup', row);
    pointer('click', row);
    expect(onTap).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('survives jitter inside the slop', () => {
    vi.useFakeTimers();
    const { onHold, row } = setup();

    pointer('pointerdown', row, 0, 0);
    act(() => { vi.advanceTimersByTime(100); });
    pointer('pointermove', row, 3, 4); // 5px — a thumb resting, not a scroll
    act(() => { vi.advanceTimersByTime(400); });

    expect(onHold).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('ignores non-primary buttons', () => {
    vi.useFakeTimers();
    const { onHold, row } = setup();

    pointer('pointerdown', row, 0, 0, 2); // right click
    act(() => { vi.advanceTimersByTime(500); });

    expect(onHold).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
