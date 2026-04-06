import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '../lib/db/types'
import type { Mission, MissionStep } from '../types/mission'
import { emitEvent } from './event-service'

interface CreateMissionResult {
  success: boolean
  missionId?: string
  stepIds?: string[]
  error?: string
}

interface FinalizeResult {
  status: 'succeeded' | 'failed' | 'incomplete'
  missionId: string
}

/**
 * Create a mission from an approved proposal.
 * A mission contains one or more steps to execute.
 */
export async function createMissionFromProposal(
  sb: SupabaseClient,
  proposal: {
    id: string
    title: string
    step_kind: string
    step_payload: Json
  }
): Promise<CreateMissionResult> {
  try {
    // Create the mission
    const { data: mission, error: missionError } = await sb
      .from('ops_missions')
      .insert({
        proposal_id: proposal.id,
        title: proposal.title,
        status: 'approved'
      })
      .select()
      .single()

    if (missionError || !mission) {
      return {
        success: false,
        error: `Failed to create mission: ${missionError?.message ?? 'Unknown error'}`
      }
    }

    // Create the step(s) for this mission
    // A proposal can expand into multiple steps based on step_kind
    const steps = expandProposalToSteps(proposal)

    const stepsToInsert = steps.map(step => ({
      mission_id: mission.id,
      step_kind: step.stepKind,
      step_payload: step.stepPayload as Json,
      status: 'queued' as const
    }))

    const { data: insertedSteps, error: stepsError } = await sb
      .from('ops_mission_steps')
      .insert(stepsToInsert)
      .select('id')

    if (stepsError) {
      // Cleanup the mission if steps failed
      await sb.from('ops_missions').delete().eq('id', mission.id)
      return {
        success: false,
        error: `Failed to create steps: ${stepsError.message}`
      }
    }

    // Emit mission_created event
    await emitEvent(sb, {
      eventType: 'mission_created',
      payload: {
        missionId: mission.id,
        proposalId: proposal.id,
        title: proposal.title,
        stepCount: insertedSteps?.length ?? 0
      }
    })

    return {
      success: true,
      missionId: mission.id,
      stepIds: insertedSteps?.map(s => s.id)
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Expand a proposal into execution steps.
 * Different step kinds may expand into multiple steps.
 */
function expandProposalToSteps(proposal: {
  step_kind: string
  step_payload: Json
}): Array<{ stepKind: string; stepPayload: Json }> {
  const { step_kind, step_payload } = proposal

  // Most proposals create a single step
  // Complex workflows can expand here
  switch (step_kind) {
    case 'draft_tweet':
      return [
        { stepKind: 'draft_tweet', stepPayload: step_payload },
      ]

    case 'post_tweet':
      return [
        { stepKind: 'post_tweet', stepPayload: step_payload },
      ]

    case 'crawl':
      return [
        { stepKind: 'crawl', stepPayload: step_payload },
        { stepKind: 'analyze', stepPayload: { type: 'crawl_analysis', source: step_payload } },
      ]

    case 'analyze':
      return [
        { stepKind: 'analyze', stepPayload: step_payload },
      ]

    case 'write_content':
      return [
        { stepKind: 'write_content', stepPayload: step_payload },
        { stepKind: 'analyze', stepPayload: { type: 'content_quality_check', source: step_payload } },
      ]

    case 'deploy':
      return [
        { stepKind: 'deploy', stepPayload: step_payload },
      ]

    default:
      return [{ stepKind: step_kind, stepPayload: step_payload }]
  }
}

/**
 * Claim a queued step for execution.
 * This is called by VPS workers.
 */
export async function claimStep(
  sb: SupabaseClient,
  stepKind: string,
  workerId: string
): Promise<MissionStep | null> {
  const now = new Date().toISOString()

  // Find an available step of this kind
  const { data: availableSteps, error: findError } = await sb
    .from('ops_mission_steps')
    .select('*, mission:ops_missions(*)')
    .eq('step_kind', stepKind)
    .eq('status', 'queued')
    .is('reserved_at', null)
    .limit(1)

  if (findError || !availableSteps?.length) {
    return null
  }

  const step = availableSteps[0]

  // Reserve it atomically
  const { data: claimed, error: claimError } = await sb
    .from('ops_mission_steps')
    .update({
      status: 'running',
      reserved_at: now,
      reserved_by: workerId
    })
    .eq('id', step.id)
    .eq('status', 'queued')
    .is('reserved_at', null)
    .select()
    .single()

  if (claimError || !claimed) {
    // Race condition - another worker claimed it
    return null
  }

  // Update mission status to running if not already
  await sb
    .from('ops_missions')
    .update({ status: 'running', started_at: now })
    .eq('id', step.mission_id)
    .eq('status', 'approved')

  // Emit step_claimed event
  await emitEvent(sb, {
    eventType: 'step_claimed',
    payload: {
      stepId: step.id,
      missionId: step.mission_id,
      stepKind: step.step_kind,
      workerId
    }
  })

  return claimed
}

/**
 * Mark a step as completed successfully.
 */
export async function completeStep(
  sb: SupabaseClient,
  stepId: string,
  result: Json
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString()

  const { error } = await sb
    .from('ops_mission_steps')
    .update({
      status: 'succeeded',
      result: result as Json,
      completed_at: now
    })
    .eq('id', stepId)

  if (error) {
    return { success: false, error: error.message }
  }

  // Get the mission_id for finalization check
  const { data: step } = await sb
    .from('ops_mission_steps')
    .select('mission_id')
    .eq('id', stepId)
    .single()

  if (step) {
    await emitEvent(sb, {
      eventType: 'step_completed',
      payload: { stepId, result }
    })

    await maybeFinalizeMissionIfDone(sb, step.mission_id)
  }

  return { success: true }
}

/**
 * Mark a step as failed.
 */
export async function failStep(
  sb: SupabaseClient,
  stepId: string,
  error: string
): Promise<{ success: boolean }> {
  const now = new Date().toISOString()

  await sb
    .from('ops_mission_steps')
    .update({
      status: 'failed',
      last_error: error,
      completed_at: now
    })
    .eq('id', stepId)

  const { data: step } = await sb
    .from('ops_mission_steps')
    .select('mission_id')
    .eq('id', stepId)
    .single()

  if (step) {
    await emitEvent(sb, {
      eventType: 'step_failed',
      payload: { stepId, error }
    })

    // Check if mission should be finalized as failed
    await maybeFinalizeMissionIfDone(sb, step.mission_id)
  }

  return { success: true }
}

/**
 * Check if a mission is complete and finalize it.
 *
 * Rules:
 * - All steps succeeded → mission succeeded
 * - Any step failed → mission failed
 * - Steps still running/queued → incomplete (do nothing)
 */
export async function maybeFinalizeMissionIfDone(
  sb: SupabaseClient,
  missionId: string
): Promise<FinalizeResult> {
  const { data: steps, error } = await sb
    .from('ops_mission_steps')
    .select('status')
    .eq('mission_id', missionId)

  if (error || !steps) {
    return { status: 'incomplete', missionId }
  }

  const statuses = steps.map(s => s.status)

  // If any step is still running or queued, mission is incomplete
  if (statuses.some(s => s === 'running' || s === 'queued')) {
    return { status: 'incomplete', missionId }
  }

  // If any step failed, mission failed
  if (statuses.some(s => s === 'failed')) {
    await sb
      .from('ops_missions')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString()
      })
      .eq('id', missionId)

    await emitEvent(sb, {
      eventType: 'mission_failed',
      payload: { missionId, stepCount: steps.length }
    })

    return { status: 'failed', missionId }
  }

  // All steps succeeded
  await sb
    .from('ops_missions')
    .update({
      status: 'succeeded',
      completed_at: new Date().toISOString()
    })
    .eq('id', missionId)

  await emitEvent(sb, {
    eventType: 'mission_completed',
    payload: { missionId, stepCount: steps.length }
  })

  return { status: 'succeeded', missionId }
}

/**
 * Get all queued steps (for debugging/monitoring).
 */
export async function getQueuedSteps(sb: SupabaseClient): Promise<MissionStep[]> {
  const { data, error } = await sb
    .from('ops_mission_steps')
    .select()
    .eq('status', 'queued')
    .order('created_at', { ascending: true })

  if (error) {
    return []
  }

  return data
}

/**
 * Get all running steps (for debugging/monitoring).
 */
export async function getRunningSteps(sb: SupabaseClient): Promise<MissionStep[]> {
  const { data, error } = await sb
    .from('ops_mission_steps')
    .select()
    .eq('status', 'running')
    .order('reserved_at', { ascending: true })

  if (error) {
    return []
  }

  return data
}

/**
 * Get mission by ID.
 */
export async function getMission(sb: SupabaseClient, missionId: string): Promise<Mission | null> {
  const { data, error } = await sb
    .from('ops_missions')
    .select()
    .eq('id', missionId)
    .single()

  if (error) {
    return null
  }

  return data
}

/**
 * Get all steps for a mission.
 */
export async function getMissionSteps(sb: SupabaseClient, missionId: string): Promise<MissionStep[]> {
  const { data, error } = await sb
    .from('ops_mission_steps')
    .select()
    .eq('mission_id', missionId)
    .order('created_at', { ascending: true })

  if (error) {
    return []
  }

  return data
}