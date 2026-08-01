import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';

/** Movement past this many pixels means the finger is scrolling, not holding. */
const SLOP_PX = 10;
const DEFAULT_HOLD_MS = 450;

/**
 * Press-and-hold on a row that also responds to tap.
 *
 * Two things make this more than a setTimeout. The hold has to lose to a
 * scroll — a list row is the thing your finger lands on to flick the page, so
 * any real movement cancels it. And once it fires, the tap that arrives on
 * release has to be swallowed, or holding a row would fire the hold action and
 * then immediately toggle the row underneath it.
 *
 * Spread the returned props onto the element. Pair with `touch-action:
 * manipulation` and `-webkit-touch-callout: none` in CSS so iOS doesn't raise
 * its own selection callout over the gesture.
 */
export function useLongPress(onLongPress: () => void, holdMs: number = DEFAULT_HOLD_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return; // right/middle click isn't a hold
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onLongPress();
      }, holdMs);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (!timer.current || !origin.current) return;
      const dx = e.clientX - origin.current.x;
      const dy = e.clientY - origin.current.y;
      if (dx * dx + dy * dy > SLOP_PX * SLOP_PX) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClickCapture: (e: ReactMouseEvent) => {
      if (!fired.current) return;
      // The hold already acted — don't let the release also count as a tap.
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    },
    // Android's long-press and a desktop right-click both land here; neither
    // should open a menu over a row whose hold gesture we've claimed.
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };
}
