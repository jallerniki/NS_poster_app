import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Platform } from '@/lib/social'

function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

// ISO week: Monday-Sunday, computed in UTC
function startOfISOWeekUTC(d: Date): Date {
  const day = d.getUTCDay() // 0=Sun, 1=Mon...
  const diff = (day === 0 ? 6 : day - 1) // days since Monday
  const start = startOfUTCDay(d)
  start.setUTCDate(start.getUTCDate() - diff)
  return start
}

interface PlatformStat {
  total: number
  published: number
  scheduled: number
}

export async function GET() {
  try {
    const now = new Date()
    const todayStart = startOfUTCDay(now)
    const todayEnd = new Date(todayStart)
    todayEnd.setUTCDate(todayStart.getUTCDate() + 1)

    const weekStart = startOfISOWeekUTC(now)
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekStart.getUTCDate() + 7)

    const [
      totalPosts,
      scheduledCount,
      publishedCount,
      failedCount,
      partialCount,
      todayScheduled,
      todayPublished,
      weekScheduled,
      weekPublished,
      nextPost,
      allPostsWithTargets,
    ] = await Promise.all([
      db.scheduledPost.count(),
      db.scheduledPost.count({ where: { status: 'scheduled' } }),
      db.scheduledPost.count({ where: { status: 'published' } }),
      db.scheduledPost.count({ where: { status: 'failed' } }),
      db.scheduledPost.count({ where: { status: 'partial' } }),
      db.scheduledPost.count({
        where: { scheduledAt: { gte: todayStart, lt: todayEnd }, status: 'scheduled' },
      }),
      db.scheduledPost.count({
        where: { scheduledAt: { gte: todayStart, lt: todayEnd }, status: 'published' },
      }),
      db.scheduledPost.count({
        where: { scheduledAt: { gte: weekStart, lt: weekEnd }, status: 'scheduled' },
      }),
      db.scheduledPost.count({
        where: { scheduledAt: { gte: weekStart, lt: weekEnd }, status: 'published' },
      }),
      db.scheduledPost.findFirst({
        where: { status: 'scheduled', scheduledAt: { gte: now } },
        orderBy: { scheduledAt: 'asc' },
        include: {
          targets: {
            include: { account: { select: { platform: true } } },
          },
        },
      }),
      db.scheduledPost.findMany({
        select: {
          status: true,
          targets: { select: { status: true, account: { select: { platform: true } } } },
        },
      }),
    ])

    const byPlatform: Record<Platform, PlatformStat> = {
      telegram: { total: 0, published: 0, scheduled: 0 },
      max: { total: 0, published: 0, scheduled: 0 },
      vk: { total: 0, published: 0, scheduled: 0 },
    }

    for (const post of allPostsWithTargets) {
      for (const t of post.targets) {
        const p = t.account.platform as Platform
        if (p !== 'telegram' && p !== 'max' && p !== 'vk') continue
        byPlatform[p].total += 1
        if (t.status === 'published') byPlatform[p].published += 1
        else if (t.status === 'pending' || t.status === 'publishing')
          byPlatform[p].scheduled += 1
      }
    }

    let nextPostSummary: {
      id: string
      title: string
      scheduledAt: string
      platforms: string[]
    } | null = null
    if (nextPost) {
      const platforms = Array.from(
        new Set(nextPost.targets.map((t) => t.account.platform))
      )
      nextPostSummary = {
        id: nextPost.id,
        title: nextPost.title,
        scheduledAt: nextPost.scheduledAt.toISOString(),
        platforms,
      }
    }

    return NextResponse.json({
      totalPosts,
      scheduled: scheduledCount,
      published: publishedCount,
      failed: failedCount,
      partial: partialCount,
      today: { scheduled: todayScheduled, published: todayPublished },
      thisWeek: { scheduled: weekScheduled, published: weekPublished },
      nextPost: nextPostSummary,
      byPlatform,
    })
  } catch (error) {
    console.error('[api/stats GET]', error)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
