import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TaskStore } from 'task-man/store';
import { buildDayReport } from 'task-man/report';
import { loadConfig, saveConfig } from 'task-man/config';
import { renderDayReportHtml } from 'task-man/render-html';
import { sendEndOfDayEmail } from 'task-man/email';
import { getCurrentSessionId } from 'task-man/sessions';
import type { SessionColor, TaskFilter } from 'task-man/types';

export function registerTools(server: McpServer): void {
  const store = new TaskStore();
  const currentSessionId = getCurrentSessionId();

  // ── task_add ──────────────────────────────────────────────
  server.tool(
    'task_add',
    'Create a new task',
    {
      title: z.string().describe('Task title (required)'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Task priority'),
      scope: z.enum(['personal', 'professional']).optional().describe('Task scope'),
      categories: z.array(z.string()).optional().describe('Category tags'),
      parent_id: z.string().optional().describe('Parent task ID (prefix OK)'),
      description: z.string().optional().describe('Task description'),
    },
    async ({ title, priority, scope, categories, parent_id, description }) => {
      const parentId = parent_id ? store.resolveId(parent_id) : undefined;
      const task = await store.add({
        title,
        priority,
        scope,
        categories,
        parent_id: parentId,
        description,
        created_by: 'claude',
        session_id: currentSessionId,
      });
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_list ─────────────────────────────────────────────
  server.tool(
    'task_list',
    'List tasks with optional filters',
    {
      scope: z.enum(['personal', 'professional']).optional().describe('Filter by scope'),
      status: z.enum(['todo', 'in_progress', 'done']).optional().describe('Filter by status'),
      focused: z.boolean().optional().describe('Filter by focused state'),
      category: z.string().optional().describe('Filter by category'),
      limit: z.number().optional().describe('Max tasks to return'),
    },
    async ({ scope, status, focused, category, limit }) => {
      const filters: TaskFilter = {};
      if (scope) filters.scope = scope;
      if (status) filters.status = status;
      if (focused !== undefined) filters.focused = focused;
      if (category) filters.category = category;

      let tasks = store.query(filters);
      if (limit && limit > 0) tasks = tasks.slice(0, limit);

      const annotated = tasks.map(t => ({
        ...t,
        is_current_session: currentSessionId ? t.session_id === currentSessionId : false,
      }));

      return { content: [{ type: 'text', text: JSON.stringify(annotated, null, 2) }] };
    },
  );

  // ── task_update ───────────────────────────────────────────
  server.tool(
    'task_update',
    'Update one or more fields on a task',
    {
      id: z.string().describe('Task ID (prefix OK)'),
      title: z.string().optional().describe('New title'),
      status: z.enum(['todo', 'in_progress', 'done']).optional().describe('New status'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
      scope: z.enum(['personal', 'professional']).optional().describe('New scope'),
      categories: z.array(z.string()).optional().describe('New categories'),
      description: z.string().optional().describe('New description'),
      session_id: z.string().nullable().optional().describe('Associate task with a session'),
    },
    async ({ id, title, status, priority, scope, categories, description, session_id }) => {
      const changes: Record<string, unknown> = {};
      if (title !== undefined) changes.title = title;
      if (status !== undefined) changes.status = status;
      if (priority !== undefined) changes.priority = priority;
      if (scope !== undefined) changes.scope = scope;
      if (categories !== undefined) changes.categories = categories;
      if (description !== undefined) changes.description = description;
      if (session_id !== undefined) changes.session_id = session_id;

      const task = await store.update(id, changes);
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_complete ─────────────────────────────────────────
  server.tool(
    'task_complete',
    'Mark a task as done',
    { id: z.string().describe('Task ID (prefix OK)') },
    async ({ id }) => {
      const task = await store.update(id, { status: 'done' });
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_start ────────────────────────────────────────────
  server.tool(
    'task_start',
    'Mark a task as in_progress',
    { id: z.string().describe('Task ID (prefix OK)') },
    async ({ id }) => {
      const task = await store.update(id, { status: 'in_progress', session_id: currentSessionId });
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_focus ────────────────────────────────────────────
  server.tool(
    'task_focus',
    'Pull a task into focus (today\'s working set)',
    { id: z.string().describe('Task ID (prefix OK)') },
    async ({ id }) => {
      const task = await store.update(id, { focused: true, session_id: currentSessionId });
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_unfocus ──────────────────────────────────────────
  server.tool(
    'task_unfocus',
    'Send a task back to the backlog',
    { id: z.string().describe('Task ID (prefix OK)') },
    async ({ id }) => {
      const task = await store.update(id, { focused: false });
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_end_day ──────────────────────────────────────────
  server.tool(
    'task_end_day',
    'Generate an end-of-day report',
    {
      date: z.string().optional().describe('Date in YYYY-MM-DD format, or "yesterday"'),
      email: z.boolean().optional().describe('Send report via email'),
    },
    async ({ date, email }) => {
      let reportDate: string;
      if (!date || date === 'today') {
        reportDate = new Date().toISOString().slice(0, 10);
      } else if (date === 'yesterday') {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        reportDate = d.toISOString().slice(0, 10);
      } else {
        reportDate = date;
      }

      const report = buildDayReport(store, reportDate);

      if (email) {
        const config = loadConfig();
        const html = renderDayReportHtml(report);
        await sendEndOfDayEmail(config, html, reportDate);
      }

      // Return structured text, not HTML
      const lines: string[] = [
        `# End of Day Report — ${report.date}`,
        '',
        `## Completed (${report.stats.completed})`,
        ...report.completedTasks.map(t => `- ${t.title} [${t.created_by}]`),
        '',
        `## In Progress (${report.stats.inProgress})`,
        ...report.inProgressTasks.map(t => `- ${t.title}`),
        '',
        `## Started Today (${report.stats.started})`,
        ...report.startedTasks.map(t => `- ${t.title}`),
        '',
        '## Stats',
        `- Completed: ${report.stats.completed} (${report.stats.completedByHuman} you, ${report.stats.completedByClaude} claude)`,
        `- Subtasks completed: ${report.stats.subtasksCompleted} (${report.stats.subtasksTotal} total)`,
        `- Started: ${report.stats.started}`,
        `- In progress: ${report.stats.inProgress}`,
        `- Completion rate: ${report.stats.completionRate}%`,
      ];

      if (report.tomorrowFocus.length > 0) {
        lines.push('', '## Tomorrow\'s Focus');
        for (const t of report.tomorrowFocus.slice(0, 5)) {
          lines.push(`- ${t.title} [${t.status}]`);
        }
        if (report.tomorrowFocus.length > 5) {
          lines.push(`- + ${report.tomorrowFocus.length - 5} more`);
        }
      }

      if (report.insight) {
        lines.push('', `## Insight`, report.insight);
      }

      lines.push('', report.encouragingMessage);

      if (email) {
        lines.push('', '(Email sent successfully)');
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  // ── task_search ───────────────────────────────────────────
  server.tool(
    'task_search',
    'Full-text search across task titles and descriptions',
    { query: z.string().describe('Search query (case-insensitive substring match)') },
    async ({ query }) => {
      const allTasks = store.load();
      const q = query.toLowerCase();
      const matches = allTasks.filter(t => {
        const title = t.title.toLowerCase();
        const desc = (t.description ?? '').toLowerCase();
        return title.includes(q) || desc.includes(q);
      });

      return {
        content: [{
          type: 'text',
          text: matches.length > 0
            ? JSON.stringify(matches, null, 2)
            : `No tasks found matching "${query}"`,
        }],
      };
    },
  );

  // ── task_session_color ───────────────────────────────────
  server.tool(
    'task_session_color',
    'Set the terminal color for the current Claude Code session. Valid colors: cyan, magenta, purple, yellow',
    {
      color: z.enum(['cyan', 'magenta', 'purple', 'yellow']).describe('Session color'),
    },
    async ({ color }) => {
      if (!currentSessionId) {
        return { content: [{ type: 'text', text: 'No active Claude Code session detected' }] };
      }
      const config = loadConfig();
      if (!config.sessions) config.sessions = {};
      config.sessions[currentSessionId] = color as SessionColor;
      saveConfig(config);
      return { content: [{ type: 'text', text: `Session color set to ${color} (session ${currentSessionId.slice(0, 8)}...). Run /color ${color} to match your Claude Code prompt bar.` }] };
    },
  );
}
