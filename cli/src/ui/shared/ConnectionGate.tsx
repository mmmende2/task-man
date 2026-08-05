import { Box, Text, useInput } from 'ink';
import type { Connection } from '../hooks/useTaskStore.js';

interface Props {
  connection: Connection;
  onRetry: () => void;
}

interface Copy {
  heading: string;
  color: string;
  detail: string;
  /** Ordered steps the user can actually take. */
  steps: string[];
}

function copyFor(conn: Connection): Copy {
  switch (conn.state) {
    case 'connecting':
      return {
        heading: `Connecting to ${conn.url}`,
        color: 'cyan',
        detail: 'Checking your session…',
        steps: [],
      };
    case 'misconfigured':
      return {
        heading: 'Store is misconfigured',
        color: 'red',
        detail: conn.message,
        steps: ['task-man whoami   — show what this client is pointed at'],
      };
    case 'failed':
      if (conn.kind === 'no-cloudflared') {
        return {
          heading: 'cloudflared is not installed',
          color: 'red',
          detail: `It is required to authenticate to ${conn.url}.`,
          steps: ['brew install cloudflared', 'task-man login', 'this screen reconnects on its own, or press r'],
        };
      }
      if (conn.kind === 'unauthenticated') {
        return {
          heading: 'You are not logged in',
          color: 'yellow',
          detail: `${conn.url} rejected this session. Your tasks are on the server — none are missing.`,
          steps: ['task-man login   — run it in another terminal', 'this screen reconnects on its own, or press r'],
        };
      }
      return {
        heading: `Can't reach ${conn.url}`,
        color: 'yellow',
        detail: conn.message,
        steps: ['Retrying automatically — or press r to retry now'],
      };
    // Never gated on: the app renders normally.
    case 'local':
    case 'connected':
      return { heading: '', color: 'white', detail: '', steps: [] };
  }
}

/**
 * What remote mode shows instead of a task list before its first successful
 * load.
 *
 * The bug this exists for: a failed load left `tasks` at `[]` and the app
 * rendered a perfectly normal, perfectly empty list. "Not logged in" and "you
 * have no tasks" looked identical, and the empty one is the reading everybody
 * reaches for first. An unreachable store must never be able to render as
 * data.
 */
export function ConnectionGate({ connection, onRetry }: Props) {
  const { heading, color, detail, steps } = copyFor(connection);

  useInput((input) => {
    if (input === 'r') onRetry();
    if (input === 'q') process.exit(0);
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box borderStyle="round" borderColor={color} flexDirection="column" paddingX={2} paddingY={1}>
        <Text color={color} bold>{heading}</Text>
        <Box marginTop={1}>
          <Text wrap="wrap">{detail}</Text>
        </Box>
        {steps.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            {steps.map((s) => (
              <Text key={s} color="cyan">  {s}</Text>
            ))}
          </Box>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>  r:retry  q:quit</Text>
      </Box>
    </Box>
  );
}
