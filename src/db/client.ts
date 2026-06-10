import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

import * as schema from './schema';

export const DEFAULT_DB_PATH = resolve(homedir(), '.clew-memory', 'memory.db');

export function getDatabasePath() {
  return process.env.CLEW_MEMORY_DB ?? DEFAULT_DB_PATH;
}

export function createDatabaseClient(path = getDatabasePath()) {
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  sqliteVec.load(sqlite);

  return sqlite;
}

export const sqlite = createDatabaseClient();
export const db = drizzle(sqlite, { schema });

export function runMigrations(database = sqlite) {
  const migrations = [
    {
      name: '0000_init',
      sql: `
        CREATE TABLE IF NOT EXISTS __clew_memory_migrations (
          name TEXT PRIMARY KEY,
          applied_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
        );

        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          summary TEXT,
          embedding BLOB NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          agent TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          project TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          confidence REAL NOT NULL DEFAULT 1.0,
          decay_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          summary TEXT NOT NULL,
          agent TEXT NOT NULL,
          project TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS memory_tags (
          memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
          tag TEXT NOT NULL,
          PRIMARY KEY (memory_id, tag)
        );

        CREATE INDEX IF NOT EXISTS memories_agent_project_created_at_idx
          ON memories (agent, project, created_at DESC);

        CREATE INDEX IF NOT EXISTS memories_decay_at_idx
          ON memories (decay_at);

        CREATE INDEX IF NOT EXISTS memory_tags_tag_idx
          ON memory_tags (tag);

        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          id UNINDEXED,
          content,
          summary,
          tokenize = 'porter unicode61'
        );

        CREATE TRIGGER IF NOT EXISTS memories_fts_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memories_fts(rowid, id, content, summary)
          VALUES (new.rowid, new.id, new.content, COALESCE(new.summary, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS memories_fts_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, id, content, summary)
          VALUES ('delete', old.rowid, old.id, old.content, COALESCE(old.summary, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS memories_fts_au AFTER UPDATE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, id, content, summary)
          VALUES ('delete', old.rowid, old.id, old.content, COALESCE(old.summary, ''));
          INSERT INTO memories_fts(rowid, id, content, summary)
          VALUES (new.rowid, new.id, new.content, COALESCE(new.summary, ''));
        END;
      `,
    },
  ];

  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS __clew_memory_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
    );
  `);
  sqliteVec.load(database);

  const applied = new Set(
    database
      .prepare('SELECT name FROM __clew_memory_migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  );

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      continue;
    }

    database.transaction(() => {
      database.exec(migration.sql);
      database.prepare('INSERT INTO __clew_memory_migrations(name) VALUES (?)').run(migration.name);
    })();
  }
}

export function closeDatabase() {
  sqlite.close();
}
