#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import packageJson from '../package.json';
import { runCli } from './cli';
import { closeDatabase, runMigrations } from './db/client';
import { startHttpServer } from './http/server';
import { startLoop } from './self-improvement';
import { registerBatchRememberTool } from './tools/batch-remember';
import { registerExportImportTools } from './tools/export-import';
import { registerFeedbackTool } from './tools/feedback';
import { registerForgetTool } from './tools/forget';
import { registerHandoffTool } from './tools/handoff';
import { registerRecallTool } from './tools/recall';
import { registerReflectTool } from './tools/reflect';
import { registerReflectSessionTool } from './tools/reflect-session';
import { registerRememberTool } from './tools/remember';
import { registerSelfImproveTool } from './tools/self-improve';
import { registerStatsTool } from './tools/stats';
import { registerSupersedeTool } from './tools/supersede';
import { registerTimelineTool } from './tools/timeline';
import { registerTreeTool } from './tools/tree';
import { registerUpdateTool } from './tools/update';
import { registerWorkingTool } from './tools/working';

export const server = new McpServer({
  name: 'clew-memory',
  version: packageJson.version,
});

export function createServer() {
  registerRememberTool(server);
  registerRecallTool(server);
  registerSelfImproveTool(server);
  registerForgetTool(server);
  registerHandoffTool(server);
  registerReflectTool(server);
  registerReflectSessionTool(server);
  registerUpdateTool(server);
  registerSupersedeTool(server);
  registerStatsTool(server);
  registerTreeTool(server);
  registerBatchRememberTool(server);
  registerExportImportTools(server);
  registerWorkingTool(server);
  registerFeedbackTool(server);
  registerTimelineTool(server);
  return server;
}

async function main() {
  createServer();
  runMigrations();

  if (process.env.CLEW_MEMORY_HTTP === '1') {
    await startHttpServer();
  }

  if (process.env.CLEW_MEMORY_SELF_IMPROVE === '1') {
    const interval = Number(process.env.CLEW_MEMORY_IMPROVE_INTERVAL) || 30 * 60 * 1000;
    startLoop(interval);
    console.error(`clew-memory self-improvement loop started (interval: ${interval}ms)`);
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
