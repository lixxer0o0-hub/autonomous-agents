import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '../lib/db/types'

/**
 * Get a policy value as JSON object.
 * Returns the default value if the policy doesn't exist or has no value.
 */
export async function getOpsPolicyJson<T extends Record<string, unknown>>(
  sb: SupabaseClient,
  key: string,
  defaultValue: T
): Promise<T> {
  const { data, error } = await sb
    .from('ops_policy')
    .select('value')
    .eq('key', key)
    .single()

  if (error || !data?.value) {
    return defaultValue
  }

  return data.value as T
}

/**
 * Set a policy value.
 */
export async function setOpsPolicyJson(
  sb: SupabaseClient,
  key: string,
  value: Json
): Promise<void> {
  await sb
    .from('ops_policy')
    .upsert({ key, value, updated_at: new Date().toISOString() })
}

/**
 * Check if a step kind is allowed to auto-approve.
 */
export async function isAutoApproveAllowed(
  sb: SupabaseClient,
  stepKind: string
): Promise<boolean> {
  const autoApprove = await getOpsPolicyJson(sb, 'auto_approve', {
    enabled: true,
    allowed_step_kinds: ['draft_tweet', 'crawl', 'analyze', 'write_content']
  })

  if (autoApprove.enabled === false) {
    return false
  }

  const allowedKinds = (autoApprove.allowed_step_kinds as string[]) ?? []
  return allowedKinds.includes(stepKind)
}

/**
 * Get the daily proposal limit.
 */
export async function getDailyProposalLimit(sb: SupabaseClient): Promise<number> {
  const policy = await getOpsPolicyJson(sb, 'daily_proposal_limit', { limit: 100 })
  return Number(policy.limit ?? 100)
}

/**
 * Get the reaction matrix for inter-agent responses.
 */
export async function getReactionMatrix(sb: SupabaseClient): Promise<{
  patterns: Array<{
    source: string
    tags: string[]
    target: string
    type: string
    probability: number
    cooldown: number
  }>
}> {
  return getOpsPolicyJson(sb, 'reaction_matrix', { patterns: [] })
}