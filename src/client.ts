import { homedir } from 'node:os';
import { resolve } from 'node:path';

export type ClewClient = 'claude-code' | 'clewcode' | 'unknown';

export function detectClient(): ClewClient {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return 'claude-code';
  }

  if (process.env.CLEW_PROJECT_DIR) {
    return 'clewcode';
  }

  return 'unknown';
}

export function getWorkspaceRoot() {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }

  if (process.env.CLEW_PROJECT_DIR) {
    return process.env.CLEW_PROJECT_DIR;
  }

  return process.cwd();
}

export function getDatabasePath() {
  if (process.env.CLEW_MEMORY_DB) {
    return process.env.CLEW_MEMORY_DB;
  }

  if (process.env.CLEW_MEMORY_SCOPE === 'global') {
    return resolve(homedir(), '.clew-memory', 'memory.db');
  }

  const workspaceRoot = getWorkspaceRoot();
  return resolve(workspaceRoot, '.clew', 'memory.db');
}
