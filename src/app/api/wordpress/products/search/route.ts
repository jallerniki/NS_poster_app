import { NextRequest, NextResponse } from 'next/server'

/**
 * Search WooCommerce products on a WordPress site.
 *
 * Body: { token?: string, siteUrl?: string, query: string, perPage?: number }
 *
 * Strategy (all public endpoints — no auth required for reading published
 * products, which makes the picker work even before login):
 *
 *   1. If `query` is empty → GET /wc/store/v1/products?per_page=N&orderby=date&order=desc
 *      (WooCommerce Store API — public, returns prices + images + description).
 *   2. If `query` is provided → first GET /wp/v2/product?search=<query>&per_page=N
 *      (WP REST — public, supports search by title/content/slug) to find IDs,
 *      then GET /wc/store/v1/products/<id> for each to enrich with prices+images.
 *
 * The `token` is accepted for forward-compat (e.g. when we need edit-context
 * meta later) but not required.
 */

export interface WpProduct {
  id: number
  slug: string
  /** Product title (HTML stripped). In this WP setup the title also holds the артикул. */
  title: string
  /** Product description (HTML stripped, trimmed). */
  description: string
  /** Short description (HTML stripped). */
  excerpt: string
  /** Frontend product URL. */
  link: string
  /** Same as link. */
  permalink: string
  /** Featured image source URL or null. */
  featuredImageUrl: string | null
  /** First 3 gallery image URLs. */
  galleryUrls: string[]
  /** Brand term names (from wp/v2 product_brand — empty if not loaded). */
  brands: string[]
  /** Category term names. */
  categories: string[]
  /** Tag term names. */
  tags: string[]
  /** Raw meta (usually empty in public context; populated with prices-derived
   * fields for convenience so templates can use {{meta.KEY}} too). */
  meta: Record<string, string | string[]>
  // ── Convenience derived fields (so templates can use {{sku}} {{price}} etc.) ──
  sku: string
  price: string | string[] | undefined
  regularPrice: string | string[] | undefined
  salePrice: string | string[] | undefined
  stockStatus: string | string[] | undefined
}

interface SearchBody {
  token?: string
  siteUrl?: string
  query?: string
  perPage?: number
}

interface WcStoreProduct {
  id: number
  name?: string
  slug?: string
  sku?: string
  permalink?: string
  description?: string
  short_description?: string
  prices?: {
    price?: string
    regular_price?: string
    sale_price?: string
    currency_suffix?: string
  }
  images?: Array<{ src?: string; thumbnail?: string; alt?: string }>
  categories?: Array<{ id?: number; name?: string; slug?: string }>
  tags?: Array<{ id?: number; name?: string; slug?: string }>
  stock_status?: string
  is_in_stock?: boolean
}

/** WooCommerce REST API v3 product (needs JWT auth, returns meta_data with ACF fields). */
interface WcV3Product {
  id: number
  name?: string
  slug?: string
  sku?: string
  permalink?: string
  description?: string
  short_description?: string
  price?: string
  regular_price?: string
  sale_price?: string
  images?: Array<{ id?: number; src?: string; name?: string; alt?: string }>
  categories?: Array<{ id?: number; name?: string; slug?: string }>
  tags?: Array<{ id?: number; name?: string; slug?: string }>
  stock_status?: string
  meta_data?: Array<{ id?: number; key: string; value: unknown }>
}

interface WpRestProduct {
  id?: number
  slug?: string
  link?: string
  title?: { rendered?: string }
  content?: { rendered?: string }
  excerpt?: { rendered?: string }
  featured_media?: number
  meta?: Record<string, unknown>
  // Embedded terms for brand/category/tag
  _embedded?: {
    'wp:term'?: Array<Array<{ taxonomy?: string; name?: string }>>
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SearchBody | null

  const query = typeof body?.query === 'string' ? body.query.trim() : ''
  const token = typeof body?.token === 'string' && body.token ? body.token : ''

  const rawSite =
    typeof body?.siteUrl === 'string' ? body.siteUrl.trim() : ''
  const siteUrl = (rawSite || 'https://nstkani.ru').replace(/\/+$/, '')
  const perPage =
    typeof body?.perPage === 'number' && body.perPage > 0 && body.perPage <= 100
      ? Math.floor(body.perPage)
      : 20

  try {
    let products: WpProduct[]

    if (token) {
      // With JWT → use WooCommerce REST API v3 (returns meta_data with ACF fields!)
      if (!query) {
        // List latest products
        const list = await fetchWcV3<WcV3Product[]>(
          `${siteUrl}/wp-json/wc/v3/products?per_page=${perPage}&orderby=date&order=desc&status=publish`,
          token,
        )
        products = (list ?? []).map((p) => fromWcV3(p))
      } else {
        // Search by sku/name
        const list = await fetchWcV3<WcV3Product[]>(
          `${siteUrl}/wp-json/wc/v3/products?per_page=${perPage}&search=${encodeURIComponent(query)}&status=publish`,
          token,
        )
        // Also try sku search (WC v3 search doesn't always match sku)
        let allResults = list ?? []
        if (allResults.length < 3) {
          const skuList = await fetchWcV3<WcV3Product[]>(
            `${siteUrl}/wp-json/wc/v3/products?per_page=${perPage}&sku=${encodeURIComponent(query)}&status=publish`,
            token,
          ).catch(() => null)
          if (skuList) {
            const existingIds = new Set(allResults.map((p) => p.id))
            allResults = [...allResults, ...skuList.filter((p) => !existingIds.has(p.id))]
          }
        }
        products = allResults.map((p) => fromWcV3(p))
      }
    } else {
      // No JWT → fall back to public Store API (no meta_data, but prices/images work)
      if (!query) {
        const list = await fetchWcStore<WcStoreProduct[]>(
          `${siteUrl}/wp-json/wc/store/v1/products?per_page=${perPage}&orderby=date&order=desc`,
        )
        products = (list ?? []).map((p) => fromWcStore(p))
      } else {
        // Search via WP REST (public), then enrich via Store API
        const searchUrl = `${siteUrl}/wp-json/wp/v2/product?search=${encodeURIComponent(query)}&per_page=${perPage}&_fields=id,slug,title,link`
        const found = await fetchWpJson<WpRestProduct[]>(searchUrl)
        if (!Array.isArray(found) || found.length === 0) {
          return NextResponse.json({ ok: true, products: [] })
        }
        const enriched = await Promise.all(
          found.slice(0, perPage).map(async (f) => {
            try {
              const storeP = await fetchWcStore<WcStoreProduct>(
                `${siteUrl}/wp-json/wc/store/v1/products/${f.id}`,
              )
              return storeP ? fromWcStore(storeP, f) : null
            } catch {
              return null
            }
          }),
        )
        products = enriched.filter((p): p is WpProduct => p !== null)
      }
    }

    return NextResponse.json({ ok: true, products })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: `Не удалось связаться с WordPress: ${msg}` },
      { status: 200 },
    )
  }
}

/**
 * Fetch meta (custom fields) for each product via /wp/v2/product/<id>?context=edit
 * and merge it into the product.meta object. Runs in parallel, fails silently
 * per-product (permissions may block some).
 */
async function enrichWithMeta(
  siteUrl: string,
  token: string,
  products: WpProduct[],
): Promise<void> {
  await Promise.all(
    products.map(async (p) => {
      try {
        const wp = await fetchWpJson<WpRestProduct>(
          `${siteUrl}/wp-json/wp/v2/product/${p.id}?context=edit`,
          token,
        )
        if (wp?.meta) {
          const metaMap = normalizeMeta(wp.meta)
          // Merge — don't overwrite existing price fields
          for (const [k, v] of Object.entries(metaMap)) {
            if (!(k in p.meta)) p.meta[k] = v
          }
          // Update description from описание_ custom field if present
          const customDesc = typeof metaMap['описание_'] === 'string' ? metaMap['описание_'] : ''
          if (customDesc) {
            p.description = stripHtml(customDesc)
          }
          // Update brand from линия_ custom field if present (fallback to product_brand terms)
          const customLine = typeof metaMap['линия_'] === 'string' ? metaMap['линия_'] : ''
          if (customLine && p.brands.length === 0) {
            p.brands = [customLine]
          }
          // Re-derive brand from product_brand terms if embedded
          if (wp._embedded?.['wp:term']) {
            const terms = wp._embedded['wp:term'].flat()
            const brands = terms
              .filter((t) => t.taxonomy === 'product_brand' && t.name)
              .map((t) => t.name as string)
            if (brands.length > 0) p.brands = brands
          }
        }
      } catch {
        // silent — some products may not be editable
      }
    }),
  )
}

// ── fetch helpers ────────────────────────────────────────────────────────────

async function fetchWpJson<T>(url: string, token?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`WordPress ответил ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

async function fetchWcStore<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`WooCommerce ответил ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

/** Fetch from WooCommerce REST API v3 with JWT auth — returns meta_data with ACF fields. */
async function fetchWcV3<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(
      `WC v3: ${err?.message ?? `HTTP ${res.status}`}`,
    )
  }
  return (await res.json()) as T
}

// ── mappers ──────────────────────────────────────────────────────────────────

/** Map WooCommerce REST API v3 product → WpProduct (includes meta_data with ACF fields!). */
function fromWcV3(p: WcV3Product): WpProduct {
  const images = Array.isArray(p.images) ? p.images : []
  const featuredImageUrl = images[0]?.src ?? null
  const galleryUrls = images
    .slice(1)
    .map((i) => i.src)
    .filter((u): u is string => typeof u === 'string' && u.length > 0)

  const link = p.permalink || ''
  const slug = p.slug || ''

  // Convert meta_data array [{key, value}] → Record<string, string|string[]>
  const meta: Record<string, string | string[]> = {}
  if (Array.isArray(p.meta_data)) {
    for (const m of p.meta_data) {
      if (!m.key) continue
      // Skip internal WC fields starting with _
      if (m.key.startsWith('_') && !['_sku', '_price', '_regular_price', '_sale_price', '_stock_status'].includes(m.key)) {
        // Still include ACF boolean fields like _onlyblack, _продано etc
        if (m.value === true || m.value === false || m.value === '1' || m.value === '0' || m.value === '') {
          meta[m.key] = m.value === true || m.value === '1' ? 'да' : ''
        } else if (m.value != null && String(m.value).trim()) {
          meta[m.key] = String(m.value)
        }
        continue
      }
      if (m.value === null || m.value === undefined || m.value === false) {
        meta[m.key] = ''
      } else if (Array.isArray(m.value)) {
        meta[m.key] = m.value.map((x) => String(x ?? ''))
      } else if (typeof m.value === 'object') {
        meta[m.key] = JSON.stringify(m.value)
      } else {
        meta[m.key] = String(m.value)
      }
    }
  }
  console.log(`[wp-search] product ${p.id} meta_data keys:`, Object.keys(meta))

  const price = p.price || undefined
  const regularPrice = p.regular_price || undefined
  const salePrice = p.sale_price || undefined

  // Prefer описание_ custom field for description
  const customDesc = typeof meta['описание_'] === 'string' ? meta['описание_'] : ''
  const description = stripHtml(
    customDesc || p.description || '',
  )

  // Brand from линия_ or categories
  let brands: string[] = []
  const customLine = typeof meta['линия_'] === 'string' ? meta['линия_'] : ''
  if (customLine) brands = [customLine]

  const categories = (p.categories ?? [])
    .map((c) => c.name)
    .filter((n): n is string => typeof n === 'string')
  const categorySlugs = (p.categories ?? [])
    .map((c) => c.slug)
    .filter((n): n is string => typeof n === 'string')

  return {
    id: Number(p.id ?? 0),
    slug,
    title: stripHtml(p.name || ''),
    description,
    excerpt: stripHtml(p.short_description || ''),
    link,
    permalink: link,
    featuredImageUrl,
    galleryUrls,
    brands,
    categories,
    tags: (p.tags ?? []).map((t) => t.name).filter((n): n is string => typeof n === 'string'),
    meta,
    sku: p.sku || slug,
    price,
    regularPrice,
    salePrice,
    stockStatus: p.stock_status || 'instock',
  }
}

function fromWcStore(p: WcStoreProduct, wp?: WpRestProduct): WpProduct {
  const prices = p.prices ?? {}
  const images = Array.isArray(p.images) ? p.images : []
  const featuredImageUrl = images[0]?.src ?? null
  const galleryUrls = images
    .slice(1)
    .map((i) => i.src)
    .filter((u): u is string => typeof u === 'string' && u.length > 0)

  const link = p.permalink || wp?.link || ''
  const slug = p.slug || wp?.slug || ''

  // Convenience: expose prices also via `meta` so templates using {{meta.X}} still work.
  const meta: Record<string, string | string[]> = {
    price: prices.price ?? '',
    regular_price: prices.regular_price ?? '',
    sale_price: prices.sale_price ?? '',
    currency: prices.currency_suffix ?? '',
  }

  // Merge custom fields from WP context=edit response (состав_, ширина_, etc.)
  if (wp?.meta) {
    const wpMeta = normalizeMeta(wp.meta)
    for (const [k, v] of Object.entries(wpMeta)) {
      if (!(k in meta)) meta[k] = v
    }
  }

  // Brand from embedded terms (product_brand taxonomy)
  let brands: string[] = []
  if (wp?._embedded?.['wp:term']) {
    const terms = wp._embedded['wp:term'].flat()
    brands = terms
      .filter((t) => t.taxonomy === 'product_brand' && t.name)
      .map((t) => t.name as string)
  }

  const price = prices.price || undefined
  const regularPrice = prices.regular_price || undefined
  const salePrice = prices.sale_price || undefined

  // Prefer the `описание_` custom field for description if present, else use WC description.
  const customDescription = typeof meta['описание_'] === 'string' ? meta['описание_'] : ''
  const description = stripHtml(
    customDescription || p.description || wp?.content?.rendered || '',
  )

  return {
    id: Number(p.id ?? 0),
    slug,
    title: stripHtml(p.name || wp?.title?.rendered || ''),
    description,
    excerpt: stripHtml(p.short_description || wp?.excerpt?.rendered || ''),
    link,
    permalink: link,
    featuredImageUrl,
    galleryUrls,
    brands,
    categories: (p.categories ?? [])
      .map((c) => c.name)
      .filter((n): n is string => typeof n === 'string'),
    tags: (p.tags ?? [])
      .map((t) => t.name)
      .filter((n): n is string => typeof n === 'string'),
    meta,
    sku: p.sku || slug,
    price,
    regularPrice,
    salePrice,
    stockStatus: p.stock_status || (p.is_in_stock ? 'instock' : 'outofstock'),
  }
}

function normalizeMeta(
  meta: Record<string, unknown> | undefined,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  if (!meta) return out
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined || v === false) {
      out[k] = ''
    } else if (Array.isArray(v)) {
      out[k] = v.map((x) => (x === null || x === undefined ? '' : String(x)))
    } else if (typeof v === 'object') {
      out[k] = JSON.stringify(v)
    } else {
      out[k] = String(v)
    }
  }
  return out
}

function stripHtml(input: string | undefined | null): string {
  if (!input) return ''
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}
