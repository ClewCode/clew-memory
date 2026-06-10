# clew-memory

A standalone MCP Memory Layer for AI coding agents such as Claude Code, Clew, and Cursor. It stores local memory entries in SQLite, embeds them with a local Transformers.js model, and retrieves relevant memories with hybrid vector + FTS5 search.

## What is clew-memory

`clew-memory` is a brain-like MCP memory server with 17 tools across 5 systems:

- **Memory storage** — remember, recall, update, supersede, forget
- **Timeline** — append-only event log with FTS5 search and summarization
- **Trace** — record every recall and reflect call for auditing
- **Feedback** — user signals (accepted, rejected, corrected, preferred, etc.) that adjust importance and confidence
- **Working memory** — session-scoped key-value store for transient state
- **Reflection** — session reflection that produces handoffs, learned taste, decisions, and next actions

All storage is local. By default, each project gets its own database at `PROJECT_ROOT/.clew/memory.db`. The global fallback `~/.clew-memory/memory.db` is only used when `CLEW_MEMORY_SCOPE=global` is set.

Override the database path with:

```bash
CLEW_MEMORY_DB=/path/to/memory.db
```

## Install

Install globally with Bun:

```bash
bun add -g clew-memory
```

Install globally with npm:

```bash
npm install -g clew-memory
```

Or run directly without installing:

```bash
bunx clew-memory
npx clew-memory
```

If you are developing the package locally:

```bash
bun install
bun run build
bun run start
```

The package publishes a Node-compatible build in `dist/index.js`. Runtime uses Node `>=24` because the native `better-sqlite3` and `sqlite-vec` dependencies load through Node bindings.

## npm package publishing

The package is configured for public npm publishing. Before publishing, run:

```bash
bun run lint
bunx tsc --noEmit
npm pack --dry-run
```

Publish a new version with:

```bash
npm publish --access public
```

Do not publish unless you intend to release the current version to the public npm registry.

## Docker

Build the image:

```bash
docker build -t clew-memory:latest .
```

Run the MCP stdio server with persistent storage:

```bash
docker run --rm -i \
  -v clew-memory-data:/data \
  -e CLEW_MEMORY_DB=/data/memory.db \
  clew-memory:latest
```

For MCP clients that launch Docker, use the image as the command target:

```json
{
  "mcpServers": {
    "clew-memory": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "clew-memory-data:/data",
        "-e",
        "CLEW_MEMORY_DB=/data/memory.db",
        "clew-memory:latest"
      ]
    }
  }
}
```

The optional HTTP API can be enabled in Docker Compose:

```bash
docker compose up
```

By default, Compose exposes `GET /health`, `GET /stats`, `GET /memories`, and `DELETE /memories/:id` on `http://localhost:7337`.

The Docker image uses Bun to build the project, then runs a Node-compatible bundle with native `better-sqlite3` and `sqlite-vec` dependencies kept external so the native addons load correctly at runtime.

## Usage with Claude Code

### Project memory (default)

Each project gets its own `PROJECT_ROOT/.clew/memory.db`. Claude Code sets `CLAUDE_PROJECT_DIR` automatically.

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "clew-memory": {
      "command": "bunx",
      "args": ["clew-memory"]
    }
  }
}
```

Or add it with the CLI:

```bash
claude mcp add clew-memory -- bunx clew-memory
```

### Global memory (opt-in)

To share memory across all projects:

```bash
claude mcp add clew-memory -- bunx clew-memory
# Then edit .mcp.json to add:
#   "env": { "CLEW_MEMORY_SCOPE": "global" }
```

### Typical Claude Code workflow

```bash
# In your project, the agent can:
# Remember: "clew_remember" tool stores context
# Recall: "clew_recall" finds relevant past context
# Feedback: "clew_feedback_add" adjusts importance/confidence
# Reflect: "clew_reflect_session" produces session summary
```

## Usage with ClewCode

### Project memory (default)

ClewCode sets `CLEW_PROJECT_DIR` automatically. Memory is stored at `$CLEW_PROJECT_DIR/.clew/memory.db`.

Add this to your ClewCode memory config (`.mcp.json`):

```json
{
  "mcpServers": {
    "clew-memory": {
      "command": "bunx",
      "args": ["clew-memory"]
    }
  }
}
```

### `/memory` command mapping

ClewCode's `/memory` command maps to clew-memory tools:

| Command             | clew-memory tool     |
|---------------------|----------------------|
| `/memory save`      | `clew_remember`      |
| `/memory search`    | `clew_recall`        |
| `/memory feedback`  | `clew_feedback_add`  |
| `/memory timeline`  | `clew_timeline_recent` |
| `/memory handoff`   | `clew_handoff`       |
| `/memory reflect`   | `clew_reflect_session` |

### Shared .clew/memory.db behavior

When `CLEW_MEMORY_SCOPE` is not set, clew-memory uses the project root's `.clew/memory.db`. Both Claude Code (`CLAUDE_PROJECT_DIR`) and ClewCode (`CLEW_PROJECT_DIR`) resolve to the same project directory, so memory is shared between both clients automatically.

## Usage with Cursor

In Cursor, open **Settings > Features > MCP Servers** and add a new MCP server:

```json
{
  "clew-memory": {
    "command": "bunx",
    "args": ["clew-memory"],
    "env": {
      "CLEW_MEMORY_DB": "/Users/YOU/.clew-memory/memory.db"
    }
  }
}
```

Restart Cursor after adding the server.

## MCP Tools reference

### Memory tools

| Tool | Input | Output | Description |
| --- | --- | --- | --- |
| `clew_remember` | `{ content, tags?, agent?, provider?, model?, project?, kind? }` | `{ id, status: "stored" }` | Embed and store a memory. |
| `clew_recall` | `{ query, limit?, agent?, project?, tags? }` | `{ memories: [{ id, content, score, tags, agent, created_at }] }` | Run hybrid vector + FTS search with importance/recency/access weighting. |
| `clew_update` | `{ id, content?, tags?, agent?, provider?, model?, project?, confidence?, decayAt? }` | `{ id, status: "updated" }` | Update an existing memory and recompute embedding when content changes. |
| `clew_supersede` | `{ id, replacementId?, reason? }` | `{ id, status: "superseded", superseded_by, superseded_at, superseded_reason }` | Mark a memory as superseded without deleting it. |
| `clew_forget` | `{ id }` or `{ query, confirm: true }` | `{ deleted: number }` | Permanently delete memory for privacy/security. |
| `clew_handoff` | `{ summary, project?, agent? }` | `{ id, status: "handoff_stored" }` | Store a session handoff summary. |
| `clew_reflect` | `{ context, limit? }` | `{ injection: "<clew_memory>...</clew_memory>" }` | Recall memories and format as XML injection block. |
| `clew_reflect_session` | `{ sessionId?, limit? }` | Session summary, learned taste, decisions, next actions, and stored memory IDs. | Reflect on recent timeline, traces, feedback, and memories. |

### Timeline tools

| Tool | Input | Output | Description |
| --- | --- | --- | --- |
| `clew_timeline_add` | `{ eventType, title, body?, entityType?, entityId?, tags?, metadata? }` | `{ id, status: "added" }` | Append a timeline event. Prefer summaries over raw prompts. |
| `clew_timeline_recent` | `{ limit? }` | `{ events: [...] }` | Return recent timeline events. |
| `clew_timeline_search` | `{ query, limit? }` | `{ events: [...] }` | Search timeline by title, body, and tags with FTS5. |
| `clew_timeline_summary` | `{ limit? }` | `{ total, by_event_type, recent_events }` | Summarize recent timeline by event type. |

### Feedback tools

| Tool | Input | Output | Description |
| --- | --- | --- | --- |
| `clew_feedback_add` | `{ memoryId, signal, note?, timelineId? }` | `{ status: "recorded" }` | Record feedback signal (accepted/rejected/corrected/preferred/disliked/important/wrong). |
| `clew_feedback_list` | `{ limit?, offset?, signal? }` | `{ feedback: [...] }` | List feedback records, optionally filtered by signal. |

### Working memory tools

| Tool | Input | Output | Description |
| --- | --- | --- | --- |
| `clew_working_set` | `{ key, value, sessionId?, expiresInMs? }` | `{ id, status: "stored" }` | Store a session-scoped key-value pair. |
| `clew_working_get` | `{ key, sessionId? }` | `{ found: bool, value? }` | Get a working memory value by key. |
| `clew_working_list` | `{ sessionId?, limit? }` | `{ entries: [...] }` | List all working memory entries. |
| `clew_working_clear` | `{ sessionId? }` | `{ deleted: number }` | Clear all working memory entries for a session. |

## Storage location

By default, each project gets its own database at `{workspace}/.clew/memory.db`. The workspace is detected from `CLAUDE_PROJECT_DIR` or `CLEW_PROJECT_DIR`, falling back to the current working directory. To use the global database, opt in with `CLEW_MEMORY_SCOPE=global`:

```bash
# Default: project-local
# Database: $CLAUDE_PROJECT_DIR/.clew/memory.db

# Opt-in: global
CLEW_MEMORY_SCOPE=global clew-memory init
```

Or override the path entirely:

```bash
CLEW_MEMORY_DB=/tmp/clew-memory.db clew-memory init
```

## HTTP API reference

The optional HTTP server listens on port `7337` by default. It is not required for MCP stdio operation.

### `GET /health`

```json
{
  "status": "ok",
  "memories": 12
}
```

### `GET /stats`

```json
{
  "total": 12,
  "by_agent": { "claude-code": 8, "cursor": 4 },
  "by_client": { "claude-code": 8, "clewcode": 4 },
  "by_kind": { "note": 6, "handoff": 3, "decision": 2, "taste": 1 },
  "by_project": { "my-project": 12 },
  "avg_confidence": 0.98,
  "traces": 45
}
```

### `GET /memories`

Query parameters:

- `limit` default `50`, max `200`
- `offset` default `0`

```json
{
  "memories": [
    {
      "id": "01J...",
      "content": "Remembered context",
      "summary": "Compressed context",
      "tags": ["handoff"],
      "agent": "claude-code",
      "project": "my-project",
      "created_at": 1710000000000,
      "confidence": 1
    }
  ]
}
```

### `DELETE /memories/:id`

Deletes a memory by id.

```json
{
  "deleted": 1
}
```

## Memory vs timeline vs trace vs feedback vs reflection

| System       | Table              | Purpose                                                                                 |
|--------------|--------------------|-----------------------------------------------------------------------------------------|
| **Memory**   | `memories`         | Durable knowledge stored with embeddings, tags, kind, client, and confidence.           |
| **Timeline** | `memory_timeline`  | Append-only event log. Records meaningful events (memory_added, recalled, superseded, etc.) with FTS5 search. |
| **Trace**    | `memory_trace`     | Raw recall/reflect instrumentation. Records tool name, query, client, and selected IDs. |
| **Feedback** | `memory_feedback`  | User signals (accepted, rejected, corrected, preferred, disliked, important, wrong) that adjust memory importance and confidence. |
| **Reflection**| (built-in tool)   | `clew_reflect_session` reads timeline, traces, feedback, and memories to produce handoffs, learned taste, decisions, and next actions. |

### Feedback behavior

| Signal      | Effect                                                                 |
|-------------|------------------------------------------------------------------------|
| `important` | Increases memory importance by 0.15                                     |
| `accepted`  | Increases confidence (+0.1) and importance (+0.05)                      |
| `preferred` | Increases importance (+0.1) and creates a timeline `taste_learned` event |
| `corrected` | Creates a timeline `user_correction` event                              |
| `rejected`  | Reduces confidence by 0.15                                              |
| `wrong`     | Reduces confidence by 0.3                                               |
| `disliked`  | Records the signal without changing scores                              |

### Working memory

Session-scoped key-value store. Each entry has an optional TTL. Default session is configurable via `CLEW_SESSION_ID`.

| Tool                | Description                       |
|---------------------|-----------------------------------|
| `clew_working_set`  | Store a key-value pair            |
| `clew_working_get`  | Get a value by key                |
| `clew_working_list` | List all entries for a session    |
| `clew_working_clear`| Clear all entries for a session   |
