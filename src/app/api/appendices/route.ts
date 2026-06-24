import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform')
    const where = platform ? { platform } : {}
    const items = await db.appendixTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error('[api/appendices GET]', error)
    return NextResponse.json({ error: 'Failed to load appendices' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { platform, name, body: text, position, category } = body ?? {}

    if (!platform || typeof platform !== 'string') {
      return NextResponse.json({ error: 'Platform is required' }, { status: 400 })
    }
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (text === undefined || text === null) {
      return NextResponse.json({ error: 'Body is required' }, { status: 400 })
    }

    const created = await db.appendixTemplate.create({
      data: {
        platform,
        name,
        body: String(text),
        position: position === 'prepend' ? 'prepend' : 'append',
        category: category ?? null,
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('[api/appendices POST]', error)
    return NextResponse.json({ error: 'Failed to create appendix' }, { status: 500 })
  }
}
