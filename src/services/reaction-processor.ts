import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '../lib/db/types'
import { getRecentEvents, emitEvent } from './event-service'
import { createProposalAndMaybeAutoApprove } from './proposal-service'
import { getReactionMatrix } from './policy-helpers'

interface ReactionPattern {
  source: string
  tags: string[]
  target: string
  type: string
  probability: number
  cooldown: number
}

interface ReactionResult {
  processed: number
  reactions: Array<{
    sourceAgent: string
    targetAgent: string
    type: string
    triggered: boolean
  }>
}

// Track last reaction times for cooldown (in-memory, would use Redis in production)
const lastReactionTimes = new Map<string, number>()

/**
 * Process the reaction queue based on the reaction matrix.
 * Called by the heartbeat endpoint.
 *
 * Flow:
 * 1. Get recent events
 * 2. For each event, check if any reaction pattern matches
 * 3. Apply probability check
 * 4. Check cooldown
 * 5. Create proposal if reaction should fire
 */
export async function processReactionQueue(
  sb: SupabaseClient,
  timeoutMs: number = 3000
): Promise<ReactionResult> {
  const startTime = Date.now()
  const result: ReactionResult = {
    processed: 0,
    reactions: []
  }

  // Get the reaction matrix from policy
  const matrix = await getReactionMatrix(sb)

  if (!matrix.patterns || matrix.patterns.length === 0) {
    return result
  }

  // Get events from last 5 minutes
  const events = await getRecentEvents(sb, { hours: 0.1, limit: 100 })

  for (const event of events) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      console.log('Reaction processing timeout reached')
      break
    }

    for (const pattern of matrix.patterns as ReactionPattern[]) {
      // Check if pattern matches this event
      if (!matchesPattern(event, pattern)) {
        continue
      }

      // Apply probability check (0-1)
      if (Math.random() > pattern.probability) {
        continue
      }

      // Check cooldown
      const cooldownKey = `${pattern.source}-${pattern.target}-${pattern.type}`
      const lastTime = lastReactionTimes.get(cooldownKey) ?? 0
      const cooldownMs = pattern.cooldown * 60 * 1000

      if (Date.now() - lastTime < cooldownMs) {
        continue
      }

      // Create proposal
      const proposalResult = await createProposalAndMaybeAutoApprove(sb, {
        title: `Reaction: ${pattern.type} from ${pattern.source}`,
        source: 'reaction',
        proposerAgent: pattern.target,
        stepKind: pattern.type,
        stepPayload: {
          triggered_by: event.event_type,
          source_agent: pattern.source,
          event_payload: event.payload
        } as Json
      })

      // Update cooldown tracker
      lastReactionTimes.set(cooldownKey, Date.now())

      // Queue reaction for tracking
      await sb.from('ops_agent_reactions').insert({
        source_agent: pattern.source,
        target_agent: pattern.target,
        reaction_type: pattern.type,
        payload: {
          event_id: event.id,
          event_type: event.event_type,
          proposal_id: proposalResult.proposalId
        } as Json,
        status: 'completed'
      })

      result.reactions.push({
        sourceAgent: pattern.source,
        targetAgent: pattern.target,
        type: pattern.type,
        triggered: proposalResult.success
      })

      result.processed++
    }
  }

  return result
}

/**
 * Check if an event matches a reaction pattern.
 */
function matchesPattern(
  event: { event_type: string; agent_name: string | null; payload: Json },
  pattern: ReactionPattern
): boolean {
  // Source can be wildcard "*"
  if (pattern.source !== '*' && pattern.source !== event.agent_name) {
    return false
  }

  // Check if all required tags are present in event type or payload
  const payload = event.payload as Record<string, unknown>

  for (const tag of pattern.tags) {
    // Tags can match event_type or any key in payload
    if (event.event_type.includes(tag)) continue
    if (payload && typeof payload === 'object' && tag in payload) continue

    // Check for nested values
    const values = Object.values(payload ?? {})
    if (values.some(v => typeof v === 'string' && v.includes(tag))) continue

    return false
  }

  return true
}

/**
 * Manually queue a reaction (for testing or external triggers).
 */
export async function queueReaction(
  sb: SupabaseClient,
  input: {
    sourceAgent: string
    targetAgent: string
    reactionType: string
    payload: Json
  }
): Promise<{ reactionId: string }> {
  const { data, error } = await sb
    .from('ops_agent_reactions')
    .insert({
      source_agent: input.sourceAgent,
      target_agent: input.targetAgent,
      reaction_type: input.reactionType,
      payload: input.payload,
      status: 'queued'
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to queue reaction: ${error.message}`)
  }

  return { reactionId: data.id }
}

/**
 * Get pending reactions (for debugging).
 */
export async function getPendingReactions(sb: SupabaseClient) {
  const { data, error } = await sb
    .from('ops_agent_reactions')
    .select()
    .eq('status', 'queued')
    .order('created_at', { ascending: true })

  if (error) {
    return []
  }

  return data
}
