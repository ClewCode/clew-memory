import { count, desc, eq, inArray, sql } from 'drizzle-orm';
import { ulid } from 'ulid';

import { db } from '../db/client';
import { type Memory, memories, memoryTags } from '../db/schema';
import { embedText } from '../embeddings/embedder';
import { summarizeContent } from './summarize';

export type RememberInput = {
  content: string;
  tags?: string[] | undefined;
  agent?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  project?: string | undefined;
  confidence?: number;
  decayAt?: number;
};

export type RecallInput = {
  query: string;
  limit?: number | undefined;
  agent?: string | undefined;
  project?: string | undefined;
  tags?: string[] | undefined;
};

export type PublicMemory = {
  id: string;
  content: string;
  summary?: string | null;
  tags: string[];
  agent: string;
  provider: string;
  model: string;
  project?: string | null;
  created_at: number;
  updated_at: number;
  confidence: number;
};

export type RecallResult = {
  id: string;
  content: string;
  score: number;
  tags: string[];
  agent: string;
  created_at: number;
};

export async function remember(input: RememberInput) {
  const now = Date.now();
  const embedding = await embedText(input.content);
  const summary = summarizeContent(input.content);
  const tags = normalizeTags(input.tags);
  const id = ulid();

  const [memory] = await db
    .insert(memories)
    .values({
      id,
      content: input.content,
      summary,
      embedding: Buffer.from(embedding.buffer),
      tags,
      agent: input.agent ?? 'unknown',
      provider: input.provider ?? 'local',
      model: input.model ?? 'unknown',
      project: input.project ?? null,
      created_at: now,
      updated_at: now,
      confidence: input.confidence ?? 1,
      decay_at: input.decayAt ?? null,
    })
    .returning();

  if (!memory) {
    throw new Error('Failed to store memory');
  }

  await replaceTags(id, tags);

  return toPublicMemory(memory);
}

export async function recall(input: RecallInput) {
  const { hybridSearch } = await import('./search');
  return hybridSearch(input);
}

export async function getMemory(id: string) {
  const memory = await db.query.memories.findFirst({
    where: eq(memories.id, id),
  });

  return memory ? toPublicMemory(memory) : undefined;
}

export async function listMemories(limit = 50, offset = 0) {
  const rows = await db
    .select()
    .from(memories)
    .orderBy(desc(memories.created_at))
    .limit(Math.min(limit, 200))
    .offset(offset);

  return rows.map(toPublicMemory);
}

export async function forgetById(id: string) {
  const result = await db.delete(memories).where(eq(memories.id, id)).run();
  return result.changes;
}

export async function forgetMany(ids: string[]) {
  if (ids.length === 0) {
    return 0;
  }

  const result = await db.delete(memories).where(inArray(memories.id, ids)).run();
  return result.changes;
}

export async function countMemories() {
  const row = await db.select({ count: count() }).from(memories).get();
  return row?.count ?? 0;
}

export async function stats() {
  const totalRow = await db.select({ count: count() }).from(memories).get();
  const avgRow = await db.select({ avg: sql<number>`AVG(confidence)` }).from(memories).get();
  const agentRows = await db
    .select({ agent: memories.agent, count: count() })
    .from(memories)
    .groupBy(memories.agent);
  const projectRows = await db
    .select({ project: memories.project, count: count() })
    .from(memories)
    .groupBy(memories.project);

  return {
    total: totalRow?.count ?? 0,
    by_agent: Object.fromEntries(agentRows.map((row) => [row.agent, row.count])),
    by_project: Object.fromEntries(projectRows.map((row) => [row.project ?? '(none)', row.count])),
    avg_confidence: Number(avgRow?.avg ?? 0),
  };
}

export async function replaceTags(memoryId: string, tags: string[]) {
  await db.delete(memoryTags).where(eq(memoryTags.memoryId, memoryId)).run();

  if (tags.length === 0) {
    return;
  }

  await db
    .insert(memoryTags)
    .values(tags.map((tag) => ({ memoryId, tag })))
    .run();
}

export function normalizeTags(tags?: string[]) {
  return Array.from(
    new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0)),
  );
}

export function toPublicMemory(memory: Memory): PublicMemory {
  return {
    id: memory.id,
    content: memory.content,
    summary: memory.summary,
    tags: Array.isArray(memory.tags) ? memory.tags : [],
    agent: memory.agent,
    provider: memory.provider,
    model: memory.model,
    project: memory.project,
    created_at: memory.created_at,
    updated_at: memory.updated_at,
    confidence: memory.confidence,
  };
}
