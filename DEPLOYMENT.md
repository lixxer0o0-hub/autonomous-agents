# Autonomous Agents Deployment Guide

## Architecture Overview

This system implements a closed-loop autonomous agent architecture with:

- **Vercel (Control Plane)**: Lightweight operations - trigger evaluation, reaction processing, maintenance
- **VPS (Executor)**: Heavy lifting - step execution via OpenClaw agents
- **Supabase (Cortex)**: Shared state - all missions, proposals, events, policies

## Prerequisites

1. **Supabase Project** - Database already set up with migrations
2. **Vercel Account** - For deploying the Next.js control plane
3. **VPS or Local Machine** - For running worker processes

## Vercel Deployment

### 1. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
HEARTBEAT_KEY=generate-a-secure-random-string
```

### 2. Deploy to Vercel

```bash
vercel deploy --prod
```

### 3. Set Up Heartbeat Cron

On your VPS, add to crontab (`crontab -e`):

```bash
# Run heartbeat every 5 minutes
*/5 * * * * curl -s -H "Authorization: Bearer YOUR_HEARTBEAT_KEY" https://your-app.vercel.app/api/ops/heartbeat >> /var/log/agent-heartbeat.log 2>&1
```

## VPS Worker Setup

### Option A: Using the Built-in Worker

```bash
# Set environment
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export WORKER_ID="vps-worker-1"

# Run the worker
bun run src/workers/worker-entry.ts
```

### Option B: Using OpenClaw Integration

```typescript
import { createOpenClawBridge } from './src/integrations/openclaw'
import { OpenClawAgent } from 'openclaw'

const agent = new OpenClawAgent({ name: 'my-agent' })
const bridge = createOpenClawBridge(agent, {
  agentName: 'my-agent',
  stepKinds: ['analyze', 'write_content', 'draft_tweet']
})

// Start the bridge (runs continuously)
bridge.start()
```

### Crontab Setup for Worker

```bash
# Run worker every 5 minutes
*/5 * * * * cd /path/to/autonomous-agents && bun run src/workers/worker-entry.ts >> /var/log/agent-worker.log 2>&1
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ops/heartbeat` | POST | Control plane - triggers, reactions, recovery |
| `/api/ops/proposals` | GET/POST | List or create proposals |
| `/api/ops/missions/[id]` | GET | Get mission status and steps |
| `/api/ops/steps` | GET | List queued/running steps |
| `/api/ops/reactions` | GET/POST | List or queue reactions |
| `/api/ops/triggers` | GET/POST/PUT/DELETE | Manage trigger rules |
| `/api/ops/policies` | GET/PUT | Manage system policies |

## Policy Configuration

Policies are stored in `ops_policy` table and control system behavior:

| Key | Description | Default |
|-----|-------------|---------|
| `auto_approve` | Auto-approval settings | `{ enabled: true, allowed_step_kinds: [...] }` |
| `x_daily_quota` | Daily tweet limit | `{ limit: 10 }` |
| `x_autopost` | Twitter autopost toggle | `{ enabled: true }` |
| `worker_policy` | Vercel execution toggle | `{ enabled: false }` (VPS only) |
| `reaction_matrix` | Inter-agent response rules | See migration |
| `daily_proposal_limit` | Max proposals per day | `{ limit: 100 }` |

Update policies via API:

```bash
curl -X PUT https://your-app.vercel.app/api/ops/policies \
  -H "Content-Type: application/json" \
  -d '{"key": "x_daily_quota", "value": {"limit": 20}}'
```

## Monitoring

### Dashboard

Visit the root URL `/` for a real-time dashboard showing:
- Proposal stats
- Queued steps
- System policies
- Heartbeat status

### Logs

- Vercel logs: `vercel logs`
- Worker logs: `/var/log/agent-worker.log`
- Heartbeat logs: `/var/log/agent-heartbeat.log`

### Database

Query Supabase directly:

```sql
-- Recent proposals
SELECT * FROM ops_mission_proposals ORDER BY created_at DESC LIMIT 10;

-- Queued steps
SELECT * FROM ops_mission_steps WHERE status = 'queued';

-- Recent events
SELECT * FROM ops_agent_events ORDER BY created_at DESC LIMIT 20;
```

## Troubleshooting

### Steps Stuck in Queue

1. Check worker is running: `ps aux | grep worker`
2. Check worker logs for errors
3. Verify `worker_policy` allows execution

### Heartbeat Not Running

1. Check crontab: `crontab -l`
2. Verify HEARTBEAT_KEY matches
3. Check Vercel deployment is active

### Proposals Not Auto-Approving

1. Check `auto_approve` policy is enabled
2. Verify step kind is in `allowed_step_kinds`
3. Check cap gates aren't blocking (quotas, etc.)
