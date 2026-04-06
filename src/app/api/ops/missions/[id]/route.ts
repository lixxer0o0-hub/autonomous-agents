import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getMission, getMissionSteps } from '@/services/mission-service'

/**
 * Mission Status API
 *
 * GET: Get mission details and steps
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = createAdminClient()
  const { id } = await params

  try {
    const mission = await getMission(sb, id)

    if (!mission) {
      return NextResponse.json(
        { error: 'Mission not found' },
        { status: 404 }
      )
    }

    const steps = await getMissionSteps(sb, id)

    return NextResponse.json({
      mission,
      steps,
      progress: {
        total: steps.length,
        queued: steps.filter(s => s.status === 'queued').length,
        running: steps.filter(s => s.status === 'running').length,
        succeeded: steps.filter(s => s.status === 'succeeded').length,
        failed: steps.filter(s => s.status === 'failed').length
      }
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}