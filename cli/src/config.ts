import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CONFIG_FILE, DEFAULT_CONFIG } from './constants.js';
import type { TaskManConfig } from './types.js';

export function loadConfig(): TaskManConfig {
  if (!existsSync(CONFIG_FILE)) {
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  return { ...structuredClone(DEFAULT_CONFIG), ...JSON.parse(raw) };
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
