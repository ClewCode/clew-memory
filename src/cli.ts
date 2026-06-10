import { detectClient, getDatabasePath, getWorkspaceRoot } from './client';
import { runMigrations } from './db/client';
import {
  addMemoryFeedback,
  addTimelineEvent,
  clearTimeline,
  listMemoryFeedback,
  listMemoryTraces,
  recentTimelineEvents,
  recall as searchMemories,
  searchTimelineEvents,
  remember as storeMemory,
  supersedeMemory,
} from './memory/store';

export async function runCli(args: string[]) {
  const [command, ...rest] = args;

  switch (command) {
    case 'init':
      runMigrations();
      console.log(
        JSON.stringify(
          {
            status: 'ok',
            databasePath: getDatabasePath(),
            client: detectClient(),
            workspaceRoot: getWorkspaceRoot(),
          },
          null,
          2,
        ),
      );
      return;
    case 'remember':
      await runRemember(rest);
      return;
    case 'recall':
      await runRecall(rest);
      return;
    case 'trace':
      await runTrace(rest);
      return;
    case 'feedback':
      await runFeedback(rest);
      return;
    case 'timeline':
      await runTimeline(rest);
      return;
    case 'supersede':
      await runSupersede(rest);
      return;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    default:
      console.error(`Unknown clew-memory command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

async function runRemember(args: string[]) {
  const content = args.join(' ').trim();

  if (!content) {
    console.error(
      'Usage: clew-memory remember <content> [--tag tag] [--kind note] [--project project]',
    );
    process.exitCode = 1;
    return;
  }

  const memory = await storeMemory({
    content,
    tags: readTags(args),
    project: readFlag(args, 'project'),
    kind: readFlag(args, 'kind') ?? 'note',
  });

  console.log(JSON.stringify({ id: memory.id, status: 'stored' }, null, 2));
}

async function runRecall(args: string[]) {
  const query = args
    .filter((arg) => !arg.startsWith('--'))
    .join(' ')
    .trim();

  if (!query) {
    console.error('Usage: clew-memory recall <query> [--limit 5]');
    process.exitCode = 1;
    return;
  }

  const memories = await searchMemories({
    query,
    limit: Number(readFlag(args, 'limit') ?? 5),
  });

  console.log(
    JSON.stringify(
      {
        memories: memories.map((memory) => ({
          id: memory.id,
          content: memory.content,
          score: memory.score,
          tags: memory.tags,
          agent: memory.agent,
          created_at: memory.created_at,
        })),
      },
      null,
      2,
    ),
  );
}

async function runTrace(args: string[]) {
  const traces = await listMemoryTraces(Number(readFlag(args, 'limit') ?? 50));
  console.log(JSON.stringify({ traces }, null, 2));
}

async function runFeedback(args: string[]) {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case undefined:
    case 'list':
      await runFeedbackList(rest);
      return;
    case 'add':
      await runFeedbackAdd(rest);
      return;
    case 'important':
      await runFeedbackSignal(rest, 'important');
      return;
    case 'wrong':
      await runFeedbackSignal(rest, 'wrong');
      return;
    default:
      console.error('Usage: clew-memory feedback [list|add|important|wrong]');
      process.exitCode = 1;
  }
}

async function runFeedbackList(args: string[]) {
  const feedback = await listMemoryFeedback({
    limit: Number(readFlag(args, 'limit') ?? 50),
    signal: readFlag(args, 'signal'),
  });
  console.log(JSON.stringify({ feedback }, null, 2));
}

async function runFeedbackAdd(args: string[]) {
  const memoryId = args.find((arg) => !arg.startsWith('--'));
  const signal = readFlag(args, 'signal') as string | undefined;

  if (!memoryId || !signal) {
    console.error('Usage: clew-memory feedback add <memoryId> --signal <signal> [--note note]');
    process.exitCode = 1;
    return;
  }

  await addMemoryFeedback({
    memoryId,
    signal: signal as
      | 'accepted'
      | 'rejected'
      | 'corrected'
      | 'preferred'
      | 'disliked'
      | 'important'
      | 'wrong',
    note: readFlag(args, 'note') ?? null,
  });

  console.log(JSON.stringify({ status: 'recorded' }, null, 2));
}

async function runFeedbackSignal(args: string[], signal: 'important' | 'wrong') {
  const memoryId = args.find((arg) => !arg.startsWith('--'));

  if (!memoryId) {
    console.error(`Usage: clew-memory feedback ${signal} <memoryId> [--note note]`);
    process.exitCode = 1;
    return;
  }

  await addMemoryFeedback({
    memoryId,
    signal,
    note: readFlag(args, 'note') ?? null,
  });

  console.log(JSON.stringify({ status: 'recorded', signal }, null, 2));
}

async function runTimeline(args: string[]) {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case undefined:
    case 'recent':
      await runTimelineRecent(rest);
      return;
    case 'search':
      await runTimelineSearch(rest);
      return;
    case 'add':
      await runTimelineAdd(rest);
      return;
    case 'clear':
      await runTimelineClear(rest);
      return;
    default:
      console.error('Usage: clew-memory timeline [recent|search|add|clear]');
      process.exitCode = 1;
  }
}

async function runTimelineRecent(args: string[]) {
  const events = await recentTimelineEvents(Number(readFlag(args, 'limit') ?? 20));
  console.log(JSON.stringify({ events }, null, 2));
}

async function runTimelineSearch(args: string[]) {
  const query = args
    .filter((arg) => !arg.startsWith('--'))
    .join(' ')
    .trim();

  if (!query) {
    console.error('Usage: clew-memory timeline search <query> [--limit 20]');
    process.exitCode = 1;
    return;
  }

  const events = await searchTimelineEvents(query, Number(readFlag(args, 'limit') ?? 20));
  console.log(JSON.stringify({ events }, null, 2));
}

async function runTimelineAdd(args: string[]) {
  const title = args
    .filter((arg) => !arg.startsWith('--'))
    .join(' ')
    .trim();

  if (!title) {
    console.error(
      'Usage: clew-memory timeline add <title> [--event-type memory_added] [--body summary] [--tags tag]',
    );
    process.exitCode = 1;
    return;
  }

  const metadata = readJsonFlag(args, 'metadata');
  const event = await addTimelineEvent({
    eventType: readFlag(args, 'event-type') ?? 'agent_action',
    title,
    body: readFlag(args, 'body') ?? null,
    tags: readTags(args),
    entityType: readFlag(args, 'entity-type') ?? null,
    entityId: readFlag(args, 'entity-id') ?? null,
    metadata: asRecord(metadata),
  });

  console.log(JSON.stringify({ id: event.id, status: 'added' }, null, 2));
}

async function runTimelineClear(args: string[]) {
  if (readFlag(args, 'confirm') !== 'true') {
    console.error('Refusing to clear timeline. Re-run with --confirm true.');
    process.exitCode = 1;
    return;
  }

  const deleted = await clearTimeline();
  console.log(JSON.stringify({ deleted }, null, 2));
}

async function runSupersede(args: string[]) {
  const id = args.find((arg) => !arg.startsWith('--'));
  const replacementId = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] === id);
  const reason = readFlag(args, 'reason');

  if (!id) {
    console.error('Usage: clew-memory supersede <id> [replacementId] [--reason reason]');
    process.exitCode = 1;
    return;
  }

  const memory = await supersedeMemory({ id, replacementId, reason });
  console.log(
    JSON.stringify(
      {
        id: memory.id,
        status: 'superseded',
        superseded_by: memory.superseded_by,
        superseded_at: memory.superseded_at,
        superseded_reason: memory.superseded_reason,
      },
      null,
      2,
    ),
  );
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readJsonFlag(args: string[], name: string) {
  const value = readFlag(args, name);

  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    console.error(`Invalid JSON for --${name}`);
    process.exitCode = 1;
    return undefined;
  }
}

function readFlag(args: string[], name: string) {
  const prefix = `--${name}`;
  const index = args.findIndex((arg) => arg === prefix || arg.startsWith(`${prefix}=`));

  if (index === -1) {
    return undefined;
  }

  const value = args[index]?.split('=')[1];
  return value && value.length > 0 ? value : args[index + 1];
}

function readTags(args: string[]) {
  const tags: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--tag' || arg === '--tags') {
      const next = args[index + 1];
      if (next) {
        tags.push(next);
      }
      continue;
    }

    if (arg?.startsWith('--tag=') || arg?.startsWith('--tags=')) {
      tags.push(...arg.split('=').slice(1).join('=').split(','));
    }
  }

  return tags;
}

function printHelp() {
  console.log(`clew-memory ${process.env.npm_package_version ?? ''}

Commands:
  init                         Initialize the local database and print client context
  remember <content>           Store a memory
  recall <query>               Recall memories
  trace                        Show memory trace entries
  feedback                     List memory feedback records
  feedback list                List memory feedback records
  feedback add <memoryId>      Add a feedback signal to a memory
  feedback important <memoryId> Mark a memory as important
  feedback wrong <memoryId>    Mark a memory as wrong
  timeline                     Show recent timeline events
  timeline recent              Show recent timeline events
  timeline search <query>      Search timeline events by title, body, and tags
  timeline add <title>         Append a timeline event summary
  timeline clear               Clear timeline events with --confirm true
  supersede <id> [replacement] Mark a memory as superseded without deleting it

Options:
  --tag, --tags                Add memory tags
  --kind                       Memory kind, default: note
  --project                    Project name
  --limit                      Result limit
  --reason                     Supersede reason

Environment:
  CLEW_MEMORY_DB               Explicit database path, always wins
  CLEW_MEMORY_SCOPE=global     Use ~/.clew-memory/memory.db
  CLAUDE_PROJECT_DIR           Use Claude Code project memory and client detection
  CLEW_PROJECT_DIR             Use ClewCode project memory and client detection`);
}
