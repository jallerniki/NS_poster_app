'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  CalendarIcon,
  Loader2,
  Package,
  Send,
  Sparkles,
  Eye,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  PLATFORMS,
  composePostText,
  safeParse,
} from '@/lib/social'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { SocialPostPreview } from '@/components/post/social-post-preview'
import {
  ImageDropzone,
  type MediaImage,
  urlsToMediaImages,
  mediaImagesToUrls,
} from '@/components/post/image-dropzone'
import { ProductPickerDialog } from '@/components/post/product-picker-dialog'
import { applyTemplate, wpRefForProduct } from '@/lib/post-template'
import type { WpProduct } from '@/app/api/wordpress/products/search/route'

import {
  asPosition,
  defaultScheduled,
  PlatformIcon,
  type AppendixTemplate,
  type PlatformAccount,
  type PostForEdit,
} from './post-helpers'

interface PostEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  post?: PostForEdit
}

const NO_APPENDIX = 'none'

export function PostEditorDialog({
  open,
  onOpenChange,
  post,
}: PostEditorDialogProps) {
  const isEdit = !!post
  const queryClient = useQueryClient()

  const { data: accounts = [] } = useQuery<PlatformAccount[]>({
    queryKey: ['platforms'],
    queryFn: async () => {
      const res = await fetch('/api/platforms')
      if (!res.ok) throw new Error('Failed to load platforms')
      return res.json()
    },
  })
  const activeAccounts = accounts.filter((a) => a.active)

  const { data: appendices = [] } = useQuery<AppendixTemplate[]>({
    queryKey: ['appendices'],
    queryFn: async () => {
      const res = await fetch('/api/appendices')
      if (!res.ok) throw new Error('Failed to load appendices')
      return res.json()
    },
  })

  const { data: templates = [] } = useQuery<{
    id: string
    name: string
    body: string
    platform: string
  }[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await fetch('/api/templates')
      if (!res.ok) throw new Error('Failed to load templates')
      return res.json()
    },
  })

  // --- Form state -------------------------------------------------------
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [selectedAccountIds, setSelectedAccountIds] = React.useState<string[]>([])
  const [appendixMap, setAppendixMap] = React.useState<Record<string, string>>({})
  const [date, setDate] = React.useState<Date>(() => defaultScheduled())
  const [timeStr, setTimeStr] = React.useState<string>(() =>
    format(defaultScheduled(), 'HH:mm'),
  )
  const [wordpressRef, setWordpressRef] = React.useState('')
  const [productMeta, setProductMeta] = React.useState<Record<string, unknown>>({})
  const [attachButtons, setAttachButtons] = React.useState(true)
  const [media, setMedia] = React.useState<MediaImage[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [previewAccountId, setPreviewAccountId] = React.useState<string | null>(
    null,
  )

  // Reset / prefill whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return
    if (post) {
      setTitle(post.title)
      setContent(post.content)
      setMedia(urlsToMediaImages(safeParse<string[]>(post.mediaUrls, [])))
      setWordpressRef(post.wordpressRef ?? '')
      const d = new Date(post.scheduledAt)
      setDate(d)
      setTimeStr(format(d, 'HH:mm'))
      setSelectedAccountIds(post.targets.map((t) => t.accountId))
      setAppendixMap(
        Object.fromEntries(
          post.targets.map((t) => [t.accountId, t.appendixId ?? '']),
        ),
      )
    } else {
      const d = defaultScheduled()
      setTitle('')
      setContent('')
      setMedia([])
      setWordpressRef('')
      setProductMeta({})
      setDate(d)
      setTimeStr(format(d, 'HH:mm'))
      setSelectedAccountIds([])
      setAppendixMap({})
    }
  }, [open, post])

  // --- Derived ----------------------------------------------------------
  const selectedAccounts = activeAccounts.filter((a) =>
    selectedAccountIds.includes(a.id),
  )
  const appendicesForPlatform = (platform: string) =>
    appendices.filter((a) => a.platform === platform || a.platform === 'all')

  const mediaUrls = React.useMemo(() => mediaImagesToUrls(media), [media])

  const composedPreview = (accountId: string): string => {
    const account = activeAccounts.find((a) => a.id === accountId)
    if (!account) return content
    const appendixId = appendixMap[accountId]
    const appendix = appendices.find((a) => a.id === appendixId)
    return composePostText(
      content,
      appendix?.body,
      asPosition(appendix?.position),
    )
  }

  const toggleAccount = (accountId: string, checked: boolean) => {
    setSelectedAccountIds((prev) =>
      checked ? [...prev, accountId] : prev.filter((id) => id !== accountId),
    )
    if (!checked) {
      setAppendixMap((prev) => {
        const next = { ...prev }
        delete next[accountId]
        return next
      })
    }
  }

  // Default the preview tab to the first selected account.
  const activePreviewId =
    previewAccountId && selectedAccounts.some((a) => a.id === previewAccountId)
      ? previewAccountId
      : selectedAccounts[0]?.id ?? null

  // --- Product picker → template fill ----------------------------------
  const handlePickProduct = (product: WpProduct) => {
    // Find the best-matching template: "all" platform first, else fall back.
    const tpl =
      templates.find((t) => t.platform === 'all') ?? templates[0] ?? null

    if (tpl) {
      setContent(applyTemplate(tpl.body, product))
      toast.success(`Пост заполнен по шаблону «${tpl.name}»`)
    } else {
      // No template — just drop the description + price line.
      const brand = product.brands?.[0] ?? ''
      const priceLine = product.price ? `\n❗Цена ${product.price} ₽/м.` : ''
      setContent(
        `${product.description || product.excerpt || ''}${brand ? `\n\n${brand}` : ''}${priceLine}`,
      )
      toast.message('Шаблон не найден — подставлено описание товара')
    }

    // Title from product title/артикул.
    if (!title.trim()) {
      setTitle(product.title || product.sku || `Товар #${product.id}`)
    }
    // WordPress ref.
    setWordpressRef(wpRefForProduct(product))

    // Save product metadata for inline buttons (sku, categories, slug, permalink).
    setProductMeta({
      sku: product.sku,
      id: product.id,
      slug: product.slug,
      categories: product.categories ?? [],
      permalink: product.permalink || product.link,
    })

    // Photos: featured image + gallery.
    const photoUrls = [
      product.featuredImageUrl,
      ...(product.galleryUrls ?? []),
    ].filter((u): u is string => !!u && typeof u === 'string')
    if (photoUrls.length > 0) {
      setMedia(urlsToMediaImages(photoUrls))
    }
  }

  // --- Submit -----------------------------------------------------------
  const buildScheduledAt = (): Date | null => {
    const [hhStr, mmStr] = timeStr.split(':')
    const hh = Number(hhStr)
    const mm = Number(mmStr)
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null
    const d = new Date(date)
    d.setHours(hh, mm, 0, 0)
    return d
  }

  const validate = (): string | null => {
    if (!content.trim()) return 'Укажите содержание поста'
    if (selectedAccountIds.length === 0)
      return 'Выберите хотя бы одну площадку'
    if (!buildScheduledAt()) return 'Укажите корректные дату и время'
    return null
  }

  const handleSubmit = async () => {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }
    const scheduled = buildScheduledAt()!
    // Auto-generate title from content's first non-empty line if not set.
    const finalTitle =
      title.trim() ||
      content
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0)
        ?.slice(0, 80) ||
      'Без названия'

    const payload: Record<string, unknown> = {
      title: finalTitle,
      content,
      mediaUrls,
      wordpressRef: wordpressRef.trim() || null,
      productMeta: Object.keys(productMeta).length > 0 ? { ...productMeta, attachButtons } : null,
      scheduledAt: scheduled.toISOString(),
      platformIds: selectedAccountIds,
      appendixMap: Object.fromEntries(
        selectedAccountIds.map((id) => [id, appendixMap[id] ?? '']),
      ),
    }

    setSubmitting(true)
    try {
      const url = isEdit ? `/api/posts/${post!.id}` : '/api/posts'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Не удалось сохранить пост')
      }
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
      toast.success(isEdit ? 'Пост обновлён' : 'Пост создан')
      onOpenChange(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Неизвестная ошибка'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  /** Save the post (create/update) and immediately publish to all targets. */
  const handlePublishNow = async () => {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }
    if (selectedAccountIds.length === 0) {
      toast.error('Выберите хотя бы одну площадку для отправки')
      return
    }

    setPublishing(true)
    try {
      // 1. Save the post first (same logic as handleSubmit).
      const scheduled = buildScheduledAt()!
      const finalTitle =
        title.trim() ||
        content
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.length > 0)
          ?.slice(0, 80) ||
        'Без названия'

      const payload: Record<string, unknown> = {
        title: finalTitle,
        content,
        mediaUrls,
        wordpressRef: wordpressRef.trim() || null,
        productMeta: Object.keys(productMeta).length > 0 ? { ...productMeta, attachButtons } : null,
        scheduledAt: scheduled.toISOString(),
        platformIds: selectedAccountIds,
        appendixMap: Object.fromEntries(
          selectedAccountIds.map((id) => [id, appendixMap[id] ?? '']),
        ),
      }

      const saveUrl = isEdit ? `/api/posts/${post!.id}` : '/api/posts'
      const saveMethod = isEdit ? 'PUT' : 'POST'
      const saveRes = await fetch(saveUrl, {
        method: saveMethod,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const saveData = await saveRes.json().catch(() => null)
      if (!saveRes.ok || !saveData?.id) {
        throw new Error(saveData?.error ?? 'Не удалось сохранить пост')
      }
      const postId = saveData.id as string

      // 2. Publish immediately.
      toast.message('Отправка поста в каналы…')
      const pubRes = await fetch(`/api/posts/${postId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const pubData = await pubRes.json().catch(() => null)

      await queryClient.invalidateQueries({ queryKey: ['posts'] })

      if (!pubData || pubData.ok !== true) {
        throw new Error(pubData?.error ?? 'Ошибка отправки')
      }

      const results = pubData.results ?? []
      const ok = results.filter((r: { ok: boolean }) => r.ok).length
      const fail = results.length - ok
      if (fail === 0) {
        toast.success(`Пост отправлен во все каналы (${ok})`)
      } else if (ok > 0) {
        toast.warning(`Отправлено: ${ok}, с ошибками: ${fail}`)
        // Show per-target errors in console.
        results
          .filter((r: { ok: boolean }) => !r.ok)
          .forEach((r: { accountName: string; message?: string }) => {
            toast.error(`${r.accountName}: ${r.message}`)
          })
      } else {
        toast.error('Не удалось отправить ни в один канал')
        results.forEach((r: { accountName: string; message?: string }) => {
          toast.error(`${r.accountName}: ${r.message}`)
        })
        return
      }
      onOpenChange(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Неизвестная ошибка'
      toast.error(message)
    } finally {
      setPublishing(false)
    }
  }

  // --- Render -----------------------------------------------------------
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-6xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 border-b px-5 py-4">
            <DialogTitle>
              {isEdit ? 'Редактировать пост' : 'Новый пост'}
            </DialogTitle>
            <DialogDescription>
              Слева — текст, площадки, приписки, дата и фото. Справа — живое
              превью поста для выбранной площадки.
            </DialogDescription>
          </DialogHeader>

          {/* Two-column body: form (left) + live preview (right) */}
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
            {/* LEFT: form (scrollable) */}
            <div className="overflow-y-auto lg:border-r">
              <div className="flex flex-col gap-5 p-5">
                {/* Создать по шаблону — big button replacing the title field */}
                <Button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="h-14 gap-2 bg-teal-700 text-white text-base hover:bg-teal-800"
                >
                  <Sparkles className="size-5" />
                  Создать по шаблону
                </Button>
                {title ? (
                  <div className="text-xs text-muted-foreground -mt-2">
                    Заголовок: <span className="font-medium text-foreground">{title}</span>
                  </div>
                ) : null}

                {/* Содержание */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="post-content">Содержание</Label>
                  <Textarea
                    id="post-content"
                    rows={8}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Основной текст поста"
                  />
                  <div className="text-xs text-muted-foreground text-right">
                    {content.length} символов
                  </div>
                </div>

                {/* Фото (drag&drop) */}
                <div className="flex flex-col gap-2">
                  <Label>Фотографии</Label>
                  <ImageDropzone images={media} onChange={setMedia} compact />
                </div>

                {/* Площадки */}
                <div className="flex flex-col gap-2">
                  <Label>Площадки</Label>
                  {activeAccounts.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      Нет подключённых площадок. Добавьте бота или канал в
                      разделе «Площадки».
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {activeAccounts.map((account) => {
                        const meta = PLATFORMS[account.platform]
                        const checked = selectedAccountIds.includes(account.id)
                        return (
                          <label
                            key={account.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50',
                              checked && 'border-teal-500/60 bg-teal-50/40',
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                toggleAccount(account.id, v === true)
                              }
                            />
                            <PlatformIcon
                              platform={account.platform}
                              className="size-4 shrink-0"
                            />
                            <span
                              className="size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: meta.hex }}
                              aria-hidden
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="text-sm font-medium truncate">
                                {account.name}
                              </span>
                              <span className="text-[11px] text-muted-foreground truncate">
                                {meta.label} · {meta.targetLabel}:{' '}
                                {account.targetId || '—'}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Приписки */}
                {selectedAccounts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <Label>Приписки по площадкам</Label>
                    <div className="flex flex-col gap-3">
                      {selectedAccounts.map((account) => {
                        const meta = PLATFORMS[account.platform]
                        const value = appendixMap[account.id] || NO_APPENDIX
                        const selectedAppendix = appendices.find(
                          (a) => a.id === appendixMap[account.id],
                        )
                        return (
                          <div
                            key={account.id}
                            className="flex flex-col gap-2 rounded-md border p-3"
                          >
                            <div className="flex items-center gap-2">
                              <PlatformIcon
                                platform={account.platform}
                                className="size-3.5"
                              />
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: meta.hex }}
                                aria-hidden
                              />
                              <span className="flex-1 truncate text-sm font-medium">
                                {account.name}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {meta.label}
                              </span>
                            </div>
                            <Select
                              value={value}
                              onValueChange={(val) =>
                                setAppendixMap((prev) => ({
                                  ...prev,
                                  [account.id]: val === NO_APPENDIX ? '' : val,
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Без приписки" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_APPENDIX}>
                                  Без приписки
                                </SelectItem>
                                {appendicesForPlatform(account.platform).map(
                                  (app) => (
                                    <SelectItem key={app.id} value={app.id}>
                                      {app.name}
                                      {app.position === 'prepend'
                                        ? ' (в начале)'
                                        : ''}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                            {selectedAppendix && (
                              <div className="line-clamp-2 break-words text-xs text-muted-foreground">
                                {selectedAppendix.body.slice(0, 80)}
                                {selectedAppendix.body.length > 80 ? '…' : ''}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Inline-кнопки (товар + категория) — показываются только если есть productMeta */}
                {Object.keys(productMeta).length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <Label className="flex items-center gap-2">
                      <Checkbox
                        checked={attachButtons}
                        onCheckedChange={(v) => setAttachButtons(v === true)}
                      />
                      Inline-кнопки (Товар + Категория)
                    </Label>
                    <div className="text-xs text-muted-foreground">
                      При отправке к посту добавятся 2 кнопки-ссылки на товар и
                      категорию на сайте. Настройте их в разделе «Кнопки».
                    </div>
                  </div>
                ) : null}

                {/* Дата и время */}
                <div className="flex flex-col gap-2">
                  <Label>Дата и время публикации</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 justify-start text-left font-normal"
                        >
                          <CalendarIcon className="size-4" />
                          {date
                            ? format(date, 'd MMM yyyy', { locale: ru })
                            : 'Дата'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(d) => d && setDate(d)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      value={timeStr}
                      onChange={(e) => setTimeStr(e.target.value)}
                      className="sm:w-40"
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* RIGHT: live preview */}
            <div className="flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900/40">
              <div className="flex flex-shrink-0 items-center justify-between border-b bg-white/70 px-4 py-2.5 dark:bg-slate-900/60">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Eye className="size-3.5" />
                  Живое превью
                </div>
                {selectedAccounts.length > 0 && activePreviewId ? (
                  <Tabs
                    value={activePreviewId}
                    onValueChange={setPreviewAccountId}
                  >
                    <TabsList className="h-8">
                      {selectedAccounts.map((account) => (
                        <TabsTrigger
                          key={account.id}
                          value={account.id}
                          className="gap-1 px-2 text-xs"
                        >
                          <PlatformIcon
                            platform={account.platform}
                            className="size-3"
                          />
                          {PLATFORMS[account.platform].label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                ) : null}
              </div>

              <div className="overflow-y-auto flex-1 min-h-0">
                <div className="p-4">
                  {selectedAccounts.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                      <Package className="size-8 text-muted-foreground/50" />
                      <div>Выберите площадку слева — здесь появится превью</div>
                    </div>
                  ) : activePreviewId ? (
                    <div className="rounded-lg bg-slate-100 p-2.5 dark:bg-slate-900/60">
                      <SocialPostPreview
                        platform={
                          activeAccounts.find((a) => a.id === activePreviewId)
                            ?.platform ?? 'telegram'
                        }
                        text={
                          composedPreview(activePreviewId) ||
                          'Пусто — введите текст поста'
                        }
                        photos={mediaUrls}
                        accountName={
                          activeAccounts.find((a) => a.id === activePreviewId)
                            ?.name
                        }
                        accountType={
                          (activeAccounts.find((a) => a.id === activePreviewId)
                            ?.platform) === 'telegram'
                            ? 'канал · Telegram'
                            : (activeAccounts.find((a) => a.id === activePreviewId)
                                ?.platform) === 'max'
                              ? 'бот · MAX'
                              : 'сообщество · ВКонтакте'
                        }
                        time={timeStr}
                      />
                    </div>
                  ) : null}

                  {/* Photos preview summary */}
                  {mediaUrls.length > 0 ? (
                    <div className="mt-3 text-[11px] text-muted-foreground">
                      📷 {mediaUrls.length} фото — раскладка показана в превью
                      выше
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="flex-shrink-0 border-t px-5 py-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting || publishing}
            >
              Отмена
            </Button>
            <Button
              variant="outline"
              onClick={handlePublishNow}
              disabled={submitting || publishing || selectedAccountIds.length === 0}
              className="gap-1.5 border-teal-600 text-teal-700 hover:bg-teal-50"
              title={
                selectedAccountIds.length === 0
                  ? 'Выберите площадку для отправки'
                  : 'Отправить пост во все выбранные каналы прямо сейчас'
              }
            >
              {publishing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Отправить сейчас
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || publishing}
              className="bg-teal-700 text-white hover:bg-teal-700/90"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product picker (template) dialog — rendered as a sibling */}
      <ProductPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handlePickProduct}
      />
    </>
  )
}
