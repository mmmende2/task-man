import { Box, Text } from 'ink';
import type { Connection } from '../hooks/useTaskStore.js';

interface Props {
  connection: Connection;
}

/**
 * The mid-session half of ConnectionGate.
 *
 * Once tasks have loaded, losing the connection must NOT blank the list — a
 * deploy makes the edge answer 502 for a few seconds and the stale list is
 * more useful than an empty one. But the list is now a snapshot, and edits
 * are not landing on the server. Say so, loudly and continuously, because
 * the alternative is a screen that looks exactly like a working one.
 */
export function StatusBanner({ connection }: Props) {
  if (connection.state !== 'failed') return null;

  const login = connection.kind === 'unauthenticated' || connection.kind === 'no-cloudflared';
  const color = login ? 'red' : 'yellow';
  const headline = login ? 'DISCONNECTED — not logged in' : 'DISCONNECTED — server unreachable';
  // No key hint here: `r` is Refine once the app is up, and the poll keeps
  // running in the background, so recovery is automatic either way.
  const action = login ? 'Run `task-man login` to reconnect.' : 'Retrying…';

  return (
    <Box borderStyle="round" borderColor={color} flexShrink={0} paddingX={1}>
      <Text color={color} bold>{headline}</Text>
      <Text dimColor>{'  '}Showing the last-known list; changes are not being saved. {action}</Text>
    </Box>
  );
}
