import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '../lib/db/types'
import { getEventsMatching } from './event-service'
import { createProposalAndMaybeAutoApprove } from './proposal-service'

interface TriggerCondition {
  type: string
  [key: string]: unknown
}

interface TriggerRule {
  id: string
  name: string
  condition: TriggerCondition
  proposal_template: {
    title: string
    step_kind: string
    step_payload: Json
  }
  cooldown_minutes: number
  last_fired_at: string | null
  enabled: boolean
}

interface TriggerResult {
  fired: boolean
  ruleName: string
  proposalId?: string
  reason?: string
}

/**
 * Evaluate all trigger rules and create proposals for matches.
 * Called by the heartbeat endpoint.
 */
export async function evaluateTriggers(
  sb: SupabaseClient,
  timeoutMs: number = 4000
): Promise<TriggerResult[]> {
  const startTime = Date.now()
  const results: TriggerResult[] = []

  // Get all enabled trigger rules
  const { data: rules, error } = await sb
    .from('ops_trigger_rules')
    .select()
    .eq('enabled', true)

  if (error || !rules) {
    console.error('Failed to fetch trigger rules:', error)
    return results
  }

  for (const rule of rules as TriggerRule[]) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      console.log('Trigger evaluation timeout reached')
      break
    }

    // Check cooldown
    if (rule.last_fired_at) {
      const cooldownMs = rule.cooldown_minutes * 60 * 1000
      const timeSinceLastFire = Date.now() - new Date(rule.last_fired_at).getTime()
      if (timeSinceLastFire < cooldownMs) {
        continue // Still in cooldown
      }
    }

    // Evaluate the condition
    const matchResult = await evaluateTriggerCondition(sb, rule.condition)

    if (matchResult.matched) {
      // Create proposal from template
      const proposalResult = await createProposalAndMaybeAutoApprove(sb, {
        title: rule.proposal_template.title,
        source: 'trigger',
        stepKind: rule.proposal_template.step_kind,
        stepPayload: rule.proposal_template.step_payload,
        proposerAgent: 'trigger:' + rule.name
      })

      // Update last_fired_at
      await sb
        .from('ops_trigger_rules')
        .update({ last_fired_at: new Date().toISOString() })
        .eq('id', rule.id)

      results.push({
        fired: true,
        ruleName: rule.name,
        proposalId: proposalResult.proposalId,
        reason: matchResult.reason
      })
    } else {
      results.push({
        fired: false,
        ruleName: rule.name,
        reason: matchResult.reason
      })
    }
  }

  return results
}

/**
 * Evaluate a single trigger condition.
 */
async function evaluateTriggerCondition(
  sb: SupabaseClient,
  condition: TriggerCondition
): Promise<{ matched: boolean; reason?: string }> {
  switch (condition.type) {
    case 'tweet_engagement':
      return evaluateTweetEngagement(sb, condition)

    case 'mission_status':
      return evaluateMissionStatus(sb, condition)

    case 'content_published':
      return evaluateContentPublished(sb, condition)

    case 'insight_upvotes':
      return evaluateInsightUpvotes(sb, condition)

    case 'event_count':
      return evaluateEventCount(sb, condition)

    default:
      return { matched: false, reason: `Unknown trigger type: ${condition.type}` }
  }
}

/**
 * Check if any tweet has engagement rate above threshold.
 */
async function evaluateTweetEngagement(
  sb: SupabaseClient,
  condition: { threshold?: number; metric?: string }
): Promise<{ matched: boolean; reason?: string }> {
  const threshold = condition.threshold ?? 5

  // Look for recent step_completed events for post_tweet
  const events = await getEventsMatching(sb, {
    eventType: 'step_completed',
    since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  })

  for (const event of events) {
    const payload = event.payload as { stepKind?: string; result?: { engagement_rate?: number } }
    if (payload.stepKind === 'post_tweet') {
      const engagementRate = payload.result?.engagement_rate ?? 0
      if (engagementRate >= threshold) {
        return {
          matched: true,
          reason: `Tweet engagement ${engagementRate}% >= ${threshold}%`
        }
      }
    }
  }

  return { matched: false, reason: 'No tweets above threshold' }
}

/**
 * Check if any mission has failed.
 */
async function evaluateMissionStatus(
  sb: SupabaseClient,
  condition: { status?: string }
): Promise<{ matched: boolean; reason?: string }> {
  const targetStatus = condition.status ?? 'failed'

  // Look for recent mission_failed events
  const events = await getEventsMatching(sb, {
    eventType: 'mission_failed',
    since: new Date(Date.now() - 60 * 60 * 1000).toISOString() // Last hour
  })

  if (events.length > 0) {
    return {
      matched: true,
      reason: `${events.length} mission(s) failed in the last hour`
    }
  }

  // Also check database directly for recently failed missions
  const { count } = await sb
    .from('ops_missions')
    .select('id', { count: 'exact', head: true })
    .eq('status', targetStatus)
    .gte('completed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

  if ((count ?? 0) > 0) {
    return {
      matched: true,
      reason: `${count} mission(s) with status ${targetStatus}`
    }
  }

  return { matched: false, reason: `No missions with status ${targetStatus}` }
}

/**
 * Check if any content was published.
 */
async function evaluateContentPublished(
  sb: SupabaseClient,
  _condition: Record<string, unknown>
): Promise<{ matched: boolean; reason?: string }> {
  // Look for recent step_completed events for write_content
  const events = await getEventsMatching(sb, {
    eventType: 'step_completed',
    since: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // Last 2 hours
  })

  for (const event of events) {
    const payload = event.payload as { stepKind?: string }
    if (payload.stepKind === 'write_content') {
      return {
        matched: true,
        reason: 'Content was published'
      }
    }
  }

  return { matched: false, reason: 'No content published recently' }
}

/**
 * Check if any insight has enough upvotes.
 */
async function evaluateInsightUpvotes(
  sb: SupabaseClient,
  condition: { threshold?: number }
): Promise<{ matched: boolean; reason?: string }> {
  const threshold = condition.threshold ?? 3

  // This would need an insights table - placeholder implementation
  // In a real implementation, you'd query an insights or memories table

  // For now, check for step_completed events with type 'insight_created'
  const events = await getEventsMatching(sb, {
    eventType: 'step_completed',
    since: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  })

  for (const event of events) {
    const payload = event.payload as { stepKind?: string; result?: { upvotes?: number } }
    if (payload.stepKind === 'analyze' && payload.result?.upvotes && payload.result.upvotes >= threshold) {
      return {
        matched: true,
        reason: `Insight has ${payload.result.upvotes} upvotes >= ${threshold}`
      }
    }
  }

  return { matched: false, reason: 'No insights above threshold' }
}

/**
 * Check if event count exceeds threshold.
 */
async function evaluateEventCount(
  sb: SupabaseClient,
  condition: { eventType?: string; count?: number; hours?: number }
): Promise<{ matched: boolean; reason?: string }> {
  const eventType = condition.eventType
  const targetCount = condition.count ?? 10
  const hours = condition.hours ?? 1

  const events = await getEventsMatching(sb, {
    eventType: eventType as any,
    since: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  })

  if (events.length >= targetCount) {
    return {
      matched: true,
      reason: `${events.length} events of type ${eventType} in last ${hours}h`
    }
  }

  return { matched: false, reason: `${events.length} events < ${targetCount} threshold` }
}