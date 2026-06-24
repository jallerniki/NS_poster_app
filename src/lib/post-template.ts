import type { WpProduct } from '@/app/api/wordpress/products/search/route'

/**
 * Apply a post template to a WordPress product, producing the final post text.
 *
 * Supported placeholders:
 *   {{title}}         — product title (usually артикул)
 *   {{description}}   — product content (HTML stripped, trimmed)
 *   {{excerpt}}       — short excerpt
 *   {{sku}}           — product SKU / slug
 *   {{brand}}         — first brand name (or empty)
 *   {{brands}}        — comma-joined brand names
 *   {{category}}      — first category
 *   {{categories}}    — comma-joined categories
 *   {{url}}           — product permalink
 *   {{price}}         — current/sale price
 *   {{regularPrice}}  — regular price
 *   {{salePrice}}     — sale price
 *   {{stockStatus}}   — instock/outofstock etc
 *   {{meta.KEY}}      — any meta field by key (e.g. {{meta.состав}}, {{meta.ширина}})
 *   {{metaLine KEY}}  — "KEY: VALUE" line, or empty string if missing (with newline collapsed)
 *   {{saleBlock}}     — " - скидка N%= SALEPRICE ₽/м" when on sale, empty otherwise
 *
 * Unknown placeholders are replaced with empty string.
 */
export function applyTemplate(template: string, product: WpProduct): string {
  const meta = product.meta ?? {}
  const brand = product.brands?.[0] ?? ''
  const categories = product.categories ?? []
  const tags = product.tags ?? []
  const regular = toStr(product.regularPrice)
  const sale = toStr(product.salePrice)
  const price = toStr(product.price) || regular || sale

  // Sale block: "- скидка N%= SALEPRICE ₽/м"
  let saleBlock = ''
  if (regular && sale && regular !== sale) {
    const reg = parseFloat(regular.replace(',', '.'))
    const sal = parseFloat(sale.replace(',', '.'))
    if (reg > sal && reg > 0) {
      const pct = Math.round(((reg - sal) / reg) * 100)
      saleBlock = ` - скидка${pct}%= ${sal} ₽/м`
    }
  }

  const metaLine = (key: string): string => {
    const v = lookupMeta(meta, key)
    if (!v) return ''
    // Try to humanize the key: "состав" → "Состав", "ширина" → "Ширина", "пр-во" → "Пр-во"
    const label = key.charAt(0).toUpperCase() + key.slice(1)
    return `${label}: ${v}`
  }

  // First pass: handle {{metaLine KEY}} and {{saleBlock}} (they may produce multi-line content)
  let out = template
  // {{metaLine ...}} — capture key (cyrillic/latin/space/dash)
  out = out.replace(/\{\{\s*metaLine\s+([^}]+?)\s*\}\}/g, (_m, key) =>
    metaLine(String(key).trim()),
  )
  out = out.replace(/\{\{\s*saleBlock\s*\}\}/g, saleBlock)

  // {{couponLine}} — "Купон: VALUE" if купон_ meta is present, empty otherwise
  const couponVal = lookupMeta(meta, 'купон') ?? ''
  const couponLine = couponVal ? `Купон: ${couponVal}` : ''
  out = out.replace(/\{\{\s*couponLine\s*\}\}/g, couponLine)

  // {{meta.KEY}}
  out = out.replace(/\{\{\s*meta\.([^}]+?)\s*\}\}/g, (_m, key) =>
    lookupMeta(meta, String(key).trim()) ?? '',
  )

  // {{KEY}} for any ACF meta key that exists in the product's meta.
  // This lets users write {{ширина_}}, {{состав_}}, {{страна_производства}}, etc.
  // directly in the template — matched against actual meta keys (with trailing _).
  // We do this AFTER all known placeholders so we don't clobber {{title}} etc.
  for (const [k, v] of Object.entries(meta)) {
    const val = toStr(v)
    if (!val) continue
    // Only replace if the key contains non-alphanumeric chars (like _ or cyrillic)
    // to avoid clobbering built-in placeholders like {{title}}.
    if (/[_а-яёА-ЯЁ]/.test(k)) {
      const re = new RegExp(`\\{\\{\\s*${escapeRegex(k)}\\s*\\}\\}`, 'g')
      out = out.replace(re, val)
    }
  }

  // Simple scalar placeholders
  const scalars: Record<string, string> = {
    title: product.title ?? '',
    description: product.description ?? '',
    excerpt: product.excerpt ?? '',
    sku: product.sku ?? '',
    brand,
    brands: (product.brands ?? []).join(', '),
    category: categories[0] ?? '',
    categories: categories.join(', '),
    tags: tags.join(', '),
    url: product.permalink || product.link || '',
    price,
    regularPrice: regular,
    salePrice: sale,
    stockStatus: toStr(product.stockStatus),
  }
  for (const [k, v] of Object.entries(scalars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), v ?? '')
  }

  // Remove any leftover unknown placeholders
  out = out.replace(/\{\{[^}]*\}\}/g, '')

  // Tidy up: collapse 3+ newlines → 2, strip trailing whitespace per line
  out = out
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return out
}

/** Escape special regex chars in a string for use in new RegExp(). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Coerce a meta value (string | string[]) to a single string. */
function toStr(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.filter(Boolean).join(', ')
  return String(v)
}

/** Case-insensitive meta lookup that also normalizes common key aliases. */
function lookupMeta(
  meta: Record<string, string | string[]>,
  key: string,
): string | null {
  if (!key) return null
  const norm = (s: string) => s.trim().toLowerCase().replace(/[_-]/g, '')
  const target = norm(key)
  // Direct + normalized match
  for (const [k, v] of Object.entries(meta)) {
    if (norm(k) === target) return toStr(v)
  }
  // Common aliases — map template keys to actual WP meta keys.
  // Normalization strips underscores and dashes, so `состав_` → `состав` matches.
  const aliases: Record<string, string[]> = {
    состав: ['sostav', 'composition', 'состав'],
    ширина: ['shirina', 'width', 'ширина'],
    'пр-во': ['страна_производства', 'странапроизводства', 'proizvodstvo', 'proizvoditel', 'country', 'страна', 'производитель'],
    страна: ['страна_производства', 'странапроизводства'],
    вес: ['ves', 'weight'],
    купон: ['купон', 'kupon', 'coupon'],
    линия: ['линия', 'line', 'brand'],
    описание: ['описание', 'description'],
  }
  const alts = aliases[key.toLowerCase()] ?? []
  for (const alt of alts) {
    const t = norm(alt)
    for (const [k, v] of Object.entries(meta)) {
      if (norm(k) === t) return toStr(v)
    }
  }
  return null
}

/** Build a default WordPress source ref string for a product (used as wordpressRef). */
export function wpRefForProduct(p: WpProduct): string {
  return p.slug || String(p.id)
}
