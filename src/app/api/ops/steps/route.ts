import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getQueuedSteps, getRunningSteps } from '@/services/mission-service'

/**
 * Steps API
 *
 * GET: List queued or running steps
 */
export async function GET(request: NextRequest) {
  const sb = createAdminClient() as any
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'queued'

  try {
    let steps

    if (status === 'running') {
      steps = await getRunningSteps(sb)
    } else {
      steps = await getQueuedSteps(sb)
    }

    return NextResponse.json({ steps })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
