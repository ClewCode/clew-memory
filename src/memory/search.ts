import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { memories, memoryTags } from '../db/schema';
import { embedText } from '../embeddings/embedder';
import type { RecallInput, RecallResult } from './store';

export type DebugRecallResult = RecallResult & {
  score_vector: number;
  score_fts: number;
  score_importance: number;
  score_recency: number;
  score_access: number;
};

export async function hybridSearch(input: RecallInput): Promise<RecallResult[]> {
  const queryEmbedding = await embedText(input.query);
  const ftsQuery = toFtsQuery(input.query);
  const tags = (input.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const limit = Math.min(input.limit ?? 5, 200);

  const tagFilter =
    tags.length > 0
      ? sql`EXISTS (
          SELECT 1
          FROM memory_tags mt
          WHERE mt.memory_id = ${memories.id}
            AND ${inArray(memoryTags.tag, tags)}
        )`
      : undefined;
  const ftsScores = db
    .select({
      id: sql<string>`f.id`,
      score_fts: sql<number>`1.0 / (1.0 + ABS(bm25(f, 5.0, 1.0)))`,
    })
    .from(sql`memories_fts f`)
    .where(ftsQuery ? sql`f MATCH ${ftsQuery}` : undefined)
    .as('fts_scores');

  const rows = await db
    .select({
      id: memories.id,
      content: memories.content,
      tags: memories.tags,
      agent: memories.agent,
      created_at: memories.created_at,
      score: sql<number>`
        0.55 * COALESCE(vector_scores.score_vector, 0)
        + 0.25 * COALESCE(fts_scores.score_fts, 0)
        + 0.10 * ${memories.importance}
        + 0.05 * (1.0 / (1.0 + (${Date.now()} - ${memories.created_at}) / 86400000.0 * COALESCE(${memories.decay_rate}, 0.01)))
        + 0.05 * (1.0 / (1.0 + (${memories.access_count} / 10.0)))
      `,
    })
    .from(memories)
    .leftJoin(
      db
        .select({
          id: sql<string>`m.id`,
          score_vector: sql<number>`1.0 - vec_distance_cosine(m.embedding, ${queryEmbedding})`,
        })
        .from(sql`memories m`)
        .as('vector_scores'),
      (vectorScores) => eq(vectorScores.id, memories.id),
    )
    .leftJoin(ftsScores, (ftsScoreRow) => eq(ftsScoreRow.id, memories.id))
    .where(
      and(
        input.agent ? eq(memories.agent, input.agent) : undefined,
        input.project ? eq(memories.project, input.project) : undefined,
        tagFilter,
        isNull(memories.superseded_by),
        or(isNull(memories.decay_at), lt(memories.decay_at, Date.now())),
      ),
    )
    .orderBy(sql`score DESC`)
    .limit(limit);

  const results = rows.map((row) => ({
    id: row.id,
    content: row.content,
    score: Number(row.score ?? 0),
    tags: Array.isArray(row.tags) ? row.tags : [],
    agent: row.agent,
    created_at: row.created_at,
  }));

  if (results.length > 0) {
    const resultIds = results.map((r) => r.id);
    await db
      .update(memories)
      .set({
        access_count: sql`access_count + 1`,
        last_accessed_at: Date.now(),
      })
      .where(inArray(memories.id, resultIds));
  }

  return results;
}

export async function hybridSearchDebug(input: RecallInput): Promise<DebugRecallResult[]> {
  const queryEmbedding = await embedText(input.query);
  const ftsQuery = toFtsQuery(input.query);
  const limit = Math.min(input.limit ?? 5, 200);
  const now = Date.now();

  const ftsScores = db
    .select({
      id: sql<string>`f.id`,
      score_fts: sql<number>`1.0 / (1.0 + ABS(bm25(f, 5.0, 1.0)))`,
    })
    .from(sql`memories_fts f`)
    .where(ftsQuery ? sql`f MATCH ${ftsQuery}` : undefined)
    .as('fts_scores');

  const rows = await db
    .select({
      id: memories.id,
      content: memories.content,
      tags: memories.tags,
      agent: memories.agent,
      created_at: memories.created_at,
      score: sql<number>`
        0.55 * COALESCE(vector_scores.score_vector, 0)
        + 0.25 * COALESCE(fts_scores.score_fts, 0)
        + 0.10 * ${memories.importance}
        + 0.05 * (1.0 / (1.0 + (${now} - ${memories.created_at}) / 86400000.0 * COALESCE(${memories.decay_rate}, 0.01)))
        + 0.05 * (1.0 / (1.0 + (${memories.access_count} / 10.0)))
      `,
      score_vector: sql<number>`COALESCE(vector_scores.score_vector, 0)`,
      score_fts: sql<number>`COALESCE(fts_scores.score_fts, 0)`,
      score_importance: sql<number>`${memories.importance}`,
      score_recency: sql<number>`1.0 / (1.0 + (${now} - ${memories.created_at}) / 86400000.0 * COALESCE(${memories.decay_rate}, 0.01))`,
      score_access: sql<number>`1.0 / (1.0 + (${memories.access_count} / 10.0))`,
    })
    .from(memories)
    .leftJoin(
      db
        .select({
          id: sql<string>`m.id`,
          score_vector: sql<number>`1.0 - vec_distance_cosine(m.embedding, ${queryEmbedding})`,
        })
        .from(sql`memories m`)
        .as('vector_scores'),
      (vectorScores) => eq(vectorScores.id, memories.id),
    )
    .leftJoin(ftsScores, (ftsScoreRow) => eq(ftsScoreRow.id, memories.id))
    .where(
      and(
        input.agent ? eq(memories.agent, input.agent) : undefined,
        input.project ? eq(memories.project, input.project) : undefined,
        isNull(memories.superseded_by),
        or(isNull(memories.decay_at), lt(memories.decay_at, now)),
      ),
    )
    .orderBy(sql`score DESC`)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    score: Number(row.score ?? 0),
    tags: Array.isArray(row.tags) ? row.tags : [],
    agent: row.agent,
    created_at: row.created_at,
    score_vector: Number((row as Record<string, unknown>).score_vector ?? 0),
    score_fts: Number((row as Record<string, unknown>).score_fts ?? 0),
    score_importance: Number((row as Record<string, unknown>).score_importance ?? 0),
    score_recency: Number((row as Record<string, unknown>).score_recency ?? 0),
    score_access: Number((row as Record<string, unknown>).score_access ?? 0),
  }));
}

export function toFtsQuery(query: string) {
  const terms = query
    .match(/[a-zA-Z0-9_]{2,}/g)
    ?.map((term) => `${term.replace(/[^a-zA-Z0-9_]/g, '')}*`)
    .join(' ');

  return terms && terms.length > 0 ? terms : undefined;
}
