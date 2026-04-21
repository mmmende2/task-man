import { render } from 'ink';
import { createElement } from 'react';
import { InteractiveApp } from '../ui/InteractiveApp.js';
import { consumeExitOutput } from '../ui/exitOutput.js';

export function launchInteractive() {
  const { waitUntilExit } = render(createElement(InteractiveApp, {}));
  waitUntilExit()
    .catch(() => {})
    .finally(() => {
      const out = consumeExitOutput();
      if (out) process.stdout.write(out);
    });
}
