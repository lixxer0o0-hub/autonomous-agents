import type { Json } from '../lib/db/types'

export type MissionStatus = 'approved' | 'running' | 'succeeded' | 'failed'
export type StepStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface Mission {
  id: string
  proposal_id: string | null
  title: string
  status: MissionStatus
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface MissionStep {
  id: string
  mission_id: string
  step_kind: string
  step_payload: Json
  status: StepStatus
  reserved_at: string | null
  reserved_by: string | null
  started_at: string | null
  completed_at: string | null
  result: Json | null
  last_error: string | null
  retry_count: number
  created_at: string
}

export interface CreateMissionInput {
  proposalId: string
  title: string
  steps: Array<{
    stepKind: string
    stepPayload: Json
  }>
}

export interface FinalizeResult {
  status: 'succeeded' | 'failed' | 'incomplete'
  missionId: string
}
