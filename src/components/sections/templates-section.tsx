'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Eye,
  FileText,
  Plus,
  Save,
  Trash2,
  Package,
  Braces,
  Tag,
  Percent,
} from 'lucide-react'

import { applyTemplate } from '@/lib/post-template'
import type { WpProduct } from '@/app/api/wordpress/products/search/route'
import { cn } from '@/lib/utils'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

/** Shape returned by /api/templates. */
interface Template {
  id: string
  name: string
  body: string
  platform: string
  active: boolean
  createdAt: string
  updatedAt: string
}

const DEFAULT_TEMPLATE_BODY = `{{description}}

{{brand}}
Арт: {{sku}}
{{metaLine состав}}
{{metaLine ширина}}
{{metaLine пр-во}}
{{couponLine}}
❗Цена {{regularPrice}} ₽/м{{saleBlock}}.`

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'max', label: 'MAX' },
  { value: 'vk', label: 'VK' },
]

interface VarGroup {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: Array<{ value: string; label: string; hint?: string }>
}

const VARIABLE_GROUPS: VarGroup[] = [
  {
    title: 'Товар',
    icon: Package,
    items: [
      { value: '{{title}}', label: 'Артикул', hint: 'заголовок товара' },
      { value: '{{description}}', label: 'Описание' },
      { value: '{{excerpt}}', label: 'Короткое описание' },
      { value: '{{url}}', label: 'Ссылка' },
    ],
  },
  {
    title: 'Поля товара',
    icon: Tag,
    items: [
      { value: '{{brand}}', label: 'Линия / бренд' },
      { value: '{{sku}}', label: 'Артикул' },
      { value: '{{price}}', label: 'Цена' },
      { value: '{{regularPrice}}', label: 'Обычная цена' },
      { value: '{{salePrice}}', label: 'Цена со скидкой' },
    ],
  },
  {
    title: 'Кастомные поля WP (ACF)',
    icon: Braces,
    items: [
      // Прямые значения по точному ключу ACF — кликабельные чипы
      { value: '{{описание_}}', label: 'Описание', hint: 'описание_' },
      { value: '{{линия_}}', label: 'Линия / бренд', hint: 'линия_' },
      { value: '{{состав_}}', label: 'Состав', hint: 'состав_' },
      { value: '{{ширина_}}', label: 'Ширина', hint: 'ширина_' },
      { value: '{{страна_производства}}', label: 'Страна производства', hint: 'страна_производства' },
      { value: '{{купон_}}', label: 'Купон', hint: 'купон_' },
      { value: '{{метраж_}}', label: 'Метраж', hint: 'метраж_' },
      { value: '{{дефект_}}', label: 'Дефект', hint: 'дефект_' },
    ],
  },
  {
    title: 'Блоки',
    icon: Percent,
    items: [
      {
        value: '{{couponLine}}',
        label: 'Купон: …',
        hint: 'только если есть купон',
      },
      {
        value: '{{saleBlock}}',
        label: 'Скидка',
        hint: ' - скидкаN%= цена ₽/м',
      },
    ],
  },
  {
    title: 'Форматирование',
    icon: Braces,
    items: [
      {
        value: '{{meta.KEY}}',
        label: 'Произвольное meta-поле',
        hint: 'замените KEY на имя поля, напр. {{meta.купон_}}',
      },
    ],
  },
]

/** Hardcoded sample product used for the live preview. */
const SAMPLE_PRODUCT: WpProduct = {
  id: 13876,
  slug: '13876',
  title: '13876',
  description:
    'Плательно-костюмный лён с хлопком Peserico. Мягкая, дышащая ткань с благородной матовой поверхностью. Отлично подходит для летних платьев, жакетов и костюмов.',
  excerpt: 'Плательно-костюмный лён с хлопком Peserico',
  link: 'https://nstkani.ru/product/13876',
  permalink: 'https://nstkani.ru/product/13876',
  featuredImageUrl: null,
  galleryUrls: [],
  brands: ['Peserico'],
  categories: ['Лён'],
  tags: [],
  meta: {
    состав_: '70% хлопок, 29% лён, 1% эластан',
    ширина_: '140 см.',
    страна_производства: 'Италия',
    линия_: 'Peserico',
    купон_: 'TKANI10',
    описание_: 'Плательно-костюмный лён с хлопком Peserico. Мягкая, дышащая ткань с благородной матовой поверхностью. Отлично подходит для летних платьев, жакетов и костюмов.',
    метраж_: '2.5 м',
    дефект_: '',
  },
  sku: '13876',
  price: '1440',
  regularPrice: '2400',
  salePrice: '1440',
  stockStatus: 'instock',
}

export function TemplatesSection() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await fetch('/api/templates')
      if (!res.ok) throw new Error('Не удалось загрузить шаблоны')
      return (await res.json()) as Template[]
    },
  })

  // Currently-selected template id (null = new unsaved template).
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [name, setName] = React.useState('')
  const [body, setBody] = React.useState(DEFAULT_TEMPLATE_BODY)
  const [platform, setPlatform] = React.useState('all')
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  // Track which template is being edited, and whether there are unsaved edits.
  const [dirty, setDirty] = React.useState(false)

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  // Load first template by default once data arrives.
  React.useEffect(() => {
    if (data && data.length > 0 && selectedId === null) {
      const first = data[0]
      setSelectedId(first.id)
      setName(first.name)
      setBody(first.body)
      setPlatform(first.platform)
      setDirty(false)
    }
  }, [data, selectedId])

  function loadTemplate(t: Template) {
    setSelectedId(t.id)
    setName(t.name)
    setBody(t.body)
    setPlatform(t.platform)
    setDirty(false)
  }

  function startNew() {
    setSelectedId(null)
    setName('')
    setBody(DEFAULT_TEMPLATE_BODY)
    setPlatform('all')
    setDirty(false)
    toast.info('Создаётся новый шаблон. Не забудьте сохранить.')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Укажите название шаблона')
      const payload = {
        name: name.trim(),
        body,
        platform,
      }
      if (selectedId) {
        const res = await fetch(`/api/templates/${selectedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j?.error || 'Не удалось сохранить')
        }
        return (await res.json()) as Template
      }
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'Не удалось создать')
      }
      return (await res.json()) as Template
    },
    onSuccess: (saved) => {
      toast.success(selectedId ? 'Шаблон сохранён' : 'Шаблон создан')
      setSelectedId(saved.id)
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Не удалось удалить')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Шаблон удалён')
      setDeleteOpen(false)
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      // Reset editor — next data refresh will pick the first remaining template.
      setSelectedId(null)
      setName('')
      setBody(DEFAULT_TEMPLATE_BODY)
      setPlatform('all')
      setDirty(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function insertAtCursor(value: string) {
    const el = textareaRef.current
    if (!el) {
      // Fallback: just append.
      setBody((b) => b + value)
      setDirty(true)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const next = body.slice(0, start) + value + body.slice(end)
    setBody(next)
    setDirty(true)
    // Restore focus + move caret past inserted text.
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + value.length
      el.setSelectionRange(pos, pos)
    })
  }

  function handleSave() {
    saveMutation.mutate()
  }

  const preview = React.useMemo(() => {
    try {
      return applyTemplate(body || '', SAMPLE_PRODUCT)
    } catch {
      return ''
    }
  }, [body])

  const selected = data?.find((t) => t.id === selectedId) ?? null
  const isNew = !selectedId

  return (
    <div className="grid gap-4">
      <Card className="bg-teal-50/40 dark:bg-teal-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-teal-700 dark:text-teal-300" />
            Шаблоны постов
          </CardTitle>
          <CardDescription>
            Шаблон — это текст с переменными вида{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              {'{{description}}'}
            </code>
            . При создании поста кнопкой «Создать по шаблону» переменные
            подставляются из данных товара WordPress.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Templates list / tabs at the top */}
      <div className="flex flex-wrap items-center gap-2">
        {isLoading ? (
          <Skeleton className="h-9 w-48" />
        ) : (
          data?.map((t) => {
            const active = t.id === selectedId
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => loadTemplate(t)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                    : 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <FileText className="size-3.5" />
                <span className="max-w-[200px] truncate">{t.name}</span>
                {t.platform && t.platform !== 'all' && (
                  <Badge variant="outline" className="ml-1 px-1 text-[10px]">
                    {t.platform}
                  </Badge>
                )}
              </button>
            )
          })
        )}
        <Button
          type="button"
          variant="outline"
          onClick={startNew}
          className="h-9"
        >
          <Plus className="size-4" />
          Новый шаблон
        </Button>
        {isError && (
          <Button
            type="button"
            variant="link"
            className="h-9"
            onClick={() => refetch()}
          >
            Повторить загрузку
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Editor column */}
        <Card className="order-2 lg:order-1">
          <CardHeader>
            <CardTitle className="text-base">
              {isNew ? 'Новый шаблон' : 'Редактирование шаблона'}
              {dirty && (
                <Badge
                  variant="outline"
                  className="ml-2 border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                >
                  не сохранён
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Текст шаблона с переменными. Кликайте по чипам справа, чтобы
              вставить переменную в позицию курсора.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tpl-name">Название</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setDirty(true)
                  }}
                  placeholder="Например, Ткань — карточка"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tpl-platform">Площадка</Label>
                <Select
                  value={platform}
                  onValueChange={(v) => {
                    setPlatform(v)
                    setDirty(true)
                  }}
                >
                  <SelectTrigger id="tpl-platform" className="w-full">
                    <SelectValue placeholder="Выберите площадку" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tpl-body">Текст шаблона</Label>
              <Textarea
                ref={textareaRef}
                id="tpl-body"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  setDirty(true)
                }}
                rows={18}
                className="font-mono text-[13px] leading-relaxed"
                placeholder="Введите текст шаблона…"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {body.length} символов ·{' '}
                  {body.split('\n').length} строк
                </span>
                <span>
                  Переменные: {body.match(/\{\{[^}]+\}\}/g)?.length ?? 0}
                </span>
              </div>
            </div>

            <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Eye className="size-3" />
                Превью (на примере товара)
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
                {preview || (
                  <span className="text-muted-foreground italic">
                    (шаблон пуст)
                  </span>
                )}
              </pre>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="bg-teal-700 text-white hover:bg-teal-700/90"
              >
                <Save className="size-4" />
                {saveMutation.isPending
                  ? 'Сохранение…'
                  : isNew
                    ? 'Создать шаблон'
                    : 'Сохранить шаблон'}
              </Button>
              {!isNew && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="size-4" />
                  Удалить
                </Button>
              )}
              {selected && (
                <span className="ml-auto text-xs text-muted-foreground">
                  Обновлён:{' '}
                  {new Date(selected.updatedAt).toLocaleString('ru-RU')}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Variables panel */}
        <Card className="order-1 lg:order-2 lg:sticky lg:top-4 lg:self-start">
          <CardHeader>
            <CardTitle className="text-base">Переменные</CardTitle>
            <CardDescription>
              Кликните, чтобы вставить в позицию курсора.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {VARIABLE_GROUPS.map((group) => {
              const Icon = group.icon
              return (
                <div key={group.title} className="grid gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon className="size-3.5" />
                    {group.title}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        title={item.hint}
                        onClick={() => insertAtCursor(item.value)}
                        className="group inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium transition-colors hover:border-teal-500 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-300"
                      >
                        <span className="text-foreground/80 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                          {item.label}
                        </span>
                        <code className="font-mono text-[10px] text-muted-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400">
                          {item.value}
                        </code>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить шаблон?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.name ? (
                <>
                  Шаблон «{selected.name}» будет удалён без возможности
                  восстановления.
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
                if (selectedId) deleteMutation.mutate(selectedId)
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

export default TemplatesSection
