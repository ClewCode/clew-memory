import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import packageJson from '../package.json';
import { closeDatabase, runMigrations } from './db/client';
import { startHttpServer } from './http/server';
import { registerForgetTool } from './tools/forget';
import { registerHandoffTool } from './tools/handoff';
import { registerRecallTool } from './tools/recall';
import { registerReflectTool } from './tools/reflect';
import { registerRememberTool } from './tools/remember';

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
  main().catch((error) => {
    console.error('Fatal clew-memory startup error:', error);
    closeDatabase();
    process.exit(1);
  });
}

export default server;
