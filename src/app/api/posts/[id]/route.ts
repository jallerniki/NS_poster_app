import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const post = await db.scheduledPost.findUnique({
      where: { id },
      include: {
        targets: {
          include: {
            account: { select: { id: true, platform: true, name: true, targetId: true } },
          },
        },
      },
    })
    if (!post) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(post)
  } catch (error) {
    console.error('[api/posts/[id] GET]', error)
    return NextResponse.json({ error: 'Failed to load post' }, { status: 500 })
  }
}

interface UpdatePostBody {
  title?: string
  content?: string
  mediaUrls?: string[]
  wordpressRef?: string | null
  productMeta?: Record<string, unknown> | null
  scheduledAt?: string
  status?: string
  platformIds?: string[]
  appendixMap?: Record<string, string>
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = (await request.json()) as UpdatePostBody
    const { title, content, mediaUrls, wordpressRef, productMeta, scheduledAt, status, platformIds, appendixMap } =
      body ?? {}

    const existing = await db.scheduledPost.findUnique({
      where: { id },
      include: { targets: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Sync targets if platformIds provided
    if (Array.isArray(platformIds)) {
      const wanted = new Set(platformIds)
      const current = existing.targets
      const toDelete = current.filter((t) => !wanted.has(t.accountId))
      const existingAccountIds = new Set(current.map((t) => t.accountId))
      const toAdd = platformIds.filter((pid) => !existingAccountIds.has(pid))

      if (toDelete.length > 0) {
        await db.scheduledPostTarget.deleteMany({
          where: { id: { in: toDelete.map((t) => t.id) } },
        })
      }
      if (toAdd.length > 0) {
        // Verify they exist
        const accounts = await db.platformAccount.findMany({
          where: { id: { in: toAdd } },
          select: { id: true },
        })
        if (accounts.length !== toAdd.length) {
          return NextResponse.json(
            { error: 'One or more platformIds not found' },
            { status: 400 }
          )
        }
        await db.scheduledPostTarget.createMany({
          data: toAdd.map((accountId) => ({
            postId: id,
            accountId,
            status: 'pending',
            appendixId: appendixMap?.[accountId] ?? null,
          })),
        })
      }

      // Update appendixId for existing targets that remain
      if (appendixMap) {
        const remaining = current.filter((t) => wanted.has(t.accountId))
        await Promise.all(
          remaining.map((t) =>
            db.scheduledPostTarget.update({
              where: { id: t.id },
              data: { appendixId: appendixMap[t.accountId] ?? t.appendixId },
            })
          )
        )
      }
    }

    const updated = await db.scheduledPost.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        content: content ?? existing.content,
        mediaUrls:
          mediaUrls === undefined
            ? existing.mediaUrls
            : Array.isArray(mediaUrls)
              ? JSON.stringify(mediaUrls)
              : null,
        wordpressRef: wordpressRef === undefined ? existing.wordpressRef : wordpressRef,
        productMeta: productMeta === undefined ? existing.productMeta : (productMeta ? JSON.stringify(productMeta) : null),
        scheduledAt: scheduledAt ? new Date(scheduledAt) : existing.scheduledAt,
        status: status ?? existing.status,
      },
      include: {
        targets: {
          include: { account: { select: { id: true, platform: true, name: true } } },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[api/posts/[id] PUT]', error)
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const existing = await db.scheduledPost.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await db.scheduledPost.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/posts/[id] DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
  }
}
