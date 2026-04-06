# Autonomous Agents

A closed-loop autonomous agent system built with Next.js, Supabase, and OpenClaw. Agents can propose ideas, get auto-approved, execute tasks, emit events, and trigger reactions — all without human intervention.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   OpenClaw      │     │    Vercel       │     │   Supabase      │
│   (VPS)         │     │   (Control)     │     │   (Database)    │
│                 │     │                 │     │                 │
│ • Think         │     │ • Heartbeat     │     │ • Proposals     │
│ • Execute       │     │ • Triggers      │     │ • Missions      │
│ • Workers       │     │ • Reactions     │     │ • Steps         │
│                 │     │ • Cleanup       │     │ • Events        │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                              Single Source of Truth
```

## Key Concepts

### The Closed Loop

1. **Proposal** — Agent proposes an idea
2. **Auto-Approve** — System checks cap gates and auto-approves if allowed
3. **Mission + Steps** — Approved proposal becomes mission with executable steps
4. **Worker Execution** — VPS worker claims and executes steps
5. **Events** — System emits events for completed actions
6. **Triggers/Reactions** — Events trigger new proposals via triggers or reaction matrix

### Three Critical Pitfalls Avoided

1. **Single Executor** — Only VPS executes steps, Vercel only runs control plane (no race conditions)
2. **Single Proposal Service** — All paths (API, triggers, reactions) use `createProposalAndMaybeAutoApprove`
3. **Cap Gates** — Reject at entry, not in queue (no queue buildup when quotas full)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project
2. Run the migration in `supabase/migrations/001_initial_schema.sql`
3. Copy your project URL and keys

### 3. Configure Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your values:

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
HEARTBEAT_KEY=your-secure-random-key
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. Set Up VPS Heartbeat

On your VPS (or OpenClaw), add a cron job:

```cron
*/5 * * * * curl -s -H "Authorization: Bearer YOUR_HEARTBEAT_KEY" https://yoursite.com/api/ops/heartbeat
```

### 6. Run Workers on VPS

```typescript
import { AgentWorker, registerExecutor } from './workers'
import { executors } from './workers/step-executors'

// Register executors
for (const [kind, executor] of Object.entries(executors)) {
  registerExecutor(kind, executor)
}

// Create worker
const worker = new AgentWorker('my-worker-001')

// Run available steps
await worker.runAll(['crawl', 'analyze', 'write_content', 'post_tweet'])
```

## API Endpoints

### Heartbeat (Control Plane)

```bash
POST /api/ops/heartbeat
Authorization: Bearer YOUR_HEARTBEAT_KEY
```

Runs: triggers, reactions, stale recovery, maintenance

### Proposals

```bash
# List proposals
GET /api/ops/proposals?status=pending
GET /api/ops/proposals?hours=24

# Create proposal
POST /api/ops/proposals
{
  "title": "Analyze trending topics",
  "stepKind": "analyze",
  "stepPayload": { "focus": "trends" },
  "proposerAgent": "sage"
}
```

### Mission Status

```bash
GET /api/ops/missions/[id]
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `ops_mission_proposals` | Proposals (pending/accepted/rejected) |
| `ops_missions` | Missions (approved/running/succeeded/failed) |
| `ops_mission_steps` | Executable steps (queued/running/succeeded/failed) |
| `ops_agent_events` | Event stream for triggers |
| `ops_policy` | Configurable policies (JSON) |
| `ops_trigger_rules` | Trigger definitions |
| `ops_agent_reactions` | Reaction queue |
| `ops_action_runs` | Execution logs |

## Policies

Configure behavior in `ops_policy` table:

- `auto_approve` — Which step kinds can auto-approve
- `x_daily_quota` — Daily tweet limit
- `x_autopost` — Enable/disable Twitter posting
- `reaction_matrix` — Inter-agent reaction rules

## Custom Step Executors

Add your own executors:

```typescript
import { registerExecutor } from './workers'

registerExecutor('custom_action', async (payload) => {
  // Your logic here
  return { success: true, data: { result: 'done' } }
})
```

## Development

```bash
# Run dev server
npm run dev

# Type check
npm run build

# Lint
npm run lint
```

## License

MIT