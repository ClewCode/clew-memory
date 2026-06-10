import { afterEach, describe, expect, test } from 'bun:test';

import { detectClient, getDatabasePath, getWorkspaceRoot } from './client';

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
});

describe('client detection', () => {
  test('detects Claude Code from CLAUDE_PROJECT_DIR', () => {
    process.env = {
      ...originalEnv,
      CLAUDE_PROJECT_DIR: '/tmp/claude-project',
      CLEW_PROJECT_DIR: undefined,
      CLEW_MEMORY_DB: undefined,
      CLEW_MEMORY_SCOPE: undefined,
    };

    expect(detectClient()).toBe('claude-code');
    expect(getWorkspaceRoot()).toBe('/tmp/claude-project');
  });

  test('detects ClewCode from CLEW_PROJECT_DIR', () => {
    process.env = {
      ...originalEnv,
      CLAUDE_PROJECT_DIR: undefined,
      CLEW_PROJECT_DIR: '/tmp/clew-project',
      CLEW_MEMORY_DB: undefined,
      CLEW_MEMORY_SCOPE: undefined,
    };

    expect(detectClient()).toBe('clewcode');
    expect(getWorkspaceRoot()).toBe('/tmp/clew-project');
  });

  test('uses project-local memory by default', () => {
    process.env = {
      ...originalEnv,
      CLAUDE_PROJECT_DIR: undefined,
      CLEW_PROJECT_DIR: '/tmp/clew-project',
      CLEW_MEMORY_DB: undefined,
      CLEW_MEMORY_SCOPE: undefined,
    };

    expect(getDatabasePath()).toMatch(/[/\\]\.clew[/\\]memory\.db$/);
  });

  test('requires CLEW_MEMORY_SCOPE=global for global memory', () => {
    process.env = {
      ...originalEnv,
      CLAUDE_PROJECT_DIR: '/tmp/claude-project',
      CLEW_PROJECT_DIR: undefined,
      CLEW_MEMORY_DB: undefined,
      CLEW_MEMORY_SCOPE: 'global',
    };

    expect(getDatabasePath()).toMatch(/[/\\]\.clew-memory[/\\]memory\.db$/);
  });

  test('lets CLEW_MEMORY_DB override detected project memory', () => {
    process.env = {
      ...originalEnv,
      CLAUDE_PROJECT_DIR: '/tmp/claude-project',
      CLEW_PROJECT_DIR: undefined,
      CLEW_MEMORY_DB: '/custom/memory.db',
      CLEW_MEMORY_SCOPE: 'global',
    };

    expect(getDatabasePath()).toBe('/custom/memory.db');
  });
});
