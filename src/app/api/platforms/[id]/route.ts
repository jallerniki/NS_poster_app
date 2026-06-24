import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const account = await db.platformAccount.findUnique({
      where: { id },
      include: {
        _count: { select: { targets: true } },
        targets: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { post: { select: { id: true, title: true, scheduledAt: true, status: true } } },
        },
      },
    })
    if (!account) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(account)
  } catch (error) {
    console.error('[api/platforms/[id] GET]', error)
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { platform, name, targetId, token, extra, active } = body ?? {}

    const existing = await db.platformAccount.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updated = await db.platformAccount.update({
      where: { id },
      data: {
        platform: platform ?? existing.platform,
        name: name ?? existing.name,
        targetId: targetId === undefined ? existing.targetId : targetId,
        token: token ?? existing.token,
        extra: extra === undefined ? existing.extra : extra,
        active: typeof active === 'boolean' ? active : existing.active,
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[api/platforms/[id] PUT]', error)
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const existing = await db.platformAccount.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await db.platformAccount.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/platforms/[id] DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
