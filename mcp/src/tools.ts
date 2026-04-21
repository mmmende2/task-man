import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TaskStore } from 'task-man/store';
import { buildDayReport } from 'task-man/report';
import { loadConfig, saveConfig } from 'task-man/config';
import { renderDayReportHtml } from 'task-man/render-html';
import { sendEndOfDayEmail } from 'task-man/email';
import { getCurrentSessionId } from 'task-man/sessions';
import { buildRefineQueueWithReasons } from 'task-man/refine-queue';
import type { SessionColor, Task, TaskFilter, TaskPriority } from 'task-man/types';

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

function sortTasks(tasks: Task[], sort?: string): Task[] {
  if (!sort) return tasks;
  const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
  const sorted = [...tasks];
  switch (sort) {
    case 'priority':
      sorted.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
      break;
    case 'created_at':
      sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
      break;
    case 'created_at_desc':
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    case 'updated_at':
      sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      break;
  }
  return sorted;
}

export function registerTools(server: McpServer): void {
  const store = new TaskStore();

  // ── task_add ──────────────────────────────────────────────
  server.tool(
    'task_add',
    'Create a new task (attributed as created_by: claude)',
    {
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
    async ({ title, priority, scope, categories, parent_id, description, focused, time_estimate, vibe }) => {
      const currentSessionId = getCurrentSessionId();
      const parentId = parent_id ? store.resolveId(parent_id) : undefined;
      const task = await store.add({
        title,
        priority,
        scope,
        categories,
        parent_id: parentId,
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
  server.tool(
    'task_list',
    'List tasks with optional filters. Returns a summary line followed by JSON.',
    {
      scope: z.enum(['personal', 'professional']).optional().describe('Filter by scope'),
      status: z.enum(['todo', 'in_progress', 'done']).optional().describe('Filter by status'),
      focused: z.boolean().optional().describe('Filter by focused state'),
      category: z.string().optional().describe('Filter by category'),
      parent_id: z.string().optional().describe('Filter by parent ID (prefix OK). Use "null" to get top-level only.'),
      include_done: z.boolean().optional().describe('Include done tasks (default: true unless status filter set)'),
      sort: z.enum(['priority', 'created_at', 'created_at_desc', 'updated_at']).optional().describe('Sort order'),
      limit: z.number().optional().describe('Max tasks to return'),
    },
    async ({ scope, status, focused, category, parent_id, include_done, sort, limit }) => {
      const currentSessionId = getCurrentSessionId();
      const filters: TaskFilter = {};
      if (scope) filters.scope = scope;
      if (status) filters.status = status;
      if (focused !== undefined) filters.focused = focused;
      if (category) filters.category = category;
      if (parent_id !== undefined) {
        filters.parent_id = parent_id === 'null' ? null : store.resolveId(parent_id);
      }

      let tasks = store.query(filters);
      if (include_done === false && !status) {
        tasks = tasks.filter(t => t.status !== 'done');
      }
      tasks = sortTasks(tasks, sort);
      if (limit && limit > 0) tasks = tasks.slice(0, limit);

      const annotated = tasks.map(t => ({
        ...t,
        is_current_session: currentSessionId ? t.session_id === currentSessionId : false,
      }));

      const summary = summarizeTasks(tasks);
      return { content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(annotated, null, 2)}` }] };
    },
  );

  // ── task_get ──────────────────────────────────────────────
  server.tool(
    'task_get',
    'Fetch a single task by ID (prefix OK), with its subtasks inlined',
    { id: z.string().describe('Task ID (prefix OK)') },
    async ({ id }) => {
      const resolvedId = store.resolveId(id);
      const all = store.load();
      const task = all.find(t => t.id === resolvedId);
      if (!task) {
        return { content: [{ type: 'text', text: `Task ${id} not found` }] };
      }
      const subtasks = all.filter(t => t.parent_id === resolvedId);
      return { content: [{ type: 'text', text: JSON.stringify({ ...task, subtasks }, null, 2) }] };
    },
  );

  // ── task_subtasks ─────────────────────────────────────────
  server.tool(
    'task_subtasks',
    'List subtasks of a parent task',
    { parent_id: z.string().describe('Parent task ID (prefix OK)') },
    async ({ parent_id }) => {
      const resolvedId = store.resolveId(parent_id);
      const subtasks = store.query({ parent_id: resolvedId });
      return { content: [{ type: 'text', text: JSON.stringify(subtasks, null, 2) }] };
    },
  );

  // ── task_update ───────────────────────────────────────────
  server.tool(
    'task_update',
    'Update one or more fields on a task. Returns pre/post diff and the updated task.',
    {
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
    async ({ id, title, status, priority, scope, categories, description, focused, time_estimate, vibe, parent_id, completed_at, session_id }) => {
      const resolvedId = store.resolveId(id);
      const before = store.load().find(t => t.id === resolvedId);
      if (!before) {
        return { content: [{ type: 'text', text: `Task ${id} not found` }] };
      }

      const changes: Record<string, unknown> = {};
      if (title !== undefined) changes.title = title;
      if (status !== undefined) changes.status = status;
      if (priority !== undefined) changes.priority = priority;
      if (scope !== undefined) changes.scope = scope;
      if (categories !== undefined) changes.categories = categories;
      if (description !== undefined) changes.description = description;
      if (focused !== undefined) changes.focused = focused;
      if (time_estimate !== undefined) changes.time_estimate = time_estimate;
      if (vibe !== undefined) changes.vibe = vibe;
      if (completed_at !== undefined) changes.completed_at = completed_at;
      if (session_id !== undefined) changes.session_id = session_id;
      if (parent_id !== undefined) {
        if (parent_id === null) {
          changes.parent_id = null;
        } else {
          const resolvedParent = store.resolveId(parent_id);
          if (resolvedParent === resolvedId) {
            return { content: [{ type: 'text', text: 'A task cannot be its own parent.' }] };
          }
          changes.parent_id = resolvedParent;
        }
      }

      const task = await store.update(resolvedId, changes);
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
  server.tool(
    'task_delete',
    'Delete a task. Requires confirm: true. Irreversible — subtasks are NOT auto-deleted (their parent_id goes dangling).',
    {
      id: z.string().describe('Task ID (prefix OK)'),
      confirm: z.boolean().describe('Must be true to perform the delete'),
    },
    async ({ id, confirm }) => {
      if (!confirm) {
        return { content: [{ type: 'text', text: 'Delete refused: confirm must be true.' }] };
      }
      const resolvedId = store.resolveId(id);
      const subtasks = store.query({ parent_id: resolvedId });
      const { task } = await store.remove(resolvedId);
      const extra = subtasks.length > 0
        ? `\nNote: ${subtasks.length} subtask(s) now have a dangling parent_id.`
        : '';
      return {
        content: [{ type: 'text', text: `Deleted: ${task.title} (${task.id.slice(0, 8)})${extra}` }],
      };
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
      const currentSessionId = getCurrentSessionId();
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
      const currentSessionId = getCurrentSessionId();
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

  // ── task_stats ────────────────────────────────────────────
  server.tool(
    'task_stats',
    'Quick snapshot of what\'s on the plate: focused, in_progress, backlog, today\'s done counts',
    {},
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      const all = store.load();
      const parents = all.filter(t => t.parent_id === null);
      const stats = {
        total: parents.length,
        focused: parents.filter(t => t.focused && t.status !== 'done').length,
        in_progress: parents.filter(t => t.status === 'in_progress').length,
        todo_focused: parents.filter(t => t.focused && t.status === 'todo').length,
        backlog: parents.filter(t => !t.focused && t.status !== 'done').length,
        completed_today: parents.filter(t => t.completed_at?.startsWith(today)).length,
        subtasks_total: all.filter(t => t.parent_id !== null).length,
        subtasks_done_today: all.filter(t => t.parent_id !== null && t.completed_at?.startsWith(today)).length,
      };
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    },
  );

  // ── task_categories ───────────────────────────────────────
  server.tool(
    'task_categories',
    'List all known categories with usage counts. Useful for auto-categorization decisions.',
    {},
    async () => {
      const all = store.load();
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
  server.tool(
    'task_refine_queue',
    'List tasks that need refinement: missing scope/time/vibe, created by Claude, or stuck in todo >7 days. Mirrors the TUI Refine mode queue.',
    {},
    async () => {
      const candidates = buildRefineQueueWithReasons(store.load());
      return { content: [{ type: 'text', text: JSON.stringify(candidates, null, 2) }] };
    },
  );

  // ── task_prioritize ───────────────────────────────────────
  server.tool(
    'task_prioritize',
    'Return the task list with prioritization context for you to reason over. You should compare tasks, propose priority changes with one-line reasons, then apply accepted changes via task_update. Only suggests — never applies automatically.',
    {
      scope: z.enum(['personal', 'professional', 'all']).optional().describe('Filter scope (default: all)'),
      context: z.string().optional().describe('User context (e.g. "demo on Friday, need auth working")'),
    },
    async ({ scope, context }) => {
      const all = store.load();
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
  server.tool(
    'task_end_day',
    'Generate an end-of-day report. Returns text by default; use format: "json" for structured data.',
    {
      date: z.string().optional().describe('Date in YYYY-MM-DD format, or "yesterday"'),
      email: z.boolean().optional().describe('Send report via email'),
      format: z.enum(['text', 'json']).optional().describe('Output format (default: text)'),
    },
    async ({ date, email, format }) => {
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
  server.tool(
    'task_search',
    'Full-text search across task titles and descriptions, with optional filters',
    {
      query: z.string().describe('Search query (case-insensitive substring match)'),
      scope: z.enum(['personal', 'professional']).optional().describe('Filter by scope'),
      status: z.enum(['todo', 'in_progress', 'done']).optional().describe('Filter by status'),
      include_done: z.boolean().optional().describe('Include done tasks (default: true unless status filter set)'),
    },
    async ({ query, scope, status, include_done }) => {
      const q = query.toLowerCase();
      let matches = store.load().filter(t => {
        const title = t.title.toLowerCase();
        const desc = (t.description ?? '').toLowerCase();
        return title.includes(q) || desc.includes(q);
      });

      if (scope) matches = matches.filter(t => t.scope === scope);
      if (status) matches = matches.filter(t => t.status === status);
      if (include_done === false && !status) {
        matches = matches.filter(t => t.status !== 'done');
      }

      if (matches.length === 0) {
        return { content: [{ type: 'text', text: `No tasks found matching "${query}"` }] };
      }
      const summary = summarizeTasks(matches);
      return { content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(matches, null, 2)}` }] };
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
