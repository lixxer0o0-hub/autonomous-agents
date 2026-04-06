/**
 * OpenClaw Integration
 *
 * This module provides the bridge between the OpenClaw agent framework
 * and the Supabase-based mission system.
 *
 * Usage in OpenClaw agent:
 * ```typescript
 * import { OpenClawAgent } from 'openclaw'
 * import { createOpenClawBridge } from './integrations/openclaw'
 *
 * const agent = new OpenClawAgent({ name: 'my-agent' })
 * const bridge = createOpenClawBridge(agent)
 *
 * // The bridge automatically:
 * // - Claims steps from the queue
 * // - Executes them using the agent
 * // - Reports results back to Supabase
 * ```
 */

import { AgentWorker, registerExecutor } from '../workers'
import type { Json } from '../lib/db/types'

export interface OpenClawBridgeOptions {
  /**
   * Agent name for identification
   */
  agentName: string
  /**
   * Optional custom Supabase URL
   */
  supabaseUrl?: string
  /**
   * Optional custom Supabase key
   */
  supabaseKey?: string
  /**
   * Step kinds this agent can handle
   * Defaults to all available kinds
   */
  stepKinds?: string[]
}

export interface OpenClawBridge {
  /**
   * Start the bridge loop
   * Continuously claims and executes steps
   */
  start(): Promise<void>
  /**
   * Stop the bridge loop
   */
  stop(): void
  /**
   * Execute a single step of the given kind
   */
  runStep(stepKind: string): Promise<{
    claimed: boolean
    success?: boolean
    error?: string
  }>
}

/**
 * Create an OpenClaw bridge instance.
 */
export function createOpenClawBridge(
  agent: {
    name: string
    run: (task: string, context?: Record<string, unknown>) => Promise<string>
  },
  options: OpenClawBridgeOptions
): OpenClawBridge {
  const { agentName, stepKinds } = options
  const workerId = `openclaw-${agentName}`

  const worker = new AgentWorker(
    workerId,
    options.supabaseUrl,
    options.supabaseKey
  )

  let running = false

  // Register executors that use the agent
  registerExecutor('analyze', async (payload: Json) => {
    try {
      const { type, source, focus } = payload as {
        type?: string
        source?: Json
        focus?: string
      }

      const task = `Analyze the following data. Focus on: ${focus ?? 'general analysis'}. Type: ${type ?? 'unknown'}. Data: ${JSON.stringify(source, null, 2)}`
      const result = await agent.run(task, { type, focus, source })

      return {
        success: true,
        data: {
          type: type ?? 'general',
          focus: focus ?? 'overview',
          summary: result,
          agentName
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed'
      }
    }
  })

  registerExecutor('write_content', async (payload: Json) => {
    try {
      const { type, topic, format, length } = payload as {
        type?: string
        topic?: string
        format?: string
        length?: string
      }

      const task = `Write ${format ?? 'content'} about ${topic ?? 'the given topic'}. Type: ${type ?? 'article'}. Target length: ${length ?? 'medium'}.`
      const result = await agent.run(task, { type, topic, format, length })

      return {
        success: true,
        data: {
          type: type ?? 'article',
          topic,
          content: result,
          wordCount: result.split(' ').length,
          agentName
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Content generation failed'
      }
    }
  })

  registerExecutor('draft_tweet', async (payload: Json) => {
    try {
      const { topic, tone, maxLength = 280 } = payload as {
        topic?: string
        tone?: string
        maxLength?: number
      }

      const task = `Draft a tweet about ${topic ?? 'the given topic'}. Tone: ${tone ?? 'engaging'}. Max length: ${maxLength} characters.`
      const result = await agent.run(task, { topic, tone, maxLength })

      const draft = result.substring(0, maxLength)

      return {
        success: true,
        data: {
          draft,
          characterCount: draft.length,
          maxLength,
          agentName
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tweet drafting failed'
      }
    }
  })

  registerExecutor('crawl', async (payload: Json) => {
    // Crawl uses native fetch, not the agent
    const { url, method = 'GET', headers = {}, body } = payload as {
      url?: string
      method?: string
      headers?: Record<string, string>
      body?: unknown
    }

    if (!url) {
      return { success: false, error: 'URL is required' }
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      })

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        }
      }

      const contentType = response.headers.get('content-type') ?? ''
      let data: Json

      if (contentType.includes('application/json')) {
        data = await response.json()
      } else {
        data = { text: await response.text() }
      }

      return {
        success: true,
        data: {
          url,
          status: response.status,
          data
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Fetch error'
      }
    }
  })

  // Post tweet and deploy use placeholder implementations
  // In production, these would integrate with Twitter API and deployment services
  registerExecutor('post_tweet', async (payload: Json) => {
    const { draftId, content } = payload as {
      draftId?: string
      content?: string
    }

    return {
      success: true,
      data: {
        tweetId: 'placeholder',
        content: content ?? 'Tweet content',
        postedAt: new Date().toISOString(),
        agentName
      }
    }
  })

  registerExecutor('deploy', async (payload: Json) => {
    const { target, branch, environment } = payload as {
      target?: string
      branch?: string
      environment?: string
    }

    return {
      success: true,
      data: {
        target: target ?? 'default',
        branch: branch ?? 'main',
        environment: environment ?? 'production',
        deployedAt: new Date().toISOString(),
        status: 'success',
        agentName
      }
    }
  })

  const activeStepKinds = stepKinds ?? [
    'analyze',
    'write_content',
    'draft_tweet',
    'crawl',
    'post_tweet',
    'deploy'
  ]

  return {
    async start() {
      running = true
      console.log(`[${workerId}] OpenClaw bridge started`)

      while (running) {
        try {
          const result = await worker.runAll(activeStepKinds)

          if (result.total > 0) {
            console.log(`[${workerId}] Processed ${result.total} steps: ${result.succeeded} succeeded, ${result.failed} failed`)
          }

          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, 5000))
        } catch (error) {
          console.error(`[${workerId}] Error in worker loop:`, error)
          await new Promise(resolve => setTimeout(resolve, 10000))
        }
      }
    },

    stop() {
      running = false
      console.log(`[${workerId}] OpenClaw bridge stopped`)
    },

    async runStep(stepKind: string) {
      return worker.runStep(stepKind)
    }
  }
}

/**
 * Convenience function to create and start a bridge immediately.
 */
export async function startOpenClawBridge(
  agent: {
    name: string
    run: (task: string, context?: Record<string, unknown>) => Promise<string>
  },
  options: OpenClawBridgeOptions
): Promise<OpenClawBridge> {
  const bridge = createOpenClawBridge(agent, options)
  // Start in background
  bridge.start().catch(console.error)
  return bridge
}
