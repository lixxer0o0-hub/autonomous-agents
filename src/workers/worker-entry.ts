/**
 * VPS Worker Entry Point
 *
 * This script runs on the VPS and executes mission steps.
 * It claims steps from the queue and runs the appropriate executors.
 *
 * Usage:
 *   bun run worker-entry.ts
 *   # or
 *   node --loader ts-node/esm worker-entry.ts
 *
 * Crontab example (run every 5 minutes):
 *   */5 * * * * cd /path/to/autonomous-agents && bun run worker-entry.ts >> /var/log/agent-worker.log 2>&1
 */

import { AgentWorker, registerExecutor } from './index'
import {
  crawlExecutor,
  analyzeExecutor,
  writeContentExecutor,
  draftTweetExecutor,
  postTweetExecutor,
  deployExecutor
} from './step-executors'

// Register all executors
registerExecutor('crawl', crawlExecutor)
registerExecutor('analyze', analyzeExecutor)
registerExecutor('write_content', writeContentExecutor)
registerExecutor('draft_tweet', draftTweetExecutor)
registerExecutor('post_tweet', postTweetExecutor)
registerExecutor('deploy', deployExecutor)

// All step kinds to process
const STEP_KINDS = [
  'crawl',
  'analyze',
  'write_content',
  'draft_tweet',
  'post_tweet',
  'deploy'
]

async function main() {
  const workerId = process.env.WORKER_ID ?? `vps-worker-${Date.now()}`
  const worker = new AgentWorker(workerId)

  console.log(`[${workerId}] Starting worker loop...`)

  try {
    const result = await worker.runAll(STEP_KINDS)

    console.log(`[${workerId}] Worker run complete:`, {
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed
    })

    // Exit with error code if any steps failed
    if (result.failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error(`[${workerId}] Worker error:`, error)
    process.exit(1)
  }
}

// Run the worker
main()
