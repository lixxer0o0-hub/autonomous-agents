import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { queueReaction, getPendingReactions } from '@/services/reaction-processor'

/**
 * Reactions API
 *
 * GET: Get pending reactions
 * POST: Queue a new reaction
 */
export async function GET() {
  const sb = createAdminClient() as any

  try {
    const reactions = await getPendingReactions(sb)

    return NextResponse.json({ reactions })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Queue a new reaction.
 *
 * Body:
 * - sourceAgent: string (required)
 * - targetAgent: string (required)
 * - reactionType: string (required)
 * - payload: object (required)
 */
export async function POST(request: NextRequest) {
  const sb = createAdminClient() as any

  try {
    const body = await request.json()

    // Validate required fields
    if (!body.sourceAgent || !body.targetAgent || !body.reactionType) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceAgent, targetAgent, reactionType' },
        { status: 400 }
      )
    }

    const result = await queueReaction(sb, {
      sourceAgent: body.sourceAgent,
      targetAgent: body.targetAgent,
      reactionType: body.reactionType,
      payload: body.payload ?? {}
    })

    return NextResponse.json({
      success: true,
      reactionId: result.reactionId
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
