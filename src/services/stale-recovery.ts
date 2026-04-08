import type { SupabaseClient } from '@supabase/supabase-js'
import { maybeFinalizeMissionIfDone } from './mission-service'
import { emitEvent } from './event-service'

interface RecoveryResult {
  recoveredSteps: number
  recoveredMissions: number
  details: Array<{
    stepId: string
    missionId: string
    error: string
  }>
}

/**
 * Steps are considered stale if they've been running for more than 30 minutes
 * with no progress (no updates to reserved_at or completed_at).
 */
const STALE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Recover stale steps that have been running too long.
 * Mark them as failed and finalize their missions.
 *
 * Called by the heartbeat endpoint.
 */
export async function recoverStaleSteps(
  sb: SupabaseClient
): Promise<RecoveryResult> {
  const result: RecoveryResult = {
    recoveredSteps: 0,
    recoveredMissions: 0,
    details: []
  }

  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString()

  // Find stale steps
  const { data: staleSteps, error } = await sb
    .from('ops_mission_steps')
    .select('id, mission_id, step_kind, reserved_at, reserved_by')
    .eq('status', 'running')
    .lt('reserved_at', staleThreshold)

  if (error) {
    console.error('Failed to query stale steps:', error)
    return result
  }

  if (!staleSteps || staleSteps.length === 0) {
    return result
  }

  for (const step of staleSteps) {
    // Mark step as failed
    const { error: updateError } = await sb
      .from('ops_mission_steps')
      .update({
        status: 'failed',
        last_error: 'Stale: no progress for 30 minutes',
        completed_at: new Date().toISOString()
      })
      .eq('id', step.id)

    if (updateError) {
      console.error(`Failed to mark step ${step.id} as stale:`, updateError)
      continue
    }

    result.recoveredSteps++
    result.details.push({
      stepId: step.id,
      missionId: step.mission_id,
      error: 'Stale: no progress for 30 minutes'
    })

    // Emit step_failed event
    await emitEvent(sb, {
      eventType: 'step_failed',
      payload: {
        stepId: step.id,
        missionId: step.mission_id,
        stepKind: step.step_kind,
        error: 'Stale: no progress for 30 minutes',
        recovered: true
      }
    })

    // Check if mission should be finalized
    const finalizeResult = await maybeFinalizeMissionIfDone(sb, step.mission_id)

    if (finalizeResult.status !== 'incomplete') {
      result.recoveredMissions++
    }
  }

  return result
}

/**
 * Recover missions that have been approved but have no steps running for too long.
 * This catches edge cases where steps were never picked up.
 */
export async function recoverStuckMissions(
  sb: SupabaseClient
): Promise<{ recovered: number }> {
  const stuckThreshold = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour

  // Find missions that are approved but have been around for over an hour
  // with no steps ever started
  const { data: stuckMissions, error } = await sb
    .from('ops_missions')
    .select('id')
    .eq('status', 'approved')
    .lt('created_at', stuckThreshold)

  if (error || !stuckMissions) {
    return { recovered: 0 }
  }

  let recovered = 0

  for (const mission of stuckMissions) {
    // Check if any steps exist
    const { count } = await sb
      .from('ops_mission_steps')
      .select('id', { count: 'exact', head: true })
      .eq('mission_id', mission.id)

    if (count === 0) {
      // Mission has no steps - mark as failed
      await sb
        .from('ops_missions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString()
        })
        .eq('id', mission.id)

      await emitEvent(sb, {
        eventType: 'mission_failed',
        payload: {
          missionId: mission.id,
          reason: 'Stuck: no steps were created'
        }
      })

      recovered++
    }
  }

  return { recovered }
}

/**
 * Clean up old completed/failed missions and their steps.
 * Call this periodically to prevent table bloat.
 */
export async function cleanupOldMissions(
  sb: SupabaseClient,
  daysToKeep: number = 30
): Promise<{ deletedMissions: number; deletedSteps: number }> {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString()

  // First, get mission IDs to delete
  const { data: oldMissions, error: fetchError } = await sb
    .from('ops_missions')
    .select('id')
    .in('status', ['succeeded', 'failed'])
    .lt('completed_at', cutoff)

  if (fetchError || !oldMissions || oldMissions.length === 0) {
    return { deletedMissions: 0, deletedSteps: 0 }
  }

  const missionIds = oldMissions.map(m => m.id)

  // Delete steps first (cascade should handle this, but be explicit)
  const { count: stepCount } = await sb
    .from('ops_mission_steps')
    .delete()
    .in('mission_id', missionIds)

  // Delete missions
  const { count: missionCount } = await sb
    .from('ops_missions')
    .delete()
    .in('id', missionIds)

  return {
    deletedMissions: missionCount ?? 0,
    deletedSteps: stepCount ?? 0
  }
}

/**
 * Full recovery and cleanup routine.
 * Call this from the heartbeat endpoint.
 */
export async function performMaintenance(
  sb: SupabaseClient
): Promise<{
  staleRecovery: RecoveryResult
  stuckRecovery: { recovered: number }
  cleanup: { deletedMissions: number; deletedSteps: number }
}> {
  const staleRecovery = await recoverStaleSteps(sb)
  const stuckRecovery = await recoverStuckMissions(sb)
  const cleanup = await cleanupOldMissions(sb, 30)

  return {
    staleRecovery,
    stuckRecovery,
    cleanup
  }
}
