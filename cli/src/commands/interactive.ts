import { render } from 'ink';
import { createElement } from 'react';
import { InteractiveApp } from '../ui/InteractiveApp.js';
import { consumeExitOutput } from '../ui/exitOutput.js';
import { ApiError } from '../api-client.js';
import { initDebugLog, debugLog } from '../debug-log.js';

export function launchInteractive(opts: { debug?: boolean } = {}) {
  if (opts.debug) initDebugLog();

  // Last-resort net for remote mode: a fire-and-forget store call that
  // rejects (server restarting mid-deploy, wifi blip) must not hard-crash
  // the TUI. Swallow only transport-shaped errors — the 2s poll re-syncs
  // the visible state either way. Anything else is a real bug and should
  // still crash loudly.
  process.on('unhandledRejection', (err) => {
    const transient =
      err instanceof ApiError ||
      err instanceof TypeError ||
      (err instanceof Error && /unreachable|Cannot reach|Access denied/.test(err.message));
    debugLog('unhandledRejection', { transient, message: err instanceof Error ? err.message : String(err) });
    if (!transient) throw err;
  });

  const { waitUntilExit } = render(createElement(InteractiveApp, {}));
  waitUntilExit()
    .catch(() => {})
    .finally(() => {
      const out = consumeExitOutput();
      if (out) process.stdout.write(out);
    });
}
