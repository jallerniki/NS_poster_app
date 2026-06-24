import { NextRequest, NextResponse } from 'next/server'
import { publishPostNow } from '@/lib/publish-service'

/**
 * Publish a scheduled post IMMEDIATELY to one or all of its targets.
 *
 * POST /api/posts/[id]/publish
 * Body: { targetId?: string }   // omit to publish to ALL targets
 *
 * Already-published targets are skipped (no duplicate send). The per-target
 * outcome and the recomputed post status are persisted by publish-service.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = (await request.json().catch(() => null)) as {
    targetId?: string
  } | null

  const result = await publishPostNow(id, body?.targetId)

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'Не удалось опубликовать' },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true, results: result.results })
}
