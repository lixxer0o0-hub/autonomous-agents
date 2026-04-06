import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Triggers API
 *
 * GET: List all trigger rules
 * POST: Create a new trigger rule
 * PUT: Update a trigger rule
 * DELETE: Delete a trigger rule
 */
export async function GET(request: NextRequest) {
  const sb = createAdminClient()
  const { searchParams } = new URL(request.url)
  const enabled = searchParams.get('enabled')

  try {
    let query = sb.from('ops_trigger_rules').select()

    if (enabled !== null) {
      query = query.eq('enabled', enabled === 'true')
    }

    const { data: rules, error } = await query.order('name', { ascending: true })

    if (error) {
      throw error
    }

    return NextResponse.json({ rules })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const sb = createAdminClient()

  try {
    const body = await request.json()

    // Validate required fields
    if (!body.name || !body.condition || !body.proposal_template) {
      return NextResponse.json(
        { error: 'Missing required fields: name, condition, proposal_template' },
        { status: 400 }
      )
    }

    const { data, error } = await sb
      .from('ops_trigger_rules')
      .insert({
        name: body.name,
        condition: body.condition,
        proposal_template: body.proposal_template,
        cooldown_minutes: body.cooldown_minutes ?? 120,
        enabled: body.enabled ?? true
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      rule: data
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const sb = createAdminClient()

  try {
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.condition !== undefined) updateData.condition = body.condition
    if (body.proposal_template !== undefined) updateData.proposal_template = body.proposal_template
    if (body.cooldown_minutes !== undefined) updateData.cooldown_minutes = body.cooldown_minutes
    if (body.enabled !== undefined) updateData.enabled = body.enabled

    const { data, error } = await sb
      .from('ops_trigger_rules')
      .update(updateData)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      rule: data
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const sb = createAdminClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json(
      { error: 'Missing required parameter: id' },
      { status: 400 }
    )
  }

  try {
    const { error } = await sb
      .from('ops_trigger_rules')
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
