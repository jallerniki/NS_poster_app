import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const item = await db.postTemplate.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(item)
  } catch (error) {
    console.error('[api/templates/[id] GET]', error)
    return NextResponse.json({ error: 'Failed to load template' }, { status: 500 })
  }
}

interface UpdateTemplateBody {
  name?: string
  body?: string
  platform?: string
  active?: boolean
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = (await request.json()) as UpdateTemplateBody
    const { name, body: text, platform, active } = body ?? {}

    const existing = await db.postTemplate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updated = await db.postTemplate.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        body: text === undefined ? existing.body : String(text),
        platform: platform ?? existing.platform,
        active: typeof active === 'boolean' ? active : existing.active,
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[api/templates/[id] PUT]', error)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const existing = await db.postTemplate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await db.postTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/templates/[id] DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
