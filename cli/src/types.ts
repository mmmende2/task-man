export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskScope = 'personal' | 'professional';
export type CreatedBy = 'human' | 'claude';
export type TimeEstimate = '<5m' | '20m' | '45m' | '>1h' | '>3h';
export type Vibe = 'love' | 'ok' | 'dread';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  scope: TaskScope;
  categories: string[];
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  focused: boolean;
  created_by: CreatedBy;
  session_id: string | null;
  time_estimate: TimeEstimate | null;
  vibe: Vibe | null;
  // Email of the identity this task belongs to. null/absent = legacy task,
  // treated as TASK_MAN_DEFAULT_OWNER's at filter time (see server/scoped-store.ts).
  // Stamped server-side only — never client-assignable (schemas.ts strips it).
  owner?: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  scope?: TaskScope;
  categories?: string[];
  parent_id?: string;
  focused?: boolean;
  created_by?: CreatedBy;
  session_id?: string | null;
  time_estimate?: TimeEstimate | null;
  vibe?: Vibe | null;
  // Server-internal (set by scoped-store, stripped from request bodies).
  owner?: string | null;
}

export interface TaskFilter {
  scope?: TaskScope;
  status?: TaskStatus;
  focused?: boolean;
  category?: string;
  parent_id?: string | null;
}

export type SessionColor = 'cyan' | 'magenta' | 'purple' | 'yellow';

export interface TaskManConfig {
  email: {
    resendApiKey: string | null;
    to: string | null;
    autoPromptAfter: string | null;
  };
  focus: {
    maxFocused: number | null;
  };
  plan: {
    hiddenCategories: string[];
  };
  sessions: Record<string, SessionColor>;
  server?: {
    port?: number;            // default 3030
    bind?: string;            // default "127.0.0.1" (local-only); "0.0.0.0" exposes on LAN
  };
  client?: {
    // Anything other than the literal 'remote' is treated as local — a
    // typo here should fail safe to local, not silently point at a URL
    // the user didn't opt into.
    mode?: 'local' | 'remote';
    remote_url?: string;
    // Cloudflare Access service token — non-expiring, for headless MCP.
    // When absent, RemoteStore falls back to the interactive
    // `cloudflared access login` JWT flow (used by the TUI).
    service_token_id?: string;
    service_token_secret?: string;
    // Absolute path to the cloudflared binary. Rarely needed: when unset,
    // resolution falls back to $CLOUDFLARED, well-known install dirs, then
    // bare `cloudflared` (see cloudflared.ts).
    cloudflared_path?: string;
  };
}

export interface DayStats {
  completed: number;
  completedByHuman: number;
  completedByClaude: number;
  started: number;
  inProgress: number;
  completionRate: number;
  subtasksCompleted: number;
  subtasksTotal: number;
}

export interface DayReport {
  date: string;
  completedTasks: Task[];
  inProgressTasks: Task[];
  startedTasks: Task[];
  tomorrowFocus: Task[];
  stats: DayStats;
  insight: string | null;
  encouragingMessage: string;
}

// Shape returned by GET /api/metrics — DayReport plus three fields the
// web Metrics page needs (subtask tree, last-work-day jump, date-picker
// lower bound). Lives in types.ts (not handlers/metrics.ts) so the web
// can import it without pulling the server-only handler module into its
// bundle.
export interface MetricsResponse extends DayReport {
  subtasksByParent: Record<string, Task[]>;
  lastWorkDay: string | null;
  earliestDate: string | null;
}

export type InsightType =
  | 'personal_best'
  | 'streak'
  | 'vs_yesterday'
  | 'focus_ratio'
  | 'scope_balance'
  | 'ai_collab'
  | 'velocity_trend';
