#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import packageJson from '../package.json';
import { runCli } from './cli';
import { closeDatabase, runMigrations } from './db/client';
import { startHttpServer } from './http/server';
import { registerFeedbackAddTool } from './tools/feedback-add';
import { registerFeedbackListTool } from './tools/feedback-list';
import { registerForgetTool } from './tools/forget';
import { registerHandoffTool } from './tools/handoff';
import { registerRecallTool } from './tools/recall';
import { registerReflectTool } from './tools/reflect';
import { registerReflectSessionTool } from './tools/reflect-session';
import { registerRememberTool } from './tools/remember';
import { registerSupersedeTool } from './tools/supersede';
import { registerTimelineAddTool } from './tools/timeline-add';
import { registerTimelineRecentTool } from './tools/timeline-recent';
import { registerTimelineSearchTool } from './tools/timeline-search';
import { registerTimelineSummaryTool } from './tools/timeline-summary';
import { registerUpdateTool } from './tools/update';
import { registerWorkingClearTool } from './tools/working-clear';
import { registerWorkingGetTool } from './tools/working-get';
import { registerWorkingListTool } from './tools/working-list';
import { registerWorkingSetTool } from './tools/working-set';

export const server = new McpServer({
  name: 'clew-memory',
  version: packageJson.version,
});

export function createServer() {
  registerRememberTool(server);
  registerRecallTool(server);
  registerForgetTool(server);
  registerHandoffTool(server);
  registerReflectTool(server);
  registerUpdateTool(server);
  registerSupersedeTool(server);
  registerTimelineAddTool(server);
  registerTimelineRecentTool(server);
  registerTimelineSearchTool(server);
  registerTimelineSummaryTool(server);
  registerFeedbackAddTool(server);
  registerFeedbackListTool(server);
  registerWorkingSetTool(server);
  registerWorkingGetTool(server);
  registerWorkingListTool(server);
  registerWorkingClearTool(server);
  registerReflectSessionTool(server);
  return server;
}

async function main() {
  createServer();
  runMigrations();

  if (process.env.CLEW_MEMORY_HTTP === '1') {
    await startHttpServer();
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('clew-memory MCP server running on stdio');
}

function isMainModule() {
  const entry = process.argv[1];
  return entry ? resolve(entry) === fileURLToPath(import.meta.url) : false;
}

if (isMainModule()) {
  const command = process.argv[2];

  if (command && command !== 'mcp') {
    runCli(process.argv.slice(2)).catch((error) => {
      console.error('Fatal clew-memory CLI error:', error);
      closeDatabase();
      process.exit(1);
    });
  }

  main().catch((error) => {
    console.error('Fatal clew-memory startup error:', error);
    closeDatabase();
    process.exit(1);
  });
}

export default server;
