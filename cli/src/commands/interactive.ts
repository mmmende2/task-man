import { render } from 'ink';
import { createElement } from 'react';
import { InteractiveApp } from '../ui/InteractiveApp.js';

export function launchInteractive() {
  const { waitUntilExit } = render(createElement(InteractiveApp, {}));
  waitUntilExit().catch(() => {});
}
