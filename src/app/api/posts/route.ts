import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (from || to) {
      const range: Record<string, Date> = {}
      if (from) range.gte = new Date(from)
      if (to) range.lte = new Date(to)
      where.scheduledAt = range
    }

    const posts = await db.scheduledPost.findMany({
      where,
      orderBy: { scheduledAt: 'desc' },
      include: {
        targets: { include: { account: { select: { id: true, platform: true, name: true } } } },
      },
    })
    return NextResponse.json(posts)
  } catch (error) {
    console.error('[api/posts GET]', error)
    return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 })
  }
}

interface CreatePostBody {
  title?: string
  content?: string
  mediaUrls?: string[]
  wordpressRef?: string
  productMeta?: Record<string, unknown>
  scheduledAt?: string
  platformIds?: string[]
  appendixMap?: Record<string, string>
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreatePostBody
    const { title, content, mediaUrls, wordpressRef, productMeta, scheduledAt, platformIds, appendixMap } =
      body ?? {}

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (content === undefined || content === null) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }
    if (!scheduledAt) {
      return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 })
    }
    const scheduledDate = new Date(scheduledAt)
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: 'Invalid scheduledAt' }, { status: 400 })
    }
    if (!Array.isArray(platformIds) || platformIds.length === 0) {
      return NextResponse.json({ error: 'platformIds is required' }, { status: 400 })
    }

    // Verify all platformIds exist
    const accounts = await db.platformAccount.findMany({
      where: { id: { in: platformIds } },
      select: { id: true },
    })
    if (accounts.length !== platformIds.length) {
      return NextResponse.json(
        { error: 'One or more platformIds not found' },
        { status: 400 }
      )
    }

    const post = await db.scheduledPost.create({
      data: {
        title,
        content,
        mediaUrls: mediaUrls ? JSON.stringify(mediaUrls) : null,
        wordpressRef: wordpressRef ?? null,
        productMeta: productMeta ? JSON.stringify(productMeta) : null,
        scheduledAt: scheduledDate,
        status: 'scheduled',
        targets: {
          create: platformIds.map((accountId) => ({
            accountId,
            status: 'pending',
            appendixId: appendixMap?.[accountId] ?? null,
          })),
        },
      },
      include: {
        targets: { include: { account: { select: { id: true, platform: true, name: true } } } },
      },
    })

    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    console.error('[api/posts POST]', error)
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
  }
}
