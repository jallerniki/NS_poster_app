'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Plus, Search, Package, ImageOff, X } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/lib/auth-store'
import { cn } from '@/lib/utils'
import type { WpProduct } from '@/app/api/wordpress/products/search/route'

export interface ProductPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when the user picks a product (clicks "+"). */
  onPick: (product: WpProduct) => void
}

/**
 * Modal product picker: search WP products by title/артикул/content,
 * click "+" to select and feed the post editor.
 */
export function ProductPickerDialog({
  open,
  onOpenChange,
  onPick,
}: ProductPickerDialogProps) {
  const token = useAuth((s) => s.token)
  const siteUrl = useAuth((s) => s.siteUrl)
  const [query, setQuery] = React.useState('')
  const [debounced, setDebounced] = React.useState('')

  // Debounce the search query
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query])

  // Reset query when dialog closes
  React.useEffect(() => {
    if (!open) {
      setQuery('')
      setDebounced('')
    }
  }, [open])

  const enabled = open && !!token && debounced.length >= 2

  const searchQuery = useQuery<{ ok: boolean; products?: WpProduct[]; error?: string }>({
    queryKey: ['wp-products-search', debounced, siteUrl],
    enabled,
    queryFn: async () => {
      const res = await fetch('/api/wordpress/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, siteUrl, query: debounced, perPage: 20 }),
      })
      return res.json()
    },
    staleTime: 30_000,
  })

  const products = searchQuery.data?.products ?? []
  const error = searchQuery.data?.ok === false ? searchQuery.data.error : null
  const loading = searchQuery.isLoading && enabled

  const handlePick = (p: WpProduct) => {
    onPick(p)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-4 text-teal-600" />
            Создать пост по шаблону
          </DialogTitle>
          <DialogDescription>
            Найдите товар в вашем WordPress-магазине — текст поста и фото
            подставятся автоматически по шаблону.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Артикул, название или описание товара…"
            className="pl-9"
            autoFocus
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Очистить"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <ScrollArea className="flex-1 min-h-0 -mx-1">
          <div className="px-1">
            {!token ? (
              <EmptyState text="Нет подключения к WordPress. Войдите в дашборд." />
            ) : debounced.length < 2 ? (
              <EmptyState text="Введите минимум 2 символа для поиска." />
            ) : loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </div>
            ) : products.length === 0 ? (
              <EmptyState text="Ничего не найдено. Попробуйте другой запрос." />
            ) : (
              <ul className="space-y-2">
                {products.map((p) => (
                  <ProductRow key={p.id} product={p} onPick={() => handlePick(p)} />
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function ProductRow({
  product,
  onPick,
}: {
  product: WpProduct
  onPick: () => void
}) {
  const img = product.featuredImageUrl
  const [imgError, setImgError] = React.useState(false)
  const brand = product.brands?.[0]
  const price = product.price || product.regularPrice

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card p-2.5 transition-colors hover:bg-accent/40">
      <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {img && !imgError ? (
          <img
            src={img}
            alt={product.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">
            {product.title || product.sku || `#${product.id}`}
          </span>
          {brand ? (
            <Badge variant="outline" className="shrink-0 border-transparent bg-slate-100 px-1.5 py-0 text-[10px] text-slate-600">
              {brand}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {product.description || product.excerpt || 'Без описания'}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          {product.sku ? <span>Арт: {product.sku}</span> : null}
          {price ? <span className="font-medium text-foreground">{price} ₽</span> : null}
          {product.categories?.[0] ? <span>· {product.categories[0]}</span> : null}
        </div>
      </div>

      <Button
        size="sm"
        onClick={onPick}
        className="shrink-0 bg-teal-700 text-white hover:bg-teal-800"
        aria-label={`Добавить товар ${product.title || product.sku} в пост`}
      >
        <Plus className="size-4" />
      </Button>
    </li>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <Package className="size-8 text-muted-foreground/50" />
      <div>{text}</div>
    </div>
  )
}
