import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform')
    const where = platform ? { platform } : {}
    const items = await db.postTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error('[api/templates GET]', error)
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
}

interface CreateTemplateBody {
  name?: string
  body?: string
  platform?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTemplateBody
    const { name, body: text, platform } = body ?? {}

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (text === undefined || text === null) {
      return NextResponse.json({ error: 'Body is required' }, { status: 400 })
    }

    const created = await db.postTemplate.create({
      data: {
        name,
        body: String(text),
        platform: platform ?? 'all',
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('[api/templates POST]', error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
