export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskScope = 'personal' | 'professional';
export type CreatedBy = 'human' | 'claude';

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
}

export interface TaskFilter {
  scope?: TaskScope;
  status?: TaskStatus;
  focused?: boolean;
  category?: string;
}

export interface TaskManConfig {
  email: {
    resendApiKey: string | null;
    to: string | null;
    autoPromptAfter: string | null;
  };
}

export interface DayStats {
  completed: number;
  completedByHuman: number;
  completedByClaude: number;
  started: number;
  inProgress: number;
  completionRate: number;
}

export interface DayReport {
  date: string;
  completedTasks: Task[];
  inProgressTasks: Task[];
  startedTasks: Task[];
  stats: DayStats;
  insight: string | null;
  encouragingMessage: string;
}

export type InsightType =
  | 'personal_best'
  | 'streak'
  | 'vs_yesterday'
  | 'focus_ratio'
  | 'scope_balance'
  | 'ai_collab'
  | 'velocity_trend'
  | 'productivity_tip';
