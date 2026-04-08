import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const sb = createAdminClient() as any as any
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  try {
    let query = sb.from('ops_policy').select()
    if (key) query = query.eq('key', key)
    const { data: policies, error } = await query.order('key', { ascending: true })
    if (error) throw error
    if (key && policies.length > 0) return NextResponse.json({ policy: policies[0] })
    return NextResponse.json({ policies })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const sb = createAdminClient() as any as any
  try {
    const body = await request.json()
    if (!body.key || body.value === undefined) return NextResponse.json({ error: 'Missing required fields: key, value' }, { status: 400 })
    const { data, error } = await sb.from('ops_policy').upsert({ key: body.key, value: body.value, description: body.description ?? null, updated_at: new Date().toISOString() }).select().single()
    if (error) throw error
    return NextResponse.json({ success: true, policy: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
