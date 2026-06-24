/**
 * In-process posting scheduler.
 *
 * Started once on server boot via src/instrumentation.ts (Node runtime only).
 * Calls processDuePosts() every WORKER_INTERVAL_MS (default 60s).
 *
 * The timer is unref'd so it never keeps the process alive on its own (safe
 * during build). In the standalone server the HTTP listener keeps the process
 * alive, so the scheduler keeps firing.
 *
 * Optional: disable entirely with WORKER_DISABLED=1 if you prefer an external
 * cron hitting /api/cron/process instead.
 */

import { processDuePosts } from '@/lib/publish-service'

let started = false

export function startScheduler(): void {
  if (started) return
  if (process.env.WORKER_DISABLED === '1') {
    console.log('[scheduler] disabled via WORKER_DISABLED=1 (use external cron on /api/cron/process)')
    started = true
    return
  }
  started = true

  const intervalMs = Number(process.env.WORKER_INTERVAL_MS) || 60_000

  const tick = async () => {
    try {
      const summary = await processDuePosts()
      if (summary.ran && (summary.processedPosts > 0 || summary.attemptedTargets > 0)) {
        console.log(
          `[scheduler] tick: posts=${summary.processedPosts} targets=${summary.attemptedTargets}`,
        )
      }
    } catch (e) {
      console.error('[scheduler] error:', e instanceof Error ? e.message : String(e))
    }
  }

  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  // First tick shortly after boot so due posts don't wait a full interval.
  const boot = setTimeout(tick, 10_000)
  boot.unref?.()

  console.log(`[scheduler] in-process posting scheduler started (every ${Math.round(intervalMs / 1000)}s)`)
}
