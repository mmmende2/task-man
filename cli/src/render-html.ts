import type { DayReport, Task } from './types.js';

const BG = '#1a1a2e';
const FG = '#e0e0e0';
const MAGENTA = '#ff79c6';
const CYAN = '#8be9fd';
const GREEN = '#50fa7b';
const YELLOW = '#f1fa8c';
const DIM = '#6272a4';

function taskRow(task: Task): string {
  const attr = task.created_by === 'claude' ? '[claude]' : '[you]';
  return `<tr><td style="padding:4px 12px;color:${FG}">● ${escapeHtml(task.title)}</td><td style="padding:4px 12px;color:${DIM}">${attr}</td></tr>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderDayReportHtml(report: DayReport): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:${BG};color:${FG};font-family:'SF Mono','Fira Code',monospace;font-size:14px;">
<div style="max-width:600px;margin:0 auto;border:2px solid ${MAGENTA};border-radius:8px;overflow:hidden;">

  <div style="background:${MAGENTA};padding:12px 16px;">
    <h1 style="margin:0;font-size:18px;color:${BG};">END OF DAY — ${escapeHtml(report.date)}</h1>
  </div>

  <div style="padding:16px;">
    <h2 style="color:${GREEN};font-size:15px;margin:16px 0 8px;">✅ Completed today (${report.completedTasks.length})</h2>
    <table style="width:100%;">
      ${report.completedTasks.map(taskRow).join('\n      ')}
    </table>
    ${report.completedTasks.length === 0 ? `<p style="color:${DIM}">No tasks completed.</p>` : ''}

    <h2 style="color:${YELLOW};font-size:15px;margin:16px 0 8px;">🔄 In Progress (${report.inProgressTasks.length})</h2>
    <table style="width:100%;">
      ${report.inProgressTasks.map(t => `<tr><td style="padding:4px 12px;color:${FG}">● ${escapeHtml(t.title)}</td></tr>`).join('\n      ')}
    </table>
    ${report.inProgressTasks.length === 0 ? `<p style="color:${DIM}">None.</p>` : ''}

    <h2 style="color:${CYAN};font-size:15px;margin:16px 0 8px;">📋 Started today (${report.startedTasks.length})</h2>
    <table style="width:100%;">
      ${report.startedTasks.map(t => `<tr><td style="padding:4px 12px;color:${FG}">● ${escapeHtml(t.title)}</td></tr>`).join('\n      ')}
    </table>
    ${report.startedTasks.length === 0 ? `<p style="color:${DIM}">None.</p>` : ''}

    <hr style="border:1px solid ${MAGENTA};margin:16px 0;">

    <h2 style="color:${FG};font-size:15px;margin:16px 0 8px;">📊 Stats</h2>
    <table style="width:100%;">
      <tr><td style="padding:2px 12px;color:${FG}">Completed:</td><td style="color:${GREEN}">${report.stats.completed} (${report.stats.completedByHuman} you · ${report.stats.completedByClaude} claude)</td></tr>
      <tr><td style="padding:2px 12px;color:${FG}">Started:</td><td style="color:${CYAN}">${report.stats.started}</td></tr>
      <tr><td style="padding:2px 12px;color:${FG}">In progress:</td><td style="color:${YELLOW}">${report.stats.inProgress} (carrying over)</td></tr>
      <tr><td style="padding:2px 12px;color:${FG}">Completion:</td><td style="color:${MAGENTA}">${report.stats.completionRate}%</td></tr>
    </table>

    ${report.insight ? `
    <h2 style="color:${CYAN};font-size:15px;margin:16px 0 8px;">💡 Insight</h2>
    <p style="color:${FG};padding:0 12px;">${escapeHtml(report.insight)}</p>
    ` : ''}

    <div style="margin-top:16px;padding:12px;background:#2a2a4a;border-radius:6px;border-left:3px solid ${MAGENTA};">
      <p style="margin:0;color:${MAGENTA};font-size:15px;">🎉 ${escapeHtml(report.encouragingMessage)}</p>
    </div>
  </div>

</div>
</body>
</html>`;
}
