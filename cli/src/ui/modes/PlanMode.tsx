import { Box, Text, useInput } from 'ink';
import type { Task } from '../../types.js';
import type { TaskStore } from '../../store.js';
import { TaskRow } from '../shared/TaskRow.js';
import { SectionDivider } from '../shared/SectionDivider.js';
import { BorderRow, BorderRowEmpty } from '../shared/BorderRow.js';

interface Props {
  tasks: Task[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  store: TaskStore;
  reload: () => void;
}

export function PlanMode({ tasks, selectedIndex, onSelectedIndexChange, store, reload }: Props) {
  const nonDone = tasks.filter(t => t.status !== 'done');
  const focusedTasks = nonDone.filter(t => t.focused);
  const backlogTasks = nonDone.filter(t => !t.focused);
  const combinedList = [...focusedTasks, ...backlogTasks];

  useInput((input, key) => {
    if (key.downArrow || input === 'j') {
      onSelectedIndexChange(Math.min(selectedIndex + 1, combinedList.length - 1));
    } else if (key.upArrow || input === 'k') {
      onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
    } else if (input === ' ' && combinedList.length > 0) {
      const task = combinedList[selectedIndex];
      if (task) {
        store.update(task.id, { focused: !task.focused }).then(() => reload());
      }
    }
  });

  return (
    <Box flexDirection="column">
      <BorderRowEmpty />

      {/* Focused section */}
      <BorderRow>
        <SectionDivider label={`FOCUSED (${focusedTasks.length})`} />
      </BorderRow>

      {focusedTasks.length === 0 && (
        <BorderRow>
          <Text dimColor>    No focused tasks. Press space to focus.</Text>
        </BorderRow>
      )}

      {focusedTasks.map((task, i) => (
        <BorderRow key={task.id}>
          <TaskRow task={task} isSelected={selectedIndex === i} />
        </BorderRow>
      ))}

      <BorderRowEmpty />

      {/* Backlog section */}
      <BorderRow>
        <SectionDivider label={`BACKLOG (${backlogTasks.length})`} />
      </BorderRow>

      {backlogTasks.length === 0 && (
        <BorderRow>
          <Text dimColor>    No backlog tasks.</Text>
        </BorderRow>
      )}

      {backlogTasks.map((task, i) => {
        const globalIndex = focusedTasks.length + i;
        return (
          <BorderRow key={task.id}>
            <TaskRow task={task} isSelected={selectedIndex === globalIndex} />
          </BorderRow>
        );
      })}

      <BorderRowEmpty />
    </Box>
  );
}
