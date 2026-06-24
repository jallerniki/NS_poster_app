import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PLATFORMS } from '@/lib/social'

export async function GET() {
  try {
    const accounts = await db.platformAccount.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { targets: true } } },
    })
    return NextResponse.json(accounts)
  } catch (error) {
    console.error('[api/platforms GET]', error)
    return NextResponse.json(
      { error: 'Failed to load platform accounts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { platform, name, targetId, token, extra } = body ?? {}

    if (!platform || !PLATFORMS[platform as keyof typeof PLATFORMS]) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const account = await db.platformAccount.create({
      data: {
        platform,
        name,
        targetId: targetId ?? null,
        token,
        extra: extra ?? null,
      },
    })
    return NextResponse.json(account, { status: 201 })
  } catch (error) {
    console.error('[api/platforms POST]', error)
    return NextResponse.json(
      { error: 'Failed to create platform account' },
      { status: 500 }
    )
  }
}
