'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Eye,
  Pencil,
  Plus,
  Send,
  MessageCircle,
  Users,
  Trash2,
  Globe2,
  Hash,
} from 'lucide-react'

import {
  PLATFORMS,
  type AppendixPosition,
  type Platform,
  composePostText,
} from '@/lib/social'
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

const ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  Send,
  MessageCircle,
  Users,
}

interface Appendix {
  id: string
  platform: string
  name: string
  body: string
  position: string
  category: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

type FilterKey = 'all' | 'telegram' | 'max' | 'vk' | 'platform-all'

const FILTER_OPTIONS: Array<{
  key: FilterKey
  label: string
  icon?: React.ComponentType<{
    className?: string
    style?: React.CSSProperties
  }>
  hex?: string
}> = [
  { key: 'all', label: 'Все' },
  {
    key: 'telegram',
    label: 'Telegram',
    icon: Send,
    hex: PLATFORMS.telegram.hex,
  },
  {
    key: 'max',
    label: 'MAX',
    icon: MessageCircle,
    hex: PLATFORMS.max.hex,
  },
  {
    key: 'vk',
    label: 'ВКонтакте',
    icon: Users,
    hex: PLATFORMS.vk.hex,
  },
  { key: 'platform-all', label: 'Все площадки', icon: Globe2 },
]

function platformMeta(platform: string) {
  if (platform === 'all') {
    return {
      label: 'Все площадки',
      hex: '#14b8a6',
      icon: Globe2,
    }
  }
  const meta = PLATFORMS[platform as Platform]
  if (!meta) return null
  return { label: meta.label, hex: meta.hex, icon: ICON_MAP[meta.icon] ?? Send }
}

function PositionBadge({ position }: { position: string }) {
  const isPrepend = position === 'prepend'
  return (
    <Badge
      variant="outline"
      className={
        isPrepend
          ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
      }
    >
      {isPrepend ? 'До текста' : 'После текста'}
    </Badge>
  )
}

interface AppendixFormValues {
  platform: string
  name: string
  body: string
  position: AppendixPosition
  category: string
}

function AppendixFormDialog({
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
  initial?: Appendix | null
  onSubmit: (values: AppendixFormValues) => void
  submitting: boolean
}) {
  const isCreate = mode === 'create'
  const [platform, setPlatform] = React.useState<string>(
    initial?.platform ?? 'telegram',
  )
  const [name, setName] = React.useState(initial?.name ?? '')
  const [body, setBody] = React.useState(initial?.body ?? '')
  const [position, setPosition] = React.useState<AppendixPosition>(
    (initial?.position as AppendixPosition) ?? 'append',
  )
  const [category, setCategory] = React.useState(initial?.category ?? '')

  React.useEffect(() => {
    if (!open) return
    setPlatform(initial?.platform ?? 'telegram')
    setName(initial?.name ?? '')
    setBody(initial?.body ?? '')
    setPosition((initial?.position as AppendixPosition) ?? 'append')
    setCategory(initial?.category ?? '')
  }, [open, initial])

  const preview = React.useMemo(() => {
    return composePostText('Пример текста поста...', body, position)
  }, [body, position])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Укажите название приписки')
      return
    }
    if (!body.trim()) {
      toast.error('Введите текст приписки')
      return
    }
    onSubmit({
      platform,
      name: name.trim(),
      body: body.trim(),
      position,
      category: category.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? 'Новая приписка' : 'Редактировать приписку'}
          </DialogTitle>
          <DialogDescription>
            Приписка будет доступна при создании поста для выбранной площадки.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ap-platform">Площадка</Label>
            <Select
              value={platform}
              onValueChange={(v) => setPlatform(v)}
            >
              <SelectTrigger id="ap-platform" className="w-full">
                <SelectValue placeholder="Выберите площадку" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="max">MAX</SelectItem>
                <SelectItem value="vk">ВКонтакте</SelectItem>
                <SelectItem value="all">Все площадки</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ap-name">Название</Label>
            <Input
              id="ap-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Хештеги для TG"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ap-body">Текст приписки</Label>
            <Textarea
              id="ap-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="#новости #акция&#10;Подписывайтесь на наш канал!"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ap-position">Позиция</Label>
              <Select
                value={position}
                onValueChange={(v) => setPosition(v as AppendixPosition)}
              >
                <SelectTrigger id="ap-position" className="w-full">
                  <SelectValue placeholder="Выберите позицию" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="append">После текста</SelectItem>
                  <SelectItem value="prepend">До текста</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ap-category">
                Категория
                <span className="ml-1 text-xs text-muted-foreground">(опц.)</span>
              </Label>
              <Input
                id="ap-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="напр. акции"
              />
            </div>
          </div>

          <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Eye className="size-3" />
              Превью
            </div>
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
              {preview}
            </pre>
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

function AppendixCard({
  appendix,
  onEdit,
  onDelete,
}: {
  appendix: Appendix
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = platformMeta(appendix.platform)
  const Icon = meta?.icon ?? Hash
  const hex = meta?.hex ?? '#64748b'

  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{appendix.name}</CardTitle>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {meta && (
                <Badge
                  variant="outline"
                  className="border-current/30"
                  style={{ color: hex }}
                >
                  <Icon className="size-3" />
                  {meta.label}
                </Badge>
              )}
              <PositionBadge position={appendix.position} />
              {appendix.category && (
                <Badge variant="secondary" className="text-muted-foreground">
                  <Hash className="size-3" />
                  {appendix.category}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
          {appendix.body}
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

export function AppendicesSection() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = React.useState<FilterKey>('all')

  // Build the platform query param. 'all' → no filter; 'platform-all' → ?platform=all
  const platformParam =
    filter === 'all'
      ? null
      : filter === 'platform-all'
        ? 'all'
        : filter

  const { data, isLoading, isError, refetch } = useQuery<Appendix[]>({
    queryKey: ['appendices', filter],
    queryFn: async () => {
      const url = platformParam
        ? `/api/appendices?platform=${encodeURIComponent(platformParam)}`
        : '/api/appendices'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Не удалось загрузить приписки')
      return (await res.json()) as Appendix[]
    },
  })

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<Appendix | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Appendix | null>(null)

  const createMutation = useMutation({
    mutationFn: async (values: AppendixFormValues) => {
      const res = await fetch('/api/appendices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: values.platform,
          name: values.name,
          body: values.body,
          position: values.position,
          category: values.category || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Ошибка создания')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Приписка создана')
      queryClient.invalidateQueries({ queryKey: ['appendices'] })
      setDialogOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; values: AppendixFormValues }) => {
      const res = await fetch(`/api/appendices/${vars.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: vars.values.platform,
          name: vars.values.name,
          body: vars.values.body,
          position: vars.values.position,
          category: vars.values.category || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Ошибка обновления')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Приписка обновлена')
      queryClient.invalidateQueries({ queryKey: ['appendices'] })
      setDialogOpen(false)
      setEditTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/appendices/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Не удалось удалить')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Приписка удалена')
      queryClient.invalidateQueries({ queryKey: ['appendices'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const submitting = createMutation.isPending || updateMutation.isPending

  function openCreate() {
    setEditTarget(null)
    setDialogOpen(true)
  }

  function openEdit(ap: Appendix) {
    setEditTarget(ap)
    setDialogOpen(true)
  }

  function handleSubmit(values: AppendixFormValues) {
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
          <CardTitle className="text-base">Приписки</CardTitle>
          <CardDescription>
            Приписки — это фрагменты текста (хештеги, контакты, призывы), которые
            добавляются к постам для конкретной площадки. При создании поста можно
            выбрать, какая приписка будет добавлена для каждой площадки.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const active = filter === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                    : 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {Icon && (
                  <Icon
                    className="size-3.5"
                    style={opt.hex ? { color: opt.hex } : undefined}
                  />
                )}
                {opt.label}
              </button>
            )
          })}
        </div>

        <Button
          onClick={openCreate}
          className="bg-teal-700 text-white hover:bg-teal-700/90"
        >
          <Plus className="size-4" />
          Новая приписка
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Не удалось загрузить приписки.{' '}
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
              <Plus className="size-5 text-muted-foreground" />
            </div>
            <div>
              <div className="font-medium">Приписок пока нет</div>
              <div className="text-sm text-muted-foreground">
                Создайте первую приписку — например, набор хештегов для Telegram.
              </div>
            </div>
            <Button
              onClick={openCreate}
              className="bg-teal-700 text-white hover:bg-teal-700/90"
            >
              <Plus className="size-4" />
              Новая приписка
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((ap) => (
            <AppendixCard
              key={ap.id}
              appendix={ap}
              onEdit={() => openEdit(ap)}
              onDelete={() => setDeleteTarget(ap)}
            />
          ))}
        </div>
      )}

      <AppendixFormDialog
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
            <AlertDialogTitle>Удалить приписку?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name ? (
                <>
                  Приписка «{deleteTarget.name}» будет удалена без возможности
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

export default AppendicesSection
