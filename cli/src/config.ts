import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CONFIG_FILE, DEFAULT_CONFIG } from './constants.js';
import type { SessionColor, TaskManConfig } from './types.js';

// 'magenta' predates the palette matching Claude Code's /color set, where the
// same hex is called 'pink'. Unknown values pass through — getSessionHexColor
// null-safes them at lookup time.
export function normalizeSessionColors(sessions: Record<string, string>): Record<string, SessionColor> {
  const out: Record<string, SessionColor> = {};
  for (const [id, color] of Object.entries(sessions)) {
    out[id] = (color === 'magenta' ? 'pink' : color) as SessionColor;
  }
  return out;
}

export function loadConfig(): TaskManConfig {
  if (!existsSync(CONFIG_FILE)) {
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  const config: TaskManConfig = { ...structuredClone(DEFAULT_CONFIG), ...JSON.parse(raw) };
  config.sessions = normalizeSessionColors(config.sessions ?? {});
  return config;
}

export function saveConfig(config: TaskManConfig): void {
  const dir = dirname(CONFIG_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfigValue(dotPath: string): unknown {
  const config = loadConfig();
  const keys = dotPath.split('.');
  let current: unknown = config;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function setConfigValue(dotPath: string, value: string): void {
  const config = loadConfig();
  const keys = dotPath.split('.');
  let current: Record<string, unknown> = config as unknown as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];

  // Try to parse as JSON for booleans, numbers, null
  if (value === 'null') {
    current[lastKey] = null;
  } else if (value === 'true') {
    current[lastKey] = true;
  } else if (value === 'false') {
    current[lastKey] = false;
  } else if (!isNaN(Number(value)) && value.trim() !== '') {
    current[lastKey] = Number(value);
  } else {
    current[lastKey] = value;
  }

  saveConfig(config);
}
