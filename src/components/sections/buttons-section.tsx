'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ExternalLink,
  Eye,
  Link2,
  MousePointerClick,
  Pencil,
  Plus,
  Send,
  MessageCircle,
  Trash2,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/** Shape returned by /api/button-presets. */
interface ButtonPreset {
  id: string
  name: string
  platform: string
  productLabel: string
  productUrl: string
  categoryLabel: string
  categoryUrl: string
  active: boolean
  buttonsEnabledByDefault: boolean
  createdAt: string
  updatedAt: string
}

type Platform = 'telegram' | 'max'

interface PlatformMeta {
  label: string
  /** Tailwind classes for the platform badge. */
  badgeClass: string
  /** Tailwind classes for the live-preview button pill. */
  pillClass: string
  icon: React.ComponentType<{ className?: string }>
}

const PLATFORM_META: Record<Platform, PlatformMeta> = {
  telegram: {
    label: 'Telegram',
    badgeClass:
      'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300',
    pillClass:
      'border-sky-300 bg-sky-500 text-white hover:bg-sky-600 dark:border-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500',
    icon: Send,
  },
  max: {
    label: 'MAX',
    badgeClass:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300',
    pillClass:
      'border-emerald-300 bg-emerald-500 text-white hover:bg-emerald-600 dark:border-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500',
    icon: MessageCircle,
  },
}

function getPlatformMeta(platform: string): PlatformMeta {
  return (
    PLATFORM_META[platform as Platform] ?? {
      label: platform,
      badgeClass: '',
      pillClass: '',
      icon: MousePointerClick,
    }
  )
}

/** Variables that can be used inside URL templates. */
const VARIABLES: Array<{ token: string; label: string }> = [
  { token: '{{sku}}', label: 'Артикул товара' },
  { token: '{{id}}', label: 'ID товара' },
  { token: '{{slug}}', label: 'Slug товара' },
  { token: '{{category}}', label: 'Название категории' },
  { token: '{{categorySlug}}', label: 'Slug категории' },
]

/** Platform-specific example templates (clickable to fill the form). */
const EXAMPLES: Array<{
  platform: Platform
  kind: 'product' | 'category'
  url: string
}> = [
  {
    platform: 'telegram',
    kind: 'product',
    url: 'https://t.me/test_nstkani_bot/ns_tkani_catalogue?startapp={{sku}}',
  },
  {
    platform: 'telegram',
    kind: 'category',
    url: 'https://t.me/test_nstkani_bot/ns_tkani_catalogue?startapp=cat-{{categorySlug}}',
  },
  {
    platform: 'max',
    kind: 'product',
    url: 'https://nstkani.ru/?from=max&start={{sku}}',
  },
  {
    platform: 'max',
    kind: 'category',
    url: 'https://nstkani.ru/?from=max&start=cat-{{categorySlug}}',
  },
]

/**
 * Render a URL template with placeholders replaced by example values — used for
 * the live preview so the user can see what the final URL will look like.
 */
function renderUrlTemplate(template: string): string {
  if (!template) return ''
  return template
    .replace(/\{\{sku\}\}/g, '13876')
    .replace(/\{\{id\}\}/g, '13876')
    .replace(/\{\{slug\}\}/g, 'ljon-s-hlopkom-peserico')
    .replace(/\{\{category\}\}/g, 'Лён')
    .replace(/\{\{categorySlug\}\}/g, 'len')
}

interface FormValues {
  name: string
  platform: Platform
  productLabel: string
  productUrl: string
  categoryLabel: string
  categoryUrl: string
  buttonsEnabledByDefault: boolean
}

const EMPTY_FORM: FormValues = {
  name: '',
  platform: 'telegram',
  productLabel: 'Товар',
  productUrl: '',
  categoryLabel: 'Категория',
  categoryUrl: '',
  buttonsEnabledByDefault: true,
}

function ButtonPresetFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
  submitting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initial?: ButtonPreset | null
  onSubmit: (values: FormValues) => void
  submitting: boolean
}) {
  const isCreate = mode === 'create'
  const [form, setForm] = React.useState<FormValues>(EMPTY_FORM)

  React.useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        name: initial.name,
        platform: (initial.platform as Platform) ?? 'telegram',
        productLabel: initial.productLabel || 'Товар',
        productUrl: initial.productUrl,
        categoryLabel: initial.categoryLabel || 'Категория',
        categoryUrl: initial.categoryUrl,
        buttonsEnabledByDefault: initial.buttonsEnabledByDefault ?? true,
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, initial])

  const meta = getPlatformMeta(form.platform)
  const productPreviewUrl = renderUrlTemplate(form.productUrl)
  const categoryPreviewUrl = renderUrlTemplate(form.categoryUrl)

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /** Fill a URL field with an example for the currently selected platform. */
  function applyExample(kind: 'product' | 'category', url: string) {
    if (kind === 'product') {
      setField('productUrl', url)
    } else {
      setField('categoryUrl', url)
    }
    toast.success('Пример подставлен')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Укажите название пресета')
      return
    }
    if (!form.productUrl.trim() || !form.categoryUrl.trim()) {
      toast.error('Заполните оба URL-шаблона')
      return
    }
    onSubmit({
      ...form,
      name: form.name.trim(),
      productLabel: form.productLabel.trim() || 'Товар',
      categoryLabel: form.categoryLabel.trim() || 'Категория',
      productUrl: form.productUrl.trim(),
      categoryUrl: form.categoryUrl.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? 'Новый пресет кнопок' : 'Редактировать пресет кнопок'}
          </DialogTitle>
          <DialogDescription>
            Пресет описывает две inline-кнопки (Товар и Категория), которые
            автоматически добавляются к посту при публикации на выбранную
            площадку.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="bp-name">Название</Label>
              <Input
                id="bp-name"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="Например, Telegram — кнопки магазина"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bp-platform">Площадка</Label>
              <Select
                value={form.platform}
                onValueChange={(v) => setField('platform', v as Platform)}
              >
                <SelectTrigger id="bp-platform" className="w-full">
                  <SelectValue placeholder="Выберите площадку" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="max">MAX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Product button */}
          <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ExternalLink className="size-3.5" />
              Кнопка «Товар»
            </div>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="bp-product-label" className="text-xs">
                  Текст кнопки
                </Label>
                <Input
                  id="bp-product-label"
                  value={form.productLabel}
                  onChange={(e) => setField('productLabel', e.target.value)}
                  placeholder="Товар"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bp-product-url" className="text-xs">
                  URL-шаблон
                </Label>
                <Input
                  id="bp-product-url"
                  value={form.productUrl}
                  onChange={(e) => setField('productUrl', e.target.value)}
                  placeholder="https://example.com/product?sku={{sku}}"
                  className="font-mono text-[12px]"
                  required
                />
              </div>
            </div>
          </div>

          {/* Category button */}
          <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Link2 className="size-3.5" />
              Кнопка «Категория»
            </div>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="bp-category-label" className="text-xs">
                  Текст кнопки
                </Label>
                <Input
                  id="bp-category-label"
                  value={form.categoryLabel}
                  onChange={(e) => setField('categoryLabel', e.target.value)}
                  placeholder="Категория"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bp-category-url" className="text-xs">
                  URL-шаблон
                </Label>
                <Input
                  id="bp-category-url"
                  value={form.categoryUrl}
                  onChange={(e) => setField('categoryUrl', e.target.value)}
                  placeholder="https://example.com/category/{{categorySlug}}"
                  className="font-mono text-[12px]"
                  required
                />
              </div>
            </div>
          </div>

          {/* Variables hint */}
          <div className="grid gap-2">
            <div className="text-xs font-medium text-muted-foreground">
              Доступные переменные
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <code
                  key={v.token}
                  title={v.label}
                  className="inline-flex items-center rounded-md border border-input bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground"
                >
                  {v.token}
                  <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                    {v.label}
                  </span>
                </code>
              ))}
            </div>
          </div>

          {/* Platform examples */}
          <div className="grid gap-2">
            <div className="text-xs font-medium text-muted-foreground">
              Примеры для{' '}
              <span className="font-semibold text-foreground">{meta.label}</span>{' '}
              — кликните, чтобы подставить
            </div>
            <div className="grid gap-1.5">
              {EXAMPLES.filter((ex) => ex.platform === form.platform).map(
                (ex) => (
                  <button
                    key={`${ex.kind}-${ex.platform}`}
                    type="button"
                    onClick={() => applyExample(ex.kind, ex.url)}
                    className="group flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-left transition-colors hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 px-1.5 text-[10px]',
                        ex.kind === 'product'
                          ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300',
                      )}
                    >
                      {ex.kind === 'product' ? 'Товар' : 'Категория'}
                    </Badge>
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                      {ex.url}
                    </code>
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Default-enabled toggle */}
          <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3">
            <div className="grid gap-1">
              <Label htmlFor="bp-buttons-enabled-by-default" className="text-sm">
                Выделять кнопки по умолчанию
              </Label>
              <p className="text-xs text-muted-foreground">
                Если включено, при создании поста по шаблону галочка кнопок будет
                стоять автоматически
              </p>
            </div>
            <Switch
              id="bp-buttons-enabled-by-default"
              checked={form.buttonsEnabledByDefault}
              onCheckedChange={(v) => setField('buttonsEnabledByDefault', v)}
            />
          </div>

          {/* Live preview */}
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Eye className="size-3" />
              Превью кнопок
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                tabIndex={-1}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium shadow-sm transition-colors',
                  meta.pillClass,
                )}
              >
                <ExternalLink className="size-3.5" />
                {form.productLabel || 'Товар'}
              </button>
              <button
                type="button"
                tabIndex={-1}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium shadow-sm transition-colors',
                  meta.pillClass,
                )}
              >
                <Link2 className="size-3.5" />
                {form.categoryLabel || 'Категория'}
              </button>
            </div>
            <div className="grid gap-1 text-[11px] text-muted-foreground">
              <div className="truncate">
                <span className="font-medium text-foreground/70">Товар:</span>{' '}
                <code className="font-mono">
                  {productPreviewUrl || (
                    <span className="italic text-muted-foreground/70">
                      (шаблон пуст)
                    </span>
                  )}
                </code>
              </div>
              <div className="truncate">
                <span className="font-medium text-foreground/70">
                  Категория:
                </span>{' '}
                <code className="font-mono">
                  {categoryPreviewUrl || (
                    <span className="italic text-muted-foreground/70">
                      (шаблон пуст)
                    </span>
                  )}
                </code>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-teal-700 text-white hover:bg-teal-700/90"
            >
              {submitting ? 'Сохранение…' : isCreate ? 'Создать' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ButtonPresetCard({
  preset,
  onEdit,
  onDelete,
}: {
  preset: ButtonPreset
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = getPlatformMeta(preset.platform)
  const Icon = meta.icon

  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{preset.name}</CardTitle>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={meta.badgeClass}>
                <Icon className="size-3" />
                {meta.label}
              </Badge>
              {preset.active ? (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                >
                  активен
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-muted-foreground">
                  выключен
                </Badge>
              )}
              {preset.buttonsEnabledByDefault ? (
                <Badge
                  variant="outline"
                  className="border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/40 dark:bg-teal-950/30 dark:text-teal-300"
                >
                  по умолчанию: вкл
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-muted-foreground">
                  по умолчанию: выкл
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3">
        {/* Product button preview */}
        <div className="grid gap-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ExternalLink className="size-3" />
            Кнопка «Товар»
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-xs font-medium',
                meta.pillClass,
              )}
            >
              {preset.productLabel || 'Товар'}
            </span>
            <code className="min-w-0 flex-1 truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {preset.productUrl}
            </code>
          </div>
        </div>

        {/* Category button preview */}
        <div className="grid gap-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="size-3" />
            Кнопка «Категория»
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-xs font-medium',
                meta.pillClass,
              )}
            >
              {preset.categoryLabel || 'Категория'}
            </span>
            <code className="min-w-0 flex-1 truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {preset.categoryUrl}
            </code>
          </div>
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="size-3.5" />
          Редактировать
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          Удалить
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ButtonsSection() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery<ButtonPreset[]>({
    queryKey: ['button-presets'],
    queryFn: async () => {
      const res = await fetch('/api/button-presets')
      if (!res.ok) throw new Error('Не удалось загрузить пресеты кнопок')
      return (await res.json()) as ButtonPreset[]
    },
  })

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<ButtonPreset | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ButtonPreset | null>(
    null,
  )

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await fetch('/api/button-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'Ошибка создания')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Пресет создан')
      queryClient.invalidateQueries({ queryKey: ['button-presets'] })
      setDialogOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; values: FormValues }) => {
      const res = await fetch(`/api/button-presets/${vars.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars.values),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'Ошибка обновления')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Пресет обновлён')
      queryClient.invalidateQueries({ queryKey: ['button-presets'] })
      setDialogOpen(false)
      setEditTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/button-presets/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Не удалось удалить')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Пресет удалён')
      queryClient.invalidateQueries({ queryKey: ['button-presets'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const submitting = createMutation.isPending || updateMutation.isPending

  function openCreate() {
    setEditTarget(null)
    setDialogOpen(true)
  }

  function openEdit(preset: ButtonPreset) {
    setEditTarget(preset)
    setDialogOpen(true)
  }

  function handleSubmit(values: FormValues) {
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, values })
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="bg-teal-50/40 dark:bg-teal-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MousePointerClick className="size-4 text-teal-700 dark:text-teal-300" />
            Кнопки в постах
          </CardTitle>
          <CardDescription>
            Пресет кнопок описывает две inline-кнопки — «Товар» и «Категория» —
            которые автоматически добавляются к сообщению при создании поста из
            карточки товара. URL-шаблоны содержат переменные вида{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              {'{{sku}}'}
            </code>
            , которые подставляются из данных товара WordPress. Создайте по
            одному пресету для каждой площадки (Telegram и MAX).
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {data && data.length > 0
            ? `Всего пресетов: ${data.length}`
            : 'Создайте первый пресет кнопок'}
        </div>
        <Button
          onClick={openCreate}
          className="bg-teal-700 text-white hover:bg-teal-700/90"
        >
          <Plus className="size-4" />
          Новый пресет
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Не удалось загрузить пресеты кнопок.{' '}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => refetch()}
            >
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : !data || data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-muted p-3">
              <MousePointerClick className="size-5 text-muted-foreground" />
            </div>
            <div>
              <div className="font-medium">Пресетов кнопок пока нет</div>
              <div className="text-sm text-muted-foreground">
                Создайте первый пресет — например, кнопки для Telegram-бота
                магазина.
              </div>
            </div>
            <Button
              onClick={openCreate}
              className="bg-teal-700 text-white hover:bg-teal-700/90"
            >
              <Plus className="size-4" />
              Новый пресет
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((preset) => (
            <ButtonPresetCard
              key={preset.id}
              preset={preset}
              onEdit={() => openEdit(preset)}
              onDelete={() => setDeleteTarget(preset)}
            />
          ))}
        </div>
      )}

      <ButtonPresetFormDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditTarget(null)
        }}
        mode={editTarget ? 'edit' : 'create'}
        initial={editTarget}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пресет кнопок?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name ? (
                <>
                  Пресет «{deleteTarget.name}» будет удалён без возможности
                  восстановления. Кнопки перестанут добавляться к новым постам
                  этой площадки.
                </>
              ) : (
                'Это действие нельзя отменить.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
            >
              {deleteMutation.isPending ? 'Удаление…' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ButtonsSection
