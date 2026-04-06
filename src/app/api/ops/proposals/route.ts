import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createProposalAndMaybeAutoApprove, getPendingProposals, getRecentProposals } from '@/services/proposal-service'
import type { ProposalSource } from '@/types/proposal'

/**
 * Proposals API
 *
 * GET: List proposals (pending or recent)
 * POST: Create a new proposal
 */
export async function GET(request: NextRequest) {
  const sb = createAdminClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const hours = parseInt(searchParams.get('hours') ?? '24', 10)

  try {
    let proposals

    if (status === 'pending') {
      proposals = await getPendingProposals(sb)
    } else {
      proposals = await getRecentProposals(sb, hours)
    }

    return NextResponse.json({ proposals })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Create a new proposal.
 *
 * Body:
 * - title: string (required)
 * - description: string (optional)
 * - stepKind: string (required)
 * - stepPayload: object (required)
 * - proposerAgent: string (optional)
 */
export async function POST(request: NextRequest) {
  const sb = createAdminClient()

  try {
    const body = await request.json()

    // Validate required fields
    if (!body.title || !body.stepKind || !body.stepPayload) {
      return NextResponse.json(
        { error: 'Missing required fields: title, stepKind, stepPayload' },
        { status: 400 }
      )
    }

    const result = await createProposalAndMaybeAutoApprove(sb, {
      title: body.title,
      description: body.description,
      source: (body.source as ProposalSource) ?? 'api',
      proposerAgent: body.proposerAgent,
      stepKind: body.stepKind,
      stepPayload: body.stepPayload
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? result.rejectionReason },
        { status: result.rejected ? 422 : 500 }
      )
    }

    return NextResponse.json({
      success: true,
      proposalId: result.proposalId,
      missionId: result.missionId,
      stepIds: result.stepIds
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}