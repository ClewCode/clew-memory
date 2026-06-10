import { blob, index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  summary: text('summary'),
  embedding: blob('embedding', { mode: 'buffer' }).notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  agent: text('agent').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  project: text('project'),
  created_at: integer('created_at', { mode: 'number' }).notNull(),
  updated_at: integer('updated_at', { mode: 'number' }).notNull(),
  confidence: real('confidence').notNull().default(1.0),
  decay_at: integer('decay_at', { mode: 'number' }),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  summary: text('summary').notNull(),
  agent: text('agent').notNull(),
  project: text('project'),
  created_at: integer('created_at', { mode: 'number' }).notNull(),
});

export const memoryTags = sqliteTable(
  'memory_tags',
  {
    memoryId: text('memory_id')
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.memoryId, table.tag], name: 'memory_tags_pk' }),
    memoryIdIdx: index('memory_tags_memory_id_idx').on(table.memoryId),
    tagIdx: index('memory_tags_tag_idx').on(table.tag),
  }),
);

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type MemoryTag = typeof memoryTags.$inferSelect;
