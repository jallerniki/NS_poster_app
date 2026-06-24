import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Platform } from '@/lib/social'

interface DayBucket {
  date: string
  total: number
  byPlatform: Record<Platform, number>
  published: number
  scheduled: number
  failed: number
  posts: Array<{
    id: string
    title: string
    scheduledAt: string
    status: string
    platforms: string[]
  }>
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')

    if (!yearParam || !monthParam) {
      return NextResponse.json(
        { error: 'year and month query params are required' },
        { status: 400 }
      )
    }

    const year = parseInt(yearParam, 10)
    const month = parseInt(monthParam, 10) // 1-12

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 })
    }

    // UTC month range
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))

    const posts = await db.scheduledPost.findMany({
      where: {
        scheduledAt: {
          gte: start,
          lt: end,
        },
      },
      include: {
        targets: {
          include: {
            account: { select: { platform: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    })

    const buckets = new Map<string, DayBucket>()

    for (const post of posts) {
      const key = dateKey(post.scheduledAt)
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = {
          date: key,
          total: 0,
          byPlatform: { telegram: 0, max: 0, vk: 0 },
          published: 0,
          scheduled: 0,
          failed: 0,
          posts: [],
        }
        buckets.set(key, bucket)
      }

      const platformsSet = new Set<string>()
      let anyPublished = false
      let anyFailed = false
      let anyPending = false
      for (const t of post.targets) {
        const p = t.account.platform as Platform
        if (p === 'telegram' || p === 'max' || p === 'vk') {
          bucket.byPlatform[p] += 1
          platformsSet.add(p)
        }
        if (t.status === 'published') anyPublished = true
        else if (t.status === 'failed') anyFailed = true
        else if (t.status === 'pending' || t.status === 'publishing') anyPending = true
      }

      bucket.total += 1
      // Post-level status: published if all published, etc. We rely on post.status
      if (post.status === 'published') bucket.published += 1
      if (post.status === 'scheduled' || post.status === 'publishing' || post.status === 'draft')
        bucket.scheduled += 1
      if (post.status === 'failed') bucket.failed += 1
      // partial counts as neither pure published nor failed
      void anyPublished
      void anyFailed
      void anyPending

      bucket.posts.push({
        id: post.id,
        title: post.title,
        scheduledAt: post.scheduledAt.toISOString(),
        status: post.status,
        platforms: Array.from(platformsSet),
      })
    }

    // Sort by date ascending
    const result = Array.from(buckets.values()).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/calendar GET]', error)
    return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500 })
  }
}
