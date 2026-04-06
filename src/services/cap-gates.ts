import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfDay } from 'date-fns'
import { getOpsPolicyJson } from './policy-helpers'

export type StepKindGate = (sb: SupabaseClient) => Promise<{ ok: boolean; reason?: string }>

/**
 * Gate functions for each step kind.
 * These check quotas/policies before a proposal is accepted.
 */
export const STEP_KIND_GATES: Record<string, StepKindGate> = {
  write_content: checkWriteContentGate,
  post_tweet: checkPostTweetGate,
  deploy: checkDeployGate,
  crawl: checkCrawlGate,
  analyze: checkAnalyzeGate,
  draft_tweet: checkDraftTweetGate,
}

/**
 * Check if writing content is allowed.
 */
async function checkWriteContentGate(sb: SupabaseClient): Promise<{ ok: boolean; reason?: string }> {
  // Check if content creation is enabled
  const contentPolicy = await getOpsPolicyJson(sb, 'content_creation', { enabled: true })
  if (contentPolicy.enabled === false) {
    return { ok: false, reason: 'Content creation is disabled' }
  }

  // Check daily content limit
  const dailyLimit = await getOpsPolicyJson(sb, 'daily_content_limit', { limit: 50 })
  const limit = Number(dailyLimit.limit ?? 50)

  const startOfToday = startOfDay(new Date()).toISOString()

  const { count } = await sb
    .from('ops_mission_steps')
    .select('id', { count: 'exact', head: true })
    .eq('step_kind', 'write_content')
    .eq('status', 'succeeded')
    .gte('completed_at', startOfToday)

  if ((count ?? 0) >= limit) {
    return { ok: false, reason: `Daily content limit reached (${count}/${limit})` }
  }

  return { ok: true }
}

/**
 * Check if posting a tweet is allowed.
 */
export async function checkPostTweetGate(sb: SupabaseClient): Promise<{ ok: boolean; reason?: string }> {
  // Check if autopost is enabled
  const autopost = await getOpsPolicyJson(sb, 'x_autopost', { enabled: true })
  if (autopost.enabled === false) {
    return { ok: false, reason: 'Twitter autopost is disabled' }
  }

  // Check daily tweet quota
  const quota = await getOpsPolicyJson(sb, 'x_daily_quota', { limit: 10 })
  const limit = Number(quota.limit ?? 10)

  const startOfToday = startOfDay(new Date()).toISOString()

  const { count } = await sb
    .from('ops_mission_steps')
    .select('id', { count: 'exact', head: true })
    .eq('step_kind', 'post_tweet')
    .eq('status', 'succeeded')
    .gte('completed_at', startOfToday)

  if ((count ?? 0) >= limit) {
    return { ok: false, reason: `Daily tweet quota reached (${count}/${limit})` }
  }

  return { ok: true }
}

/**
 * Check if deployment is allowed.
 */
async function checkDeployGate(sb: SupabaseClient): Promise<{ ok: boolean; reason?: string }> {
  const deployPolicy = await getOpsPolicyJson(sb, 'deploy_policy', { enabled: true, require_approval: false })

  if (deployPolicy.enabled === false) {
    return { ok: false, reason: 'Deployment is disabled' }
  }

  // If approval required, proposals should not auto-approve
  if (deployPolicy.require_approval === true) {
    return { ok: false, reason: 'Deployment requires manual approval' }
  }

  return { ok: true }
}

/**
 * Check if crawling is allowed.
 */
async function checkCrawlGate(sb: SupabaseClient): Promise<{ ok: boolean; reason?: string }> {
  const crawlPolicy = await getOpsPolicyJson(sb, 'crawl_policy', { enabled: true })

  if (crawlPolicy.enabled === false) {
    return { ok: false, reason: 'Crawling is disabled' }
  }

  return { ok: true }
}

/**
 * Check if analysis is allowed.
 */
async function checkAnalyzeGate(sb: SupabaseClient): Promise<{ ok: boolean; reason?: string }> {
  const analyzePolicy = await getOpsPolicyJson(sb, 'analyze_policy', { enabled: true })

  if (analyzePolicy.enabled === false) {
    return { ok: false, reason: 'Analysis is disabled' }
  }

  return { ok: true }
}

/**
 * Check if drafting tweets is allowed.
 */
async function checkDraftTweetGate(sb: SupabaseClient): Promise<{ ok: boolean; reason?: string }> {
  const autopost = await getOpsPolicyJson(sb, 'x_autopost', { enabled: true })

  if (autopost.enabled === false) {
    return { ok: false, reason: 'Twitter integration is disabled' }
  }

  return { ok: true }
}

/**
 * Run gate checks for a step kind.
 * Returns { ok: true } if all gates pass, or { ok: false, reason } if blocked.
 */
export async function runGateChecks(
  sb: SupabaseClient,
  stepKind: string
): Promise<{ ok: boolean; reason?: string }> {
  const gate = STEP_KIND_GATES[stepKind]

  if (!gate) {
    // No gate for this step kind = allowed by default
    return { ok: true }
  }

  return gate(sb)
}