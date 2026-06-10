import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { memories, memoryTags } from '../db/schema';
import { embedText } from '../embeddings/embedder';
import type { RecallInput, RecallResult } from './store';

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
        0.7 * COALESCE(vector_scores.score_vector, 0)
        + 0.3 * COALESCE(fts_scores.score_fts, 0)
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
        or(isNull(memories.decay_at), lt(memories.decay_at, Date.now())),
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
  }));
}

export function toFtsQuery(query: string) {
  const terms = query
    .match(/[a-zA-Z0-9_]{2,}/g)
    ?.map((term) => `${term.replace(/[^a-zA-Z0-9_]/g, '')}*`)
    .join(' ');

  return terms && terms.length > 0 ? terms : undefined;
}
