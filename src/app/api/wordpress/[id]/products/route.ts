import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

interface WpProduct {
  id: number
  slug: string
  title: string
  link: string
  excerpt: string
  featuredImage?: string
  meta: Record<string, string>
}

function stripHtml(input: string | undefined | null): string {
  if (!input) return ''
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const source = await db.wordPressSource.findUnique({ where: { id } })
    if (!source) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const postType = source.postType || 'product'
    const baseUrl = source.siteUrl.replace(/\/+$/, '')
    const endpoint = `${baseUrl}/wp-json/wp/v2/${postType}?per_page=20&_embed`

    const auth = Buffer.from(`${source.username}:${source.appPassword}`).toString('base64')

    try {
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
        },
        // Don't cache — keep fresh
        cache: 'no-store',
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return NextResponse.json({
          products: [],
          error: `WordPress responded ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`,
        })
      }

      const data = (await res.json()) as Array<Record<string, unknown>>
      const products: WpProduct[] = data.map((item) => {
        const titleObj = item.title as { rendered?: string } | undefined
        const excerptObj = item.excerpt as { rendered?: string } | undefined
        const embedded = item._embedded as
          | { 'wp:featuredmedia'?: Array<{ source_url?: string }> }
          | undefined
        const featuredMedia =
          embedded?.['wp:featuredmedia']?.[0]?.source_url

        const meta = (item.meta as Record<string, unknown> | undefined) ?? {}
        const metaStrings: Record<string, string> = {}
        for (const [k, v] of Object.entries(meta)) {
          if (v === null || v === undefined) metaStrings[k] = ''
          else if (typeof v === 'object') metaStrings[k] = JSON.stringify(v)
          else metaStrings[k] = String(v)
        }

        return {
          id: Number(item.id),
          slug: String(item.slug ?? ''),
          title: stripHtml(titleObj?.rendered),
          link: String(item.link ?? ''),
          excerpt: stripHtml(excerptObj?.rendered),
          featuredImage: featuredMedia,
          meta: metaStrings,
        }
      })

      // Update lastSyncAt
      await db.wordPressSource.update({
        where: { id },
        data: { lastSyncAt: new Date() },
      })

      return NextResponse.json({ products })
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : String(fetchError)
      return NextResponse.json({
        products: [],
        error: `Failed to fetch from WordPress: ${msg}`,
      })
    }
  } catch (error) {
    console.error('[api/wordpress/[id]/products GET]', error)
    return NextResponse.json({
      products: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
