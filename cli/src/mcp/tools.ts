import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getStore } from '../get-store.js';
import { buildDayReport } from '../report.js';
import { loadConfig, saveConfig } from '../config.js';
import { renderDayReportHtml } from '../render-html.js';
import { sendEndOfDayEmail } from '../email.js';
import { getCurrentSessionId } from '../sessions.js';
import { buildRefineQueueWithReasons } from '../refine-queue.js';
import { parseReportDate } from '../local-date.js';
import {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  completeTask,
  startTask,
  focusTask,
  unfocusTask,
  searchTasks,
  getStats,
} from '../handlers/index.js';
import type { SessionColor, Task } from '../types.js';

const TIME_ESTIMATES = ['<5m', '20m', '45m', '>1h', '>3h'] as const;
const VIBES = ['love', 'ok', 'dread'] as const;

type Diff = { field: string; before: unknown; after: unknown };

function computeDiff(before: Task, after: Task): Diff[] {
  const fields: (keyof Task)[] = [
    'title', 'description', 'status', 'priority', 'scope', 'categories',
    'focused', 'parent_id', 'completed_at', 'session_id', 'time_estimate', 'vibe',
  ];
  const diffs: Diff[] = [];
  for (const f of fields) {
    const b = before[f];
    const a = after[f];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diffs.push({ field: f, before: b, after: a });
    }
  }
  return diffs;
}

function summarizeTasks(tasks: Task[]): string {
  const focused = tasks.filter(t => t.focused).length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const todo = tasks.filter(t => t.status === 'todo').length;
  const done = tasks.filter(t => t.status === 'done').length;
  return `Found ${tasks.length} tasks (${focused} focused, ${inProgress} in_progress, ${todo} todo, ${done} done)`;
}

export function registerTools(server: McpServer): void {
  const store = getStore();

  // ── task_add ──────────────────────────────────────────────
  server.registerTool(
    'task_add',
    {
      description: 'Create a new task (attributed as created_by: claude)',
      inputSchema: {
        title: z.string().describe('Task title (required)'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('Task priority (default: medium)'),
        scope: z.enum(['personal', 'professional']).optional().describe('Task scope'),
        categories: z.array(z.string()).optional().describe('Category tags'),
        parent_id: z.string().optional().describe('Parent task ID (prefix OK) — creates a subtask'),
        description: z.string().optional().describe('Task description'),
        focused: z.boolean().optional().describe('Add directly to focus list (default: backlog)'),
        time_estimate: z.enum(TIME_ESTIMATES).optional().describe('Time estimate'),
        vibe: z.enum(VIBES).optional().describe('Subjective vibe about the task'),
      },
    },
    async ({ title, priority, scope, categories, parent_id, description, focused, time_estimate, vibe }) => {
      const currentSessionId = getCurrentSessionId();
      const task = await createTask(store, {
        title,
        priority,
        scope,
        categories,
        parent_id,
        description,
        focused,
        time_estimate,
        vibe,
        created_by: 'claude',
        session_id: currentSessionId,
      });
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_list ─────────────────────────────────────────────
  server.registerTool(
    'task_list',
    {
      description: 'List tasks with optional filters. Returns a summary line followed by JSON.',
      inputSchema: {
        scope: z.enum(['personal', 'professional']).optional().describe('Filter by scope'),
        status: z.enum(['todo', 'in_progress', 'done']).optional().describe('Filter by status'),
        focused: z.boolean().optional().describe('Filter by focused state'),
        category: z.string().optional().describe('Filter by category'),
        parent_id: z.string().optional().describe('Filter by parent ID (prefix OK). Use "null" to get top-level only.'),
        include_done: z.boolean().optional().describe('Include done tasks (default: true unless status filter set)'),
        sort: z.enum(['priority', 'created_at', 'created_at_desc', 'updated_at']).optional().describe('Sort order'),
        limit: z.number().optional().describe('Max tasks to return'),
      },
    },
    async ({ scope, status, focused, category, parent_id, include_done, sort, limit }) => {
      const currentSessionId = getCurrentSessionId();
      const tasks = await listTasks(store, {
        scope, status, focused, category, parent_id,
        include_done, sort, limit,
      });

      const annotated = tasks.map(t => ({
        ...t,
        is_current_session: currentSessionId ? t.session_id === currentSessionId : false,
      }));

      const summary = summarizeTasks(tasks);
      return { content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(annotated, null, 2)}` }] };
    },
  );

  // ── task_get ──────────────────────────────────────────────
  server.registerTool(
    'task_get',
    {
      description: 'Fetch a single task by ID (prefix OK), with its subtasks inlined',
      inputSchema: { id: z.string().describe('Task ID (prefix OK)') },
    },
    async ({ id }) => {
      const result = await getTask(store, id);
      if (!result) {
        return { content: [{ type: 'text', text: `Task ${id} not found` }] };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...result.task, subtasks: result.subtasks }, null, 2) }],
      };
    },
  );

  // ── task_subtasks ─────────────────────────────────────────
  server.registerTool(
    'task_subtasks',
    {
      description: 'List subtasks of a parent task',
      inputSchema: { parent_id: z.string().describe('Parent task ID (prefix OK)') },
    },
    async ({ parent_id }) => {
      const resolvedId = await store.resolveId(parent_id);
      const subtasks = await store.query({ parent_id: resolvedId });
      return { content: [{ type: 'text', text: JSON.stringify(subtasks, null, 2) }] };
    },
  );

  // ── task_update ───────────────────────────────────────────
  server.registerTool(
    'task_update',
    {
      description: 'Update one or more fields on a task. Returns pre/post diff and the updated task.',
      inputSchema: {
        id: z.string().describe('Task ID (prefix OK)'),
        title: z.string().optional().describe('New title'),
        status: z.enum(['todo', 'in_progress', 'done']).optional().describe('New status'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
        scope: z.enum(['personal', 'professional']).optional().describe('New scope'),
        categories: z.array(z.string()).optional().describe('New categories (replaces existing)'),
        description: z.string().optional().describe('New description'),
        focused: z.boolean().optional().describe('Focus state (true=focus, false=backlog)'),
        time_estimate: z.enum(TIME_ESTIMATES).nullable().optional().describe('Time estimate (null to clear)'),
        vibe: z.enum(VIBES).nullable().optional().describe('Vibe (null to clear)'),
        parent_id: z.string().nullable().optional().describe('Parent task ID (null to promote to top-level)'),
        completed_at: z.string().nullable().optional().describe('ISO timestamp (null to clear)'),
        session_id: z.string().nullable().optional().describe('Associate task with a session'),
      },
    },
    async ({ id, title, status, priority, scope, categories, description, focused, time_estimate, vibe, parent_id, completed_at, session_id }) => {
      const resolvedId = await store.resolveId(id);
      const before = (await store.load()).find(t => t.id === resolvedId);
      if (!before) {
        return { content: [{ type: 'text', text: `Task ${id} not found` }] };
      }

      // Claude-specific guard: the user completes parent tasks, not Claude.
      // This guard lives only here — the shared updateTask handler has none.
      if (status === 'done' && before.parent_id === null) {
        return { content: [{ type: 'text', text: `Refused: "${before.title}" is a top-level task. Only the user completes parent tasks — feel free to prompt the user to mark it as done.` }] };
      }

      let task: Task;
      try {
        task = await updateTask(store, {
          id: resolvedId, title, status, priority, scope, categories, description,
          focused, time_estimate, vibe, parent_id, completed_at, session_id,
        });
      } catch (err) {
        return { content: [{ type: 'text', text: (err as Error).message }] };
      }

      const diff = computeDiff(before, task);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ diff, task }, null, 2),
        }],
      };
    },
  );

  // ── task_delete ───────────────────────────────────────────
  server.registerTool(
    'task_delete',
    {
      description: 'Delete a task. Requires confirm: true. Irreversible — subtasks are NOT auto-deleted (their parent_id goes dangling).',
      inputSchema: {
        id: z.string().describe('Task ID (prefix OK)'),
        confirm: z.boolean().describe('Must be true to perform the delete'),
      },
    },
    async ({ id, confirm }) => {
      if (!confirm) {
        return { content: [{ type: 'text', text: 'Delete refused: confirm must be true.' }] };
      }
      const { task, danglingSubtasks } = await deleteTask(store, id);
      const extra = danglingSubtasks > 0
        ? `\nNote: ${danglingSubtasks} subtask(s) now have a dangling parent_id.`
        : '';
      return {
        content: [{ type: 'text', text: `Deleted: ${task.title} (${task.id.slice(0, 8)})${extra}` }],
      };
    },
  );

  // ── task_complete ─────────────────────────────────────────
  server.registerTool(
    'task_complete',
    {
      description: 'Mark a subtask as done. Top-level tasks cannot be completed via MCP — only the user can mark those done.',
      inputSchema: { id: z.string().describe('Task ID (prefix OK)') },
    },
    async ({ id }) => {
      const resolvedId = await store.resolveId(id);
      const existing = (await store.load()).find(t => t.id === resolvedId);
      if (!existing) {
        return { content: [{ type: 'text', text: `Task ${id} not found` }] };
      }
      // Claude-specific guard — see task_update.
      if (existing.parent_id === null) {
        return { content: [{ type: 'text', text: `Refused: "${existing.title}" is a top-level task. Only the user completes parent tasks — feel free to prompt the user to mark it as done.` }] };
      }
      const task = await completeTask(store, resolvedId);
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_start ────────────────────────────────────────────
  server.registerTool(
    'task_start',
    {
      description: 'Mark a task as in_progress',
      inputSchema: { id: z.string().describe('Task ID (prefix OK)') },
    },
    async ({ id }) => {
      const currentSessionId = getCurrentSessionId();
      const task = await startTask(store, id, { session_id: currentSessionId });
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_focus ────────────────────────────────────────────
  server.registerTool(
    'task_focus',
    {
      description: 'Pull a task into focus (today\'s working set)',
      inputSchema: { id: z.string().describe('Task ID (prefix OK)') },
    },
    async ({ id }) => {
      const currentSessionId = getCurrentSessionId();
      const task = await focusTask(store, id, { session_id: currentSessionId });
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_unfocus ──────────────────────────────────────────
  server.registerTool(
    'task_unfocus',
    {
      description: 'Send a task back to the backlog',
      inputSchema: { id: z.string().describe('Task ID (prefix OK)') },
    },
    async ({ id }) => {
      const task = await unfocusTask(store, id);
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── task_stats ────────────────────────────────────────────
  server.registerTool(
    'task_stats',
    {
      description: 'Quick snapshot of what\'s on the plate: focused, in_progress, backlog, today\'s done counts',
      inputSchema: {},
    },
    async () => {
      const stats = await getStats(store);
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    },
  );

  // ── task_categories ───────────────────────────────────────
  server.registerTool(
    'task_categories',
    {
      description: 'List all known categories with usage counts. Useful for auto-categorization decisions.',
      inputSchema: {},
    },
    async () => {
      const all = await store.load();
      const counts = new Map<string, number>();
      for (const t of all) {
        for (const c of t.categories) {
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
      }
      const categories = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      return { content: [{ type: 'text', text: JSON.stringify(categories, null, 2) }] };
    },
  );

  // ── task_refine_queue ─────────────────────────────────────
  server.registerTool(
    'task_refine_queue',
    {
      description: 'List tasks that need refinement: missing scope/time/vibe, created by Claude, or stuck in todo >7 days. Mirrors the TUI Refine mode queue.',
      inputSchema: {},
    },
    async () => {
      const candidates = buildRefineQueueWithReasons(await store.load());
      return { content: [{ type: 'text', text: JSON.stringify(candidates, null, 2) }] };
    },
  );

  // ── task_prioritize ───────────────────────────────────────
  server.registerTool(
    'task_prioritize',
    {
      description: 'Return the task list with prioritization context for you to reason over. You should compare tasks, propose priority changes with one-line reasons, then apply accepted changes via task_update. Only suggests — never applies automatically.',
      inputSchema: {
        scope: z.enum(['personal', 'professional', 'all']).optional().describe('Filter scope (default: all)'),
        context: z.string().optional().describe('User context (e.g. "demo on Friday, need auth working")'),
      },
    },
    async ({ scope, context }) => {
      const all = await store.load();
      const active = all.filter(t =>
        t.parent_id === null &&
        t.status !== 'done' &&
        (scope === undefined || scope === 'all' || t.scope === scope),
      );

      const compact = active.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        scope: t.scope,
        categories: t.categories,
        focused: t.focused,
        time_estimate: t.time_estimate,
        vibe: t.vibe,
        created_at: t.created_at,
      }));

      const instruction = [
        'Review these tasks and propose priority changes (low/medium/high).',
        'Return one suggestion per task you want to change, each with:',
        '  - id, current_priority, suggested_priority, reason (one line).',
        'Do NOT apply changes automatically. Present the list to the user,',
        'then call task_update(id, priority) for each change they accept.',
        'Guardrails:',
        '  - Every suggestion needs a reason grounded in title/description/context.',
        '  - Framing is situational, not evaluative — never say "you set this wrong".',
        '  - If nothing clearly warrants a change, say so instead of inventing reasons.',
      ].join('\n');

      const payload = {
        instruction,
        user_context: context ?? null,
        scope: scope ?? 'all',
        task_count: compact.length,
        tasks: compact,
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );

  // ── task_end_day ──────────────────────────────────────────
  server.registerTool(
    'task_end_day',
    {
      description: 'Generate an end-of-day report. Returns text by default; use format: "json" for structured data.',
      inputSchema: {
        date: z.string().optional().describe('Date in YYYY-MM-DD format, or "yesterday"'),
        email: z.boolean().optional().describe('Send report via email'),
        format: z.enum(['text', 'json']).optional().describe('Output format (default: text)'),
      },
    },
    async ({ date, email, format }) => {
      const reportDate = parseReportDate(date);

      const report = await buildDayReport(store, reportDate);

      if (email) {
        const config = loadConfig();
        const html = renderDayReportHtml(report);
        await sendEndOfDayEmail(config, html, reportDate);
      }

      if (format === 'json') {
        const payload = { ...report, emailed: email === true };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      }

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
  server.registerTool(
    'task_search',
    {
      description: 'Full-text search across task titles and descriptions, with optional filters',
      inputSchema: {
        query: z.string().describe('Search query (case-insensitive substring match)'),
        scope: z.enum(['personal', 'professional']).optional().describe('Filter by scope'),
        status: z.enum(['todo', 'in_progress', 'done']).optional().describe('Filter by status'),
        include_done: z.boolean().optional().describe('Include done tasks (default: true unless status filter set)'),
      },
    },
    async ({ query, scope, status, include_done }) => {
      const matches = await searchTasks(store, { query, scope, status, include_done });

      if (matches.length === 0) {
        return { content: [{ type: 'text', text: `No tasks found matching "${query}"` }] };
      }
      const summary = summarizeTasks(matches);
      return { content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(matches, null, 2)}` }] };
    },
  );

  // ── task_session_color ───────────────────────────────────
  server.registerTool(
    'task_session_color',
    {
      description: 'Set the terminal color for the current Claude Code session. Valid colors: cyan, magenta, purple, yellow',
      inputSchema: {
        color: z.enum(['cyan', 'magenta', 'purple', 'yellow']).describe('Session color'),
      },
    },
    async ({ color }) => {
      const currentSessionId = getCurrentSessionId();
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
