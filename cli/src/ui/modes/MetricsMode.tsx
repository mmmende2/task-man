import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TaskStore } from '../../store.js';
import { buildDayReport } from '../../report.js';
import { getMidDayMessage } from '../../messages.js';
import { renderDayReportHtml } from '../../render-html.js';
import { sendEndOfDayEmail } from '../../email.js';
import { loadConfig } from '../../config.js';
import { ProgressBar } from '../shared/ProgressBar.js';
import { SectionDivider } from '../shared/SectionDivider.js';
import { PriorityDot } from '../shared/PriorityDot.js';
import { BorderRow, BorderRowEmpty } from '../shared/BorderRow.js';

interface Props {
  store: TaskStore;
}

export function MetricsMode({ store }: Props) {
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const report = buildDayReport(store, today);
  const { stats } = report;

  // Focused task progress
  const focusedTasks = store.query({ focused: true });
  const focusedDone = focusedTasks.filter(t => t.status === 'done').length;
  const focusedTotal = focusedTasks.length;
  const progressPercent = focusedTotal > 0 ? Math.round((focusedDone / focusedTotal) * 100) : 0;

  // Parent focused tasks for display
  const focusedActive = focusedTasks.filter(t => t.parent_id === null);

  useInput((input) => {
    if (input === 'e') {
      setEmailStatus('Sending...');
      try {
        const config = loadConfig();
        const html = renderDayReportHtml(report);
        sendEndOfDayEmail(config, html, today)
          .then(() => {
            setEmailStatus('Email sent!');
            setTimeout(() => setEmailStatus(null), 3000);
          })
          .catch((err) => {
            setEmailStatus(`Error: ${(err as Error).message}`);
            setTimeout(() => setEmailStatus(null), 5000);
          });
      } catch (err) {
        setEmailStatus(`Error: ${(err as Error).message}`);
        setTimeout(() => setEmailStatus(null), 5000);
      }
    }
  });

  const statusIcon = (status: string) => {
    if (status === 'done') return '✅';
    if (status === 'in_progress') return '🔄';
    return '☐';
  };

  return (
    <Box flexDirection="column">
      <BorderRowEmpty />

      {/* Progress bar */}
      <BorderRow>
        <Text>  Focus progress  </Text>
        <ProgressBar current={focusedDone} total={focusedTotal} width={16} showPercent color="magenta" />
      </BorderRow>

      <BorderRowEmpty />

      {/* Stats */}
      <BorderRow>
        <Text>  </Text>
        <Text color="green">Completed: {stats.completed}</Text>
        <Text dimColor>  |  </Text>
        <Text color="yellow">In Progress: {stats.inProgress}</Text>
        <Text dimColor>  |  </Text>
        <Text>Todo: {stats.started}</Text>
      </BorderRow>

      {/* Attribution */}
      <BorderRow>
        <Text>  </Text>
        <Text dimColor>You: {stats.completedByHuman}  |  Claude: {stats.completedByClaude}</Text>
      </BorderRow>

      <BorderRowEmpty />

      {/* Focused tasks section */}
      <BorderRow>
        <SectionDivider label="Focused Tasks" />
      </BorderRow>

      {focusedActive.map((task) => (
        <BorderRow key={task.id}>
          <Text>  {statusIcon(task.status)} </Text>
          <PriorityDot priority={task.priority} filled={task.status !== 'todo'} />
          <Text> {task.title} </Text>
          <Text dimColor>[{task.created_by === 'claude' ? 'claude' : 'you'}]</Text>
        </BorderRow>
      ))}

      {focusedActive.length === 0 && (
        <BorderRow>
          <Text dimColor>    No focused tasks.</Text>
        </BorderRow>
      )}

      <BorderRowEmpty />

      {/* Insight */}
      {report.insight && (
        <BorderRow>
          <Text>  💡 </Text>
          <Text color="cyan">{report.insight}</Text>
        </BorderRow>
      )}

      {/* Encouraging message */}
      <BorderRow>
        <Text>  </Text>
        <Text color="yellow">{getMidDayMessage(progressPercent)}</Text>
      </BorderRow>

      {/* Email status */}
      {emailStatus && (
        <BorderRow>
          <Text>  </Text>
          <Text color={emailStatus.startsWith('Error') ? 'red' : 'green'}>{emailStatus}</Text>
        </BorderRow>
      )}

      <BorderRowEmpty />
    </Box>
  );
}
