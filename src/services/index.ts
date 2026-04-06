// Services
export { createProposalAndMaybeAutoApprove, rejectProposal, approveProposal, getPendingProposals, getRecentProposals } from './proposal-service'
export { createMissionFromProposal, claimStep, completeStep, failStep, maybeFinalizeMissionIfDone, getQueuedSteps, getRunningSteps, getMission, getMissionSteps } from './mission-service'
export { emitEvent, getRecentEvents, getEventsMatching } from './event-service'
export { evaluateTriggers } from './trigger-evaluator'
export { processReactionQueue, queueReaction, getPendingReactions } from './reaction-processor'
export { recoverStaleSteps, recoverStuckMissions, cleanupOldMissions, performMaintenance } from './stale-recovery'
export { runGateChecks, STEP_KIND_GATES } from './cap-gates'
export { getOpsPolicyJson, setOpsPolicyJson, isAutoApproveAllowed, getDailyProposalLimit, getReactionMatrix } from './policy-helpers'

// Types
export type { ProposalServiceInput, ProposalServiceResult } from '../types/proposal'
export type { Mission, MissionStep, CreateMissionInput, FinalizeResult } from '../types/mission'
export type { EventType, AgentEvent, EmitEventInput } from '../types/event'