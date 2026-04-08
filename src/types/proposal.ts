import type { Json } from '../lib/db/types'

export type ProposalSource = 'api' | 'trigger' | 'reaction' | 'agent'
export type ProposalStatus = 'pending' | 'accepted' | 'rejected'

export interface ProposalServiceInput {
  title: string
  description?: string
  source: ProposalSource
  proposerAgent?: string
  stepKind: string
  stepPayload: Json
}

export interface ProposalServiceResult {
  success: boolean
  proposalId?: string
  missionId?: string
  stepIds?: string[]
  error?: string
  rejected?: boolean
  rejectionReason?: string
}

export interface Proposal {
  id: string
  title: string
  description: string | null
  source: ProposalSource
  proposer_agent: string | null
  step_kind: string
  step_payload: Json
  status: ProposalStatus
  rejection_reason: string | null
  created_at: string
  processed_at: string | null
}
