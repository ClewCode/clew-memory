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
