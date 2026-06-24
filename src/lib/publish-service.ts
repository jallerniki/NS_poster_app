/**
 * Publish orchestration — DB-aware layer on top of src/lib/publisher.ts.
 *
 * Design goals (per requirements):
 *   - Per-platform independence: each ScheduledPostTarget is published on its own.
 *   - No re-send to already-published platforms: the worker only ever touches
 *     targets whose status is 'pending' or 'failed'. A platform that already
 *     received the post ('published') is never touched again.
 *   - Retry until all platforms succeed: failed targets are retried on every
 *     tick; the post reaches 'published' ONLY when ALL its targets are published.
 *
 * Two entry points:
 *   - processDuePosts()  → automated worker (cron / in-process scheduler)
 *   - publishPostNow()   → manual "publish now" (UI button), ignores schedule
 */

import { db } from '@/lib/db'
import { safeParse, composePostText } from '@/lib/social'
import {
  publishToPlatform,
  type ButtonPresetData,
  type PlatformAccountLite,
} from '@/lib/publisher'

const STALE_PUBLISHING_MS = 5 * 60 * 1000 // stuck 'publishing' targets → reset to failed
const MAX_POSTS_PER_TICK = 50

export type TargetResult = {
  targetId: string
  accountName: string
  platform: string
  ok: boolean
  message?: string
}

export type WorkerSummary = {
  ran: boolean
  processedPosts: number
  attemptedTargets: number
  results: TargetResult[]
}

/** Module-level re-entrancy lock so overlapping ticks don't double-publish. */
let workerRunning = false

/**
 * Automated worker: publish all due posts.
 * Called by /api/cron/process and by the in-process scheduler (instrumentation).
 * Safe to call frequently — returns immediately if a previous tick is running.
 */
export async function processDuePosts(): Promise<WorkerSummary> {
  if (workerRunning) {
    return { ran: false, processedPosts: 0, attemptedTargets: 0, results: [] }
  }
  workerRunning = true
  try {
    // 1. Recover targets stuck in 'publishing' (crashed mid-send).
    await recoverStaleTargets()

    const now = new Date()

    // 2. Due posts that still have pending/failed targets (not canceled/draft/done).
    const posts = await db.scheduledPost.findMany({
      where: {
        scheduledAt: { lte: now },
        status: { notIn: ['canceled', 'draft', 'published'] },
        targets: {
          some: { status: { in: ['pending', 'failed'] } },
        },
      },
      take: MAX_POSTS_PER_TICK,
      orderBy: { scheduledAt: 'asc' },
      include: { targets: { include: { account: true } } },
    })

    const allResults: TargetResult[] = []
    let attempted = 0

    for (const post of posts) {
      // Only targets that haven't been published yet + active account.
      const todo = post.targets.filter(
        (t) =>
          (t.status === 'pending' || t.status === 'failed') &&
          t.account &&
          t.account.active,
      )
      if (todo.length === 0) {
        await recomputePostStatus(post.id)
        continue
      }

      await db.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'publishing' },
      })

      for (const target of todo) {
        // Claim the target before sending (soft cross-instance lock).
        await db.scheduledPostTarget.update({
          where: { id: target.id },
          data: { status: 'publishing' },
        })
        const result = await attemptTarget(post, target)
        attempted++
        allResults.push(result)
      }

      await recomputePostStatus(post.id)
    }

    return {
      ran: true,
      processedPosts: posts.length,
      attemptedTargets: attempted,
      results: allResults,
    }
  } finally {
    workerRunning = false
  }
}

/**
 * Publish a single post NOW (manual trigger), ignoring scheduledAt.
 * If targetId is omitted → publish ALL targets (published ones are skipped).
 * Returns per-target results and updates the aggregate status.
 */
export async function publishPostNow(
  postId: string,
  targetId?: string,
): Promise<{ ok: boolean; error?: string; results: TargetResult[] }> {
  const post = await db.scheduledPost.findUnique({
    where: { id: postId },
    include: {
      targets: {
        include: { account: true },
        where: targetId ? { id: targetId } : undefined,
      },
    },
  })

  if (!post) {
    return { ok: false, error: 'Пост не найден', results: [] }
  }
  if (post.targets.length === 0) {
    return { ok: false, error: 'У поста нет целей для публикации', results: [] }
  }

  await db.scheduledPost.update({
    where: { id: postId },
    data: { status: 'publishing' },
  })

  const results: TargetResult[] = []
  for (const target of post.targets) {
    const account = target.account
    if (!account || !account.active) {
      await db.scheduledPostTarget.update({
        where: { id: target.id },
        data: { status: 'failed', errorMessage: 'Площадка неактивна' },
      })
      results.push({
        targetId: target.id,
        accountName: account?.name ?? '—',
        platform: account?.platform ?? '?',
        ok: false,
        message: 'Площадка неактивна',
      })
      continue
    }
    await db.scheduledPostTarget.update({
      where: { id: target.id },
      data: { status: 'publishing' },
    })
    results.push(await attemptTarget(post, target))
  }

  await recomputePostStatus(postId)
  return { ok: true, results }
}

/**
 * Reset failed targets of a post back to 'pending' so the next worker tick
 * retries them (without re-sending to already-published platforms).
 * Returns the number of targets reset.
 */
export async function retryFailedTargets(postId: string): Promise<number> {
  const res = await db.scheduledPostTarget.updateMany({
    where: { postId, status: 'failed' },
    data: { status: 'pending', errorMessage: null },
  })
  if (res.count > 0) {
    await recomputePostStatus(postId)
  }
  return res.count
}

/** Publish one target. Updates its DB status. Always resolves (never throws). */
async function attemptTarget(
  post: {
    id: string
    content: string
    mediaUrls: string | null
    productMeta: string | null
  },
  target: {
    id: string
    appendixId: string | null
    account: PlatformAccountLite & { active: boolean }
  },
): Promise<TargetResult> {
  const account = target.account
  try {
    let text = post.content
    if (target.appendixId) {
      const appendix = await db.appendixTemplate.findUnique({
        where: { id: target.appendixId },
      })
      if (appendix) {
        text = composePostText(post.content, appendix.body, appendix.position as 'prepend' | 'append')
      }
    }

    const photos = safeParse<string[]>(post.mediaUrls, [])
    const productMeta = safeParse<Record<string, unknown>>(post.productMeta, {})

    const buttonPreset = await resolveButtonPreset(account.platform, productMeta)

    const result = await publishToPlatform(account, text, photos, productMeta, buttonPreset)

    await db.scheduledPostTarget.update({
      where: { id: target.id },
      data: {
        status: 'published',
        resultRef: result.messageId || null,
        publishedAt: new Date(),
        errorMessage: null,
      },
    })

    return {
      targetId: target.id,
      accountName: account.name,
      platform: account.platform,
      ok: true,
      message: result.messageId ? `Отправлено (ID: ${result.messageId})` : 'Отправлено',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.scheduledPostTarget.update({
      where: { id: target.id },
      data: { status: 'failed', errorMessage: msg },
    })
    return {
      targetId: target.id,
      accountName: account.name,
      platform: account.platform,
      ok: false,
      message: msg,
    }
  }
}

/** Resolve a ButtonPreset for a platform if product buttons are enabled. */
async function resolveButtonPreset(
  platform: string,
  productMeta: Record<string, unknown>,
): Promise<ButtonPresetData | null> {
  const attachButtons = productMeta.attachButtons !== false
  if (!attachButtons || (platform !== 'telegram' && platform !== 'max')) return null
  const preset = await db.buttonPreset.findFirst({
    where: { platform, active: true },
  })
  if (!preset) return null
  return {
    productLabel: preset.productLabel,
    productUrl: preset.productUrl,
    categoryLabel: preset.categoryLabel,
    categoryUrl: preset.categoryUrl,
  }
}

/**
 * Recompute a post's aggregate status from its targets:
 *   all published      → 'published'
 *   some published     → 'partial'
 *   all failed/canceled → 'failed'
 *   otherwise           → 'publishing'
 */
export async function recomputePostStatus(postId: string): Promise<void> {
  const targets = await db.scheduledPostTarget.findMany({
    where: { postId },
    select: { status: true },
  })
  if (targets.length === 0) return

  let published = 0
  let failed = 0
  let canceled = 0
  for (const t of targets) {
    if (t.status === 'published') published++
    else if (t.status === 'failed') failed++
    else if (t.status === 'canceled') canceled++
  }
  const total = targets.length

  let status: string
  if (published === total) status = 'published'
  else if (published > 0) status = 'partial'
  else if (failed + canceled === total) status = 'failed'
  else status = 'publishing'

  await db.scheduledPost.update({ where: { id: postId }, data: { status } })
}

/** Reset targets stuck in 'publishing' for too long so they retry next tick. */
async function recoverStaleTargets(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PUBLISHING_MS)
  await db.scheduledPostTarget.updateMany({
    where: { status: 'publishing', updatedAt: { lt: cutoff } },
    data: { status: 'failed', errorMessage: 'Превышено время публикации (зависший статус)' },
  })
}
