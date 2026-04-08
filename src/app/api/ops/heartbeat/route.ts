import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { evaluateTriggers } from '@/services/trigger-evaluator'
import { processReactionQueue } from '@/services/reaction-processor'
import { recoverStaleSteps, performMaintenance } from '@/services/stale-recovery'

/**
 * Heartbeat Endpoint
 *
 * This is the CONTROL PLANE - lightweight operations only.
 * VPS workers do the heavy lifting (executing steps).
 *
 * Operations:
 * 1. Evaluate triggers - check conditions and create proposals
 * 2. Process reaction queue - inter-agent responses
 * 3. Recover stale steps - self-healing
 * 4. Perform maintenance - cleanup old data
 *
 * Called by VPS crontab every 5 minutes:
 * Example: every 5 min curl -s -H "Authorization: Bearer $KEY" /api/ops/heartbeat
 */
export async function POST(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization')
  const expectedAuth = `Bearer ${process.env.HEARTBEAT_KEY}`

  if (authHeader !== expectedAuth) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const sb = createAdminClient() as any

    // Run all control plane operations with timeouts
    const [
      triggerResult,
      reactionResult,
      staleResult,
      maintenanceResult
    ] = await Promise.all([
      evaluateTriggers(sb, 4000),  // 4 second timeout
      processReactionQueue(sb, 3000),  // 3 second timeout
      recoverStaleSteps(sb),
      performMaintenance(sb)
    ])

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      triggers: {
        evaluated: triggerResult.length,
        fired: triggerResult.filter(t => t.fired).length,
        details: triggerResult
      },
      reactions: {
        processed: reactionResult.processed,
        details: reactionResult.reactions
      },
      staleRecovery: {
        recoveredSteps: staleResult.recoveredSteps,
        recoveredMissions: staleResult.recoveredMissions,
        details: staleResult.details
      },
      maintenance: {
        stuckMissions: maintenanceResult.stuckRecovery.recovered,
        deletedMissions: maintenanceResult.cleanup.deletedMissions,
        deletedSteps: maintenanceResult.cleanup.deletedSteps
      }
    })
  } catch (error) {
    console.error('Heartbeat error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Also support GET for health checks
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  })
}
