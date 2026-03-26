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

interface Props {
  store: TaskStore;
}

export function MetricsMode({ store }: Props) {
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const report = buildDayReport(store, today);
  const { stats } = report;

  const focusedTasks = store.query({ focused: true });
  const focusedDone = focusedTasks.filter(t => t.status === 'done').length;
  const focusedTotal = focusedTasks.length;
  const progressPercent = focusedTotal > 0 ? Math.round((focusedDone / focusedTotal) * 100) : 0;

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
    if (status === 'done') return '[x]';
    if (status === 'in_progress') return '[~]';
    return '[ ]';
  };

  const focusedRows = focusedActive.length === 0
    ? [<Text key="no-focused" dimColor>    No focused tasks.</Text>]
    : focusedActive.map((task) => (
        <Box key={task.id}>
          <Text>  {statusIcon(task.status)} </Text>
          <PriorityDot priority={task.priority} filled={task.status !== 'todo'} />
          <Text> {task.title} </Text>
          <Text dimColor>[{task.created_by === 'claude' ? 'claude' : 'you'}]</Text>
        </Box>
      ));

  const insightRow = report.insight
    ? <Box key="insight"><Text>  {'>>>'} </Text><Text color="cyan">{report.insight}</Text></Box>
    : null;

  const emailRow = emailStatus
    ? <Box key="email"><Text>  </Text><Text color={emailStatus.startsWith('Error') ? 'red' : 'green'}>{emailStatus}</Text></Box>
    : null;

  return (
    <Box flexDirection="column">
      <Text> </Text>

      <Box>
        <Text>  Focus progress  </Text>
        <ProgressBar current={focusedDone} total={focusedTotal} width={16} showPercent color="magenta" />
      </Box>

      <Text> </Text>

      <Box>
        <Text>  </Text>
        <Text color="green">Completed: {stats.completed}</Text>
        <Text dimColor>  |  </Text>
        <Text color="yellow">In Progress: {stats.inProgress}</Text>
        <Text dimColor>  |  </Text>
        <Text>Todo: {stats.started}</Text>
      </Box>

      <Box>
        <Text>  </Text>
        <Text dimColor>You: {stats.completedByHuman}  |  Claude: {stats.completedByClaude}</Text>
      </Box>

      <Text> </Text>

      <SectionDivider label="Focused Tasks" />

      {focusedRows}

      <Text> </Text>

      {insightRow}

      <Box>
        <Text>  </Text>
        <Text color="yellow">{getMidDayMessage(progressPercent)}</Text>
      </Box>

      {emailRow}

      <Text> </Text>
    </Box>
  );
}
