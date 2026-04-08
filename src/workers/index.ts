import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '../lib/db/types'
import type { MissionStep } from '../types/mission'
import { createClient } from '@supabase/supabase-js'
import { claimStep, completeStep, failStep } from '../services/mission-service'

/**
 * Worker Interface
 *
 * This runs on the VPS, NOT on Vercel.
 * Each step kind maps to a worker function.
 *
 * Usage (in VPS cron or OpenClaw agent):
 *
 * ```typescript
 * const worker = new AgentWorker('my-worker-id')
 * await worker.runStep('crawl')
 * await worker.runStep('analyze')
 * ```
 */

export type StepExecutor = (payload: Json) => Promise<{ success: boolean; data?: Json; error?: string }>

// Registry of step executors
const STEP_EXECUTORS: Record<string, StepExecutor> = {}

/**
 * Register a step executor.
 */
export function registerExecutor(stepKind: string, executor: StepExecutor) {
  STEP_EXECUTORS[stepKind] = executor
}

/**
 * Agent Worker class for VPS execution.
 */
export class AgentWorker {
  private sb: SupabaseClient
  private workerId: string

  constructor(workerId: string, supabaseUrl?: string, supabaseKey?: string) {
    this.workerId = workerId
    this.sb = createClient(
      supabaseUrl ?? process.env.SUPABASE_URL ?? '',
      supabaseKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      { auth: { persistSession: false } }
    )
  }

  /**
   * Claim and execute a step of the given kind.
   */
  async runStep(stepKind: string): Promise<{
    claimed: boolean
    stepId?: string
    missionId?: string
    success?: boolean
    error?: string
  }> {
    // 1. Claim a step
    const step = await claimStep(this.sb, stepKind, this.workerId)

    if (!step) {
      return { claimed: false }
    }

    // 2. Find executor
    const executor = STEP_EXECUTORS[stepKind]

    if (!executor) {
      await failStep(this.sb, step.id, `No executor registered for step kind: ${stepKind}`)
      return {
        claimed: true,
        stepId: step.id,
        missionId: step.mission_id,
        success: false,
        error: `No executor registered for step kind: ${stepKind}`
      }
    }

    // 3. Execute
    try {
      const result = await executor(step.step_payload)

      if (result.success) {
        await completeStep(this.sb, step.id, result.data ?? {})
        return {
          claimed: true,
          stepId: step.id,
          missionId: step.mission_id,
          success: true
        }
      } else {
        await failStep(this.sb, step.id, result.error ?? 'Execution failed')
        return {
          claimed: true,
          stepId: step.id,
          missionId: step.mission_id,
          success: false,
          error: result.error
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await failStep(this.sb, step.id, errorMessage)
      return {
        claimed: true,
        stepId: step.id,
        missionId: step.mission_id,
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Run all available steps of the given kinds.
   */
  async runAll(stepKinds: string[]): Promise<{
    total: number
    succeeded: number
    failed: number
  }> {
    let total = 0
    let succeeded = 0
    let failed = 0

    for (const stepKind of stepKinds) {
      let hasMore = true

      while (hasMore) {
        const result = await this.runStep(stepKind)
        if (!result.claimed) {
          hasMore = false
        } else {
          total++
          if (result.success) {
            succeeded++
          } else {
            failed++
          }
        }
      }
    }

    return { total, succeeded, failed }
  }
}

/**
 * Get the Supabase client for direct use in executors.
 */
export function getSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { persistSession: false } }
  )
}
