import { Text } from 'ink';

interface Props {
  /** Session hex color (resolved via getSessionHexColor). */
  color: string;
  /** True while the session's process is alive: filled ◉ vs hollow dim ○. */
  active: boolean;
  /** Live session's display name — shown dimmed after the dot. */
  name?: string | null;
}

export function SessionDot({ color, active, name }: Props) {
  return (
    <>
      <Text color={color} dimColor={!active}>{active ? ' ◉' : ' ○'}</Text>
      {name && <Text dimColor> {name}</Text>}
    </>
  );
}
