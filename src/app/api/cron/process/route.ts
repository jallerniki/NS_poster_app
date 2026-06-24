import { NextRequest, NextResponse } from 'next/server'
import { processDuePosts } from '@/lib/publish-service'

/**
 * Automated posting worker.
 *
 *   GET/POST /api/cron/process?token=<CRON_SECRET>
 *
 * Picks up every post whose scheduledAt has passed and that still has
 * 'pending' or 'failed' targets, then publishes each such target to its
 * platform independently. Already-published platforms are never re-sent;
 * failed ones are retried on every call until the post is fully published.
 *
 * Trigger options:
 *   - External cron / systemd timer hitting this endpoint every minute.
 *   - In-process scheduler (src/instrumentation.ts) — runs automatically,
 *     so this endpoint is optional.
 *
 * Auth: if CRON_SECRET env is set, the request must include a matching
 * `?token=` (or `Authorization: Bearer <secret>`). If unset (dev), allowed.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // dev convenience; set CRON_SECRET in production
  const qp = request.nextUrl.searchParams.get('token')
  if (qp && qp === secret) return true
  const auth = request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (auth && auth.replace(/^Bearer\s+/i, '') === secret) return true
  return false
}

async function run() {
  const startedAt = Date.now()
  try {
    const summary = await processDuePosts()
    return NextResponse.json({
      ok: true,
      ran: summary.ran,
      processedPosts: summary.processedPosts,
      attemptedTargets: summary.attemptedTargets,
      results: summary.results,
      durationMs: Date.now() - startedAt,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron/process]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  return run()
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  return run()
}
