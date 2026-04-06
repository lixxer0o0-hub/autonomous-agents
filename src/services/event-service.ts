import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '../lib/db/types'
import type { EventType, EmitEventInput } from '../types/event'

/**
 * Emit an event to the event stream.
 * Events are used for triggers and reactions.
 */
export async function emitEvent(
  sb: SupabaseClient,
  input: EmitEventInput
): Promise<{ eventId: string }> {
  const { data, error } = await sb
    .from('ops_agent_events')
    .insert({
      event_type: input.eventType,
      agent_name: input.agentName ?? null,
      payload: input.payload as Json
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to emit event:', error)
    throw new Error(`Failed to emit event: ${error.message}`)
  }

  return { eventId: data.id }
}

/**
 * Get recent events.
 */
export async function getRecentEvents(
  sb: SupabaseClient,
  options?: {
    eventType?: EventType
    agentName?: string
    hours?: number
    limit?: number
  }
) {
  const hours = options?.hours ?? 24
  const limit = options?.limit ?? 100
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  let query = sb
    .from('ops_agent_events')
    .select()
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options?.eventType) {
    query = query.eq('event_type', options.eventType)
  }

  if (options?.agentName) {
    query = query.eq('agent_name', options.agentName)
  }

  const { data, error } = await query

  if (error) {
    console.error('Failed to get events:', error)
    return []
  }

  return data
}

/**
 * Get events matching specific criteria.
 * Used by triggers to detect conditions.
 */
export async function getEventsMatching(
  sb: SupabaseClient,
  criteria: {
    eventType?: EventType | EventType[]
    agentName?: string
    since?: string
    payloadMatch?: Record<string, unknown>
  }
) {
  let query = sb.from('ops_agent_events').select()

  if (criteria.eventType) {
    if (Array.isArray(criteria.eventType)) {
      query = query.in('event_type', criteria.eventType)
    } else {
      query = query.eq('event_type', criteria.eventType)
    }
  }

  if (criteria.agentName) {
    query = query.eq('agent_name', criteria.agentName)
  }

  if (criteria.since) {
    query = query.gte('created_at', criteria.since)
  }

  const { data, error } = await query

  if (error) {
    return []
  }

  // Filter by payload match if provided
  if (criteria.payloadMatch && data) {
    const matchObj = criteria.payloadMatch
    return data.filter(event => {
      const payload = event.payload as Record<string, unknown>
      return Object.entries(matchObj).every(
        ([key, value]) => payload[key] === value
      )
    })
  }

  return data
}