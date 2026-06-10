import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';

import { recall as searchMemories } from '../memory/store';

const inputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(200).default(5).optional(),
  agent: z.string().optional(),
  project: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export function registerRecallTool(server: McpServer) {
  server.registerTool(
    'clew_recall',
    {
      description: 'Run hybrid vector cosine + FTS5 search over stored memories.',
      inputSchema,
    },
    async (args) => {
      try {
        const memories = await searchMemories(args);
        return textResult({
          memories: memories.map((memory) => ({
            id: memory.id,
            content: memory.content,
            score: memory.score,
            tags: memory.tags,
            agent: memory.agent,
            created_at: memory.created_at,
          })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

function textResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(error: unknown) {
  return textResult({ error: error instanceof Error ? error.message : String(error) });
}
