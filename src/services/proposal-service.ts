import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfDay } from 'date-fns'
import type { Json } from '../lib/db/types'
import type { ProposalServiceInput, ProposalServiceResult } from '../types/proposal'
import { runGateChecks } from './cap-gates'
import { getDailyProposalLimit, isAutoApproveAllowed } from './policy-helpers'
import { createMissionFromProposal } from './mission-service'
import { emitEvent } from './event-service'

/**
 * Proposal Service
 *
 * THE SINGLE ENTRY POINT for all proposal creation.
 * All paths (API, triggers, reactions, agents) must call this function.
 *
 * Flow:
 * 1. Check daily limit
 * 2. Run Cap Gates for the step_kind
 * 3. Insert proposal with status 'pending'
 * 4. Emit event 'proposal_created'
 * 5. Evaluate auto-approve criteria
 * 6. If approved → create mission + steps, emit 'proposal_accepted'
 * 7. Return result
 */
export async function createProposalAndMaybeAutoApprove(
  sb: SupabaseClient,
  input: ProposalServiceInput
): Promise<ProposalServiceResult> {
  try {
    // 1. Check daily limit
    const dailyLimit = await getDailyProposalLimit(sb)
    const startOfToday = startOfDay(new Date()).toISOString()

    const { count } = await sb
      .from('ops_mission_proposals')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfToday)

    if ((count ?? 0) >= dailyLimit) {
      return {
        success: false,
        rejected: true,
        rejectionReason: `Daily proposal limit reached (${count}/${dailyLimit})`
      }
    }

    // 2. Run Cap Gates
    const gateResult = await runGateChecks(sb, input.stepKind)
    if (!gateResult.ok) {
      // Emit gate rejection event
      await emitEvent(sb, {
        eventType: 'gate_rejected',
        agentName: input.proposerAgent,
        payload: {
          stepKind: input.stepKind,
          reason: gateResult.reason,
          title: input.title
        }
      })

      return {
        success: false,
        rejected: true,
        rejectionReason: gateResult.reason ?? 'Gate check failed'
      }
    }

    // 3. Insert proposal
    const { data: proposal, error: insertError } = await sb
      .from('ops_mission_proposals')
      .insert({
        title: input.title,
        description: input.description ?? null,
        source: input.source,
        proposer_agent: input.proposerAgent ?? null,
        step_kind: input.stepKind,
        step_payload: input.stepPayload as Json,
        status: 'pending'
      })
      .select()
      .single()

    if (insertError || !proposal) {
      return {
        success: false,
        error: `Failed to create proposal: ${insertError?.message ?? 'Unknown error'}`
      }
    }

    // 4. Emit proposal_created event
    await emitEvent(sb, {
      eventType: 'proposal_created',
      agentName: input.proposerAgent,
      payload: {
        proposalId: proposal.id,
        title: input.title,
        stepKind: input.stepKind,
        source: input.source
      }
    })

    // 5. Evaluate auto-approve
    const shouldAutoApprove = await isAutoApproveAllowed(sb, input.stepKind)

    if (shouldAutoApprove) {
      // 6. Create mission + steps
      const missionResult = await createMissionFromProposal(sb, proposal)

      if (!missionResult.success) {
        return {
          success: false,
          proposalId: proposal.id,
          error: missionResult.error ?? 'Failed to create mission'
        }
      }

      // Update proposal status
      await sb
        .from('ops_mission_proposals')
        .update({ status: 'accepted', processed_at: new Date().toISOString() })
        .eq('id', proposal.id)

      // Emit proposal_accepted event
      await emitEvent(sb, {
        eventType: 'proposal_accepted',
        agentName: input.proposerAgent,
        payload: {
          proposalId: proposal.id,
          missionId: missionResult.missionId,
          title: input.title
        }
      })

      return {
        success: true,
        proposalId: proposal.id,
        missionId: missionResult.missionId,
        stepIds: missionResult.stepIds
      }
    }

    // Auto-approve not allowed, proposal stays pending for manual review
    return {
      success: true,
      proposalId: proposal.id
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Reject a proposal.
 */
export async function rejectProposal(
  sb: SupabaseClient,
  proposalId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await sb
    .from('ops_mission_proposals')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      processed_at: new Date().toISOString()
    })
    .eq('id', proposalId)

  if (error) {
    return { success: false, error: error.message }
  }

  await emitEvent(sb, {
    eventType: 'proposal_rejected',
    payload: { proposalId, reason }
  })

  return { success: true }
}

/**
 * Manually approve a pending proposal (for step kinds that don't auto-approve).
 */
export async function approveProposal(
  sb: SupabaseClient,
  proposalId: string
): Promise<ProposalServiceResult> {
  const { data: proposal, error: fetchError } = await sb
    .from('ops_mission_proposals')
    .select()
    .eq('id', proposalId)
    .eq('status', 'pending')
    .single()

  if (fetchError || !proposal) {
    return {
      success: false,
      error: 'Proposal not found or already processed'
    }
  }

  // Run gate checks
  const gateResult = await runGateChecks(sb, proposal.step_kind)
  if (!gateResult.ok) {
    await rejectProposal(sb, proposalId, gateResult.reason ?? 'Gate check failed')
    return {
      success: false,
      rejected: true,
      rejectionReason: gateResult.reason
    }
  }

  // Create mission
  const missionResult = await createMissionFromProposal(sb, proposal)

  if (!missionResult.success) {
    return {
      success: false,
      proposalId,
      error: missionResult.error
    }
  }

  // Update proposal status
  await sb
    .from('ops_mission_proposals')
    .update({ status: 'accepted', processed_at: new Date().toISOString() })
    .eq('id', proposalId)

  await emitEvent(sb, {
    eventType: 'proposal_accepted',
    payload: { proposalId, missionId: missionResult.missionId }
  })

  return {
    success: true,
    proposalId,
    missionId: missionResult.missionId,
    stepIds: missionResult.stepIds
  }
}

/**
 * Get all pending proposals.
 */
export async function getPendingProposals(sb: SupabaseClient) {
  const { data, error } = await sb
    .from('ops_mission_proposals')
    .select()
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    return []
  }

  return data
}

/**
 * Get recent proposals (last 24 hours).
 */
export async function getRecentProposals(sb: SupabaseClient, hours: number = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const { data, error } = await sb
    .from('ops_mission_proposals')
    .select()
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) {
    return []
  }

  return data
}