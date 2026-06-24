import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const item = await db.appendixTemplate.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(item)
  } catch (error) {
    console.error('[api/appendices/[id] GET]', error)
    return NextResponse.json({ error: 'Failed to load appendix' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { platform, name, body: text, position, category, active } = body ?? {}

    const existing = await db.appendixTemplate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updated = await db.appendixTemplate.update({
      where: { id },
      data: {
        platform: platform ?? existing.platform,
        name: name ?? existing.name,
        body: text === undefined ? existing.body : String(text),
        position: position ? (position === 'prepend' ? 'prepend' : 'append') : existing.position,
        category: category === undefined ? existing.category : category,
        active: typeof active === 'boolean' ? active : existing.active,
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[api/appendices/[id] PUT]', error)
    return NextResponse.json({ error: 'Failed to update appendix' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const existing = await db.appendixTemplate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await db.appendixTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/appendices/[id] DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete appendix' }, { status: 500 })
  }
}
