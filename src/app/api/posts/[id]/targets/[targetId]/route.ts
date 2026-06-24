import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string; targetId: string }> }

interface PatchTargetBody {
  status?: string
  appendixId?: string | null
  errorMessage?: string | null
  resultRef?: string | null
  publishedAt?: string | null
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id, targetId } = await params
    const body = (await request.json()) as PatchTargetBody
    const { status, appendixId, errorMessage, resultRef, publishedAt } = body ?? {}

    const existing = await db.scheduledPostTarget.findFirst({
      where: { id: targetId, postId: id },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (status !== undefined) data.status = status
    if (appendixId !== undefined) data.appendixId = appendixId
    if (errorMessage !== undefined) data.errorMessage = errorMessage
    if (resultRef !== undefined) data.resultRef = resultRef
    if (publishedAt !== undefined) {
      data.publishedAt = publishedAt ? new Date(publishedAt) : null
    }

    const updated = await db.scheduledPostTarget.update({
      where: { id: targetId },
      data,
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[api/posts/[id]/targets/[targetId] PATCH]', error)
    return NextResponse.json({ error: 'Failed to update target' }, { status: 500 })
  }
}
