import { Box, Text } from 'ink';
import type { Task } from '../../types.js';
import { PriorityDot } from './PriorityDot.js';
import { StatusBadge } from './StatusBadge.js';
import { SubtaskCheckbox } from './SubtaskCheckbox.js';
import { BorderRow } from './BorderRow.js';
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';

interface Props {
  task: Task;
  subtasks: Task[];
}

export function TaskRowExpanded({ task, subtasks }: Props) {
  const width = useTerminalWidth();
  // Inner card width: total width minus outer indent (4 chars: ║ + 2 spaces + ┌/│/└)
  const cardInner = width - 4;

  const titleLine = `─ ${task.title} `;
  // 6 chars reserved for: space + dot + space + ─┐
  const titlePad = Math.max(0, cardInner - titleLine.length - 6);

  // Bottom border: status badge is ~11 chars ("in_progress" is longest), reserve 9 for " ─────┘"
  const bottomDash = Math.max(0, cardInner - 18);

  return (
    <Box flexDirection="column">
      {/* Top border */}
      <BorderRow>
        <Text>  </Text>
        <Text color="white">{'┌' + titleLine + '─'.repeat(titlePad) + ' '}</Text>
        <PriorityDot priority={task.priority} />
        <Text color="white">{' ─┐'}</Text>
      </BorderRow>

      {/* Empty line */}
      <BorderRow>
        <Text>  </Text>
        <Text color="white">{'│'}</Text>
      </BorderRow>

      {/* Description */}
      {task.description && (
        <BorderRow>
          <Text>  </Text>
          <Text color="white">{'│  '}</Text>
          <Text dimColor>{task.description}</Text>
        </BorderRow>
      )}

      {/* Empty line before subtasks */}
      {(task.description || subtasks.length > 0) && (
        <BorderRow>
          <Text>  </Text>
          <Text color="white">{'│'}</Text>
        </BorderRow>
      )}

      {/* Subtasks */}
      {subtasks.map((sub) => (
        <BorderRow key={sub.id}>
          <Text>  </Text>
          <Text color="white">{'│  '}</Text>
          <SubtaskCheckbox subtask={sub} />
        </BorderRow>
      ))}

      {/* Empty line after subtasks */}
      {subtasks.length > 0 && (
        <BorderRow>
          <Text>  </Text>
          <Text color="white">{'│'}</Text>
        </BorderRow>
      )}

      {/* Bottom border with status */}
      <BorderRow>
        <Text>  </Text>
        <Text color="white">{'└' + '─'.repeat(bottomDash) + ' '}</Text>
        <StatusBadge status={task.status} />
        <Text color="white">{' ─────┘'}</Text>
      </BorderRow>
    </Box>
  );
}
