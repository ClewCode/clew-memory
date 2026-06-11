import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

let hasNativeBindings = false;

try {
  const bs3 = await import('better-sqlite3');
  new bs3.default(':memory:');
  hasNativeBindings = true;
} catch {
  // native bindings not available
}

describe('migration compatibility', () => {
  if (!hasNativeBindings) {
    test.skip('skipped: native better-sqlite3 bindings unavailable on this platform', () => {});
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Database: any;
  let sqliteVec: any;
  let database: any;

  beforeAll(async () => {
    const bs3 = await import('better-sqlite3');
    Database = bs3.default;
    sqliteVec = await import('sqlite-vec');
    database = new Database(':memory:');
    sqliteVec.load(database);

    database.exec(`
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

      INSERT INTO memories(id, content, summary, embedding, tags, agent, provider, model, created_at, updated_at, confidence)
      VALUES (
        'test-001',
        'Old memory content',
        'Old summary',
        x'0000',
        '["old"]',
        'claude-code',
        'local',
        'test',
        1000,
        1000,
        1.0
      );
    `);
  });

  afterAll(() => {
    database?.close();
  });

  function applyInlineMigration(db: typeof database, migrationName: string, sql: string) {
    const applied = db
      .prepare('SELECT name FROM __clew_memory_migrations WHERE name = ?')
      .get(migrationName);

    if (applied) {
      return;
    }

    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO __clew_memory_migrations(name) VALUES (?)').run(migrationName);
    })();
  }

  test('applies 0000_init and 0001 migrations', () => {
    const applied = database.prepare('SELECT name FROM __clew_memory_migrations').all() as Array<{
      name: string;
    }>;

    expect(applied.length).toBe(0);

    applyInlineMigration(
      database,
      '0000_init',
      `
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, summary TEXT NOT NULL, agent TEXT NOT NULL, project TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_tags (memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE, tag TEXT NOT NULL, PRIMARY KEY (memory_id, tag));
      CREATE TABLE IF NOT EXISTS memory_trace (id TEXT PRIMARY KEY, tool_name TEXT NOT NULL, query TEXT, client TEXT NOT NULL DEFAULT 'unknown', project TEXT, result_count INTEGER NOT NULL DEFAULT 0, selected_ids_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_timeline (id TEXT PRIMARY KEY, scope TEXT NOT NULL DEFAULT 'project', project TEXT, session_id TEXT, client TEXT NOT NULL DEFAULT 'unknown', actor TEXT NOT NULL DEFAULT 'agent', event_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, entity_type TEXT, entity_id TEXT, tags_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_feedback (id TEXT PRIMARY KEY, memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE, timeline_id TEXT, signal TEXT NOT NULL, note TEXT, client TEXT NOT NULL DEFAULT 'unknown', created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS working_memory (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    `,
    );

    applyInlineMigration(
      database,
      '0001_client_aware_memory',
      `
      ALTER TABLE memories ADD COLUMN client TEXT NOT NULL DEFAULT 'unknown';
      ALTER TABLE memories ADD COLUMN workspace_root TEXT;
      ALTER TABLE memories ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
      ALTER TABLE memories ADD COLUMN superseded_by TEXT;
      ALTER TABLE memories ADD COLUMN superseded_at INTEGER;
      ALTER TABLE memories ADD COLUMN superseded_reason TEXT;
      ALTER TABLE memories ADD COLUMN importance REAL NOT NULL DEFAULT 0.5;
      ALTER TABLE memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE memories ADD COLUMN last_accessed_at INTEGER;
      ALTER TABLE memories ADD COLUMN decay_rate REAL NOT NULL DEFAULT 0.01;
    `,
    );

    const after = database.prepare('SELECT name FROM __clew_memory_migrations').all() as Array<{
      name: string;
    }>;

    expect(after).toHaveLength(2);

    applyInlineMigration(
      database,
      '0002_tree_path',
      `
        ALTER TABLE memories ADD COLUMN IF NOT EXISTS tree_path TEXT NOT NULL DEFAULT '[]';
        CREATE INDEX IF NOT EXISTS memories_tree_path_idx ON memories (tree_path);
      `,
    );

    const after2 = database.prepare('SELECT name FROM __clew_memory_migrations').all() as Array<{
      name: string;
    }>;

    expect(after2).toHaveLength(3);
  });

  test('new columns exist after migration', () => {
    const cols = database.prepare('PRAGMA table_info(memories)').all() as Array<{ name: string }>;

    const names = cols.map((c) => c.name);
    for (const col of [
      'client',
      'kind',
      'importance',
      'access_count',
      'decay_rate',
      'superseded_by',
      'tree_path',
    ]) {
      expect(names).toContain(col);
    }
  });

  test('old memory still exists with defaulted new columns', () => {
    const row = database
      .prepare(
        'SELECT id, content, client, kind, importance, access_count, superseded_by FROM memories WHERE id = ?',
      )
      .get('test-001') as Record<string, unknown>;

    expect(row.id).toBe('test-001');
    expect(row.content).toBe('Old memory content');
    expect(row.client).toBe('unknown');
    expect(row.kind).toBe('note');
    expect(row.importance).toBe(0.5);
    expect(row.access_count).toBe(0);
    expect(row.superseded_by).toBeNull();
  });

  test('new tables exist', () => {
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;

    const names = tables.map((t) => t.name);
    for (const table of ['memory_trace', 'memory_timeline', 'memory_feedback', 'working_memory']) {
      expect(names).toContain(table);
    }
  });
});
