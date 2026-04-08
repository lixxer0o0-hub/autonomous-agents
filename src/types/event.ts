import type { Json } from '../lib/db/types'

export type EventType =
  | 'proposal_created'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'mission_created'
  | 'mission_started'
  | 'mission_completed'
  | 'mission_failed'
  | 'step_claimed'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'trigger_fired'
  | 'reaction_queued'
  | 'reaction_processed'
  | 'gate_rejected'

export interface AgentEvent {
  id: string
  event_type: EventType
  agent_name: string | null
  payload: Json
  created_at: string
}

export interface EmitEventInput {
  eventType: EventType
  agentName?: string
  payload: Json
}
