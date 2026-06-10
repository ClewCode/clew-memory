import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';

let hasNativeBindings = false;

try {
  const bs3 = await import('better-sqlite3');
  new bs3.default(':memory:');
  hasNativeBindings = true;
} catch {
  // native bindings not available (e.g. Windows without build tools)
}

describe('integration tests', () => {
  if (!hasNativeBindings) {
    test.skip('skipped: native better-sqlite3 bindings unavailable on this platform', () => {});
    return;
  }

  let remember: typeof import('./memory/store').remember;
  let recall: typeof import('./memory/store').recall;
  let addMemoryFeedback: typeof import('./memory/store').addMemoryFeedback;
  let recentTimelineEvents: typeof import('./memory/store').recentTimelineEvents;
  let workingSet: typeof import('./memory/store').workingSet;
  let workingGet: typeof import('./memory/store').workingGet;
  let workingClear: typeof import('./memory/store').workingClear;
  let reflectSession: typeof import('./memory/store').reflectSession;
  let getMemory: typeof import('./memory/store').getMemory;

  beforeAll(async () => {
    process.env.CLEW_MEMORY_DB = ':memory:';
    process.env.CLEW_SESSION_ID = 'test-session';

    mock.module('./embeddings/embedder', () => ({
      embedText: async () => new Float32Array(384).fill(0.1),
    }));

    const store = await import('./memory/store');

    remember = store.remember;
    recall = store.recall;
    addMemoryFeedback = store.addMemoryFeedback;
    recentTimelineEvents = store.recentTimelineEvents;
    workingSet = store.workingSet;
    workingGet = store.workingGet;
    workingClear = store.workingClear;
    reflectSession = store.reflectSession;
    getMemory = store.getMemory;
  });

  afterAll(async () => {
    try {
      const client = await import('./db/client');
      client.closeDatabase();
    } catch {
      // database was already closed
    }
  });

  test('stores a memory with clew_remember', async () => {
    const memory = await remember({
      content: 'The auth middleware validates JWT tokens in the request pipeline.',
      tags: ['auth', 'middleware'],
      agent: 'claude-code',
    });

    expect(memory.id).toBeDefined();
    expect(memory.content).toContain('auth middleware');
    expect(memory.tags).toContain('auth');
    expect(memory.importance).toBe(0.5);
  });

  test('redacts API keys from stored content', async () => {
    const memory = await remember({
      content: 'Set API_KEY=sk-secret-token-12345 in .env',
      tags: ['env'],
    });

    expect(memory.content).not.toContain('sk-secret-token-12345');
    expect(memory.content).toContain('[REDACTED]');
  });

  test('recalls stored memory by query', async () => {
    const results = await recall({
      query: 'authentication middleware',
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    const match = results.find((r) => r.content.includes('auth middleware'));
    expect(match).toBeDefined();
    expect(match!.score).toBeGreaterThan(0);
  });

  test('records feedback and adjusts importance', async () => {
    const results = await recall({ query: 'auth middleware', limit: 1 });
    expect(results.length).toBeGreaterThan(0);
    const memoryId = results[0]!.id;

    await addMemoryFeedback({ memoryId, signal: 'important' });
    const updated = await getMemory(memoryId);
    expect(updated?.importance).toBeGreaterThan(0.5);
  });

  test('wrong signal reduces confidence', async () => {
    const results = await recall({ query: 'auth middleware', limit: 1 });
    expect(results.length).toBeGreaterThan(0);
    const memoryId = results[0]!.id;

    await addMemoryFeedback({ memoryId, signal: 'wrong' });
    const updated = await getMemory(memoryId);
    expect(updated?.confidence).toBeLessThan(1.0);
  });

  test('has timeline events from remember and feedback', async () => {
    const events = await recentTimelineEvents(20);
    const eventTypes = events.map((e) => e.event_type);
    expect(eventTypes).toContain('memory_added');
  });

  test('working memory set and get', async () => {
    const entry = await workingSet({
      key: 'current_task',
      value: 'review auth middleware',
      sessionId: 'test-session',
    });

    expect(entry?.id).toBeDefined();

    const found = await workingGet({
      key: 'current_task',
      sessionId: 'test-session',
    });

    expect(found).toBeDefined();
    expect(found!.value).toBe('review auth middleware');
  });

  test('working memory clear', async () => {
    await workingSet({
      key: 'temp_key',
      value: 'temp value',
      sessionId: 'test-session-clear',
    });

    const deleted = await workingClear({ sessionId: 'test-session-clear' });
    expect(deleted).toBeGreaterThan(0);
  });

  test('produces session reflection output', async () => {
    const result = await reflectSession({
      sessionId: 'test-session',
      limit: 10,
    });

    expect(result.session_summary).toBeDefined();
    expect(result.learned_taste).toBeInstanceOf(Array);
    expect(result.stored_memory_ids.length).toBeGreaterThan(0);
  });
});
