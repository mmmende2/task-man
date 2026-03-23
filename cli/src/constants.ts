import { type TaskManConfig, type TaskPriority, type TaskScope, type TaskStatus } from './types.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DATA_DIR = join(homedir(), '.task-man');
export const TASKS_FILE = join(DATA_DIR, 'tasks.json');
export const CONFIG_FILE = join(DATA_DIR, 'config.json');
export const INSIGHTS_LOG_FILE = join(DATA_DIR, 'insights-log.json');

export const DEFAULT_CONFIG: TaskManConfig = {
  email: {
    resendApiKey: null,
    to: null,
    autoPromptAfter: '17:00',
  },
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: 'magenta',
  medium: 'cyan',
  low: 'gray',
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  done: 'green',
  in_progress: 'yellow',
  todo: 'white',
};

export const SCOPE_LABELS: Record<TaskScope, string> = {
  personal: 'per',
  professional: 'pro',
};
