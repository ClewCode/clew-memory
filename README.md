# clew-memory

A standalone MCP Memory Layer for AI coding agents such as Claude Code, Clew, and Cursor. It stores local memory entries in SQLite, embeds them with a local Transformers.js model, and retrieves relevant memories with hybrid vector + FTS5 search.

## What is clew-memory

`clew-memory` exposes five MCP tools:

- Remember durable notes and project context.
- Recall relevant memories by semantic similarity and full-text search.
- Forget memories by id or by query with explicit confirmation.
- Store handoff summaries for session transitions.
- Reflect relevant memories into an XML injection block for agents that support structured context injection.

All storage is local. The default database is:

```text
~/.clew-memory/memory.db
```

Override it with:

```bash
CLEW_MEMORY_DB=/path/to/memory.db
```

## Install

Install globally with Bun:

```bash
bun add -g clew-memory
```

Or run directly without installing:

```bash
bunx clew-memory
```

If you are developing the package locally:

```bash
bun install
bun run build
bun run start
```

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

Add the server to Claude Code's MCP config:

```json
{
  "mcpServers": {
    "clew-memory": {
      "command": "bunx",
      "args": ["clew-memory"],
      "env": {
        "CLEW_MEMORY_DB": "/Users/YOU/.clew-memory/memory.db"
      }
    }
  }
}
```

Or use a local checkout:

```json
{
  "mcpServers": {
    "clew-memory": {
      "command": "bun",
      "args": ["run", "src/index.ts"],
      "cwd": "/path/to/clew-memory"
    }
  }
}
```

## Usage with Clew

Add this to your `.mcp.json` or equivalent Clew MCP configuration:

```json
{
  "mcpServers": {
    "clew-memory": {
      "command": "bunx",
      "args": ["clew-memory"],
      "env": {
        "CLEW_MEMORY_DB": "/Users/YOU/.clew-memory/memory.db"
      }
    }
  }
}
```

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

| Tool | Input | Output | Description |
| --- | --- | --- | --- |
| `clew_remember` | `{ content, tags?, agent?, provider?, model?, project? }` | `{ id, status: "stored" }` | Embed and store a memory. |
| `clew_recall` | `{ query, limit?, agent?, project?, tags? }` | `{ memories: [{ id, content, score, tags, agent, created_at }] }` | Run hybrid vector + FTS search. |
| `clew_forget` | `{ id }` or `{ query, confirm: true }` | `{ deleted: number }` | Delete one memory or delete all query matches after confirmation. |
| `clew_handoff` | `{ summary, project?, agent? }` | `{ id, status: "handoff_stored" }` | Store a session summary tagged as `handoff`. |
| `clew_reflect` | `{ context, limit? }` | `{ injection: "<clew_memory>...</clew_memory>" }` | Recall relevant memories and format them as an XML injection block. |

## Storage location

The database defaults to:

```text
~/.clew-memory/memory.db
```

Set `CLEW_MEMORY_DB` to place it somewhere else:

```bash
export CLEW_MEMORY_DB=/tmp/clew-memory.db
bun run start
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
  "by_agent": {
    "claude-code": 8,
    "cursor": 4
  },
  "by_project": {
    "my-project": 12
  },
  "avg_confidence": 0.98
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
