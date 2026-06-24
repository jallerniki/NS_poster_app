'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Send,
  MessageCircle,
  Users,
  Clock,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isToday as isDateToday,
  addMonths,
  isSameDay,
  startOfWeek,
  endOfWeek,
} from 'date-fns'
import { ru } from 'date-fns/locale'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStore } from '@/lib/store'
import {
  PLATFORMS,
  PLATFORM_LIST,
  POST_STATUS_META,
  type Platform,
  type PostStatus,
} from '@/lib/social'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface CalendarPostSummary {
  id: string
  title: string
  scheduledAt: string
  status: string
  platforms: string[]
}

interface DayBucket {
  date: string // YYYY-MM-DD (UTC)
  total: number
  byPlatform: Record<Platform, number>
  published: number
  scheduled: number
  failed: number
  posts: CalendarPostSummary[]
}

interface PostTarget {
  id: string
  accountId: string
  status: string
  account: { id: string; platform: Platform; name: string }
}

interface PostListItem {
  id: string
  title: string
  content: string
  mediaUrls: string | null
  wordpressRef: string | null
  scheduledAt: string
  status: PostStatus
  targets: PostTarget[]
}

// ────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ────────────────────────────────────────────────────────────────────────────

const WEEKDAY_HEADERS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const PLATFORM_ICON: Record<Platform, React.ComponentType<{ className?: string }>> = {
  telegram: Send,
  max: MessageCircle,
  vk: Users,
}

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const Icon = PLATFORM_ICON[platform]
  return Icon ? <Icon className={className} /> : null
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Given a day bucket, return the platform with the most posts that day. */
function dominantPlatform(bucket: DayBucket): Platform | null {
  let best: Platform | null = null
  let bestCount = 0
  for (const p of PLATFORM_LIST) {
    const c = bucket.byPlatform[p.id] ?? 0
    if (c > bestCount) {
      bestCount = c
      best = p.id
    }
  }
  return best
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

// ────────────────────────────────────────────────────────────────────────────
// Calendar section
// ────────────────────────────────────────────────────────────────────────────

export function CalendarSection() {
  const today = React.useMemo(() => new Date(), [])
  const [viewDate, setViewDate] = React.useState<Date>(() => startOfMonth(today))
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth() + 1 // 1-12

  const calendarQuery = useQuery<DayBucket[]>({
    queryKey: ['calendar', year, month],
    queryFn: async () => {
      const params = new URLSearchParams({ year: String(year), month: String(month) })
      const res = await fetch(`/api/calendar?${params.toString()}`)
      if (!res.ok) throw new Error('Не удалось загрузить календарь')
      return res.json() as Promise<DayBucket[]>
    },
    staleTime: 30_000,
  })

  React.useEffect(() => {
    if (calendarQuery.isError) {
      import('sonner').then(({ toast }) =>
        toast.error('Не удалось загрузить календарь', {
          description: 'Проверьте подключение к серверу и попробуйте обновить страницу.',
        }),
      )
    }
  }, [calendarQuery.isError])

  // Build the list of day cells covering the visible month grid (Mon-Sun weeks)
  const cells = React.useMemo(() => {
    const monthStart = startOfMonth(viewDate)
    const monthEnd = endOfMonth(viewDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [viewDate])

  // Index buckets by local date key for fast lookup
  const bucketsByKey = React.useMemo(() => {
    const map = new Map<string, DayBucket>()
    for (const b of calendarQuery.data ?? []) {
      // Bucket key is YYYY-MM-DD; parse as local date components
      // (split into parts to avoid UTC parse shift)
      const [yStr, mStr, dStr] = b.date.split('-')
      const localKey = `${yStr}-${mStr}-${dStr}`
      map.set(localKey, b)
    }
    return map
  }, [calendarQuery.data])

  const buckets = calendarQuery.data ?? []
  const totalMonthPosts = buckets.reduce((sum, b) => sum + b.total, 0)

  return (
    <div className="space-y-4">
      {/* Header card: navigation + legend */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              <CalendarDays className="size-5 text-teal-600" />
              {format(viewDate, 'LLLL yyyy', { locale: ru })}
              <span className="text-sm font-normal capitalize text-muted-foreground">
                · {totalMonthPosts} {pluralizePosts(totalMonthPosts)}
              </span>
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewDate((d) => addMonths(d, -1))}
                aria-label="Предыдущий месяц"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewDate(startOfMonth(new Date()))}
              >
                Сегодня
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewDate((d) => addMonths(d, 1))}
                aria-label="Следующий месяц"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <Legend />
        </CardHeader>
      </Card>

      {/* Calendar grid */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          {/* Weekday header row */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {WEEKDAY_HEADERS.map((wd) => (
              <div
                key={wd}
                className="py-1 text-center text-[11px] font-semibold uppercase text-muted-foreground sm:text-xs"
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Day cells */}
          {calendarQuery.isLoading ? (
            <CalendarGridSkeleton />
          ) : (
            <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
              {cells.map((day) => {
                const key = localDateKey(day)
                const bucket = bucketsByKey.get(key) ?? null
                const inMonth = day.getMonth() === viewDate.getMonth()
                const isToday = isDateToday(day)
                return (
                  <DayCell
                    key={key}
                    date={day}
                    bucket={bucket}
                    inMonth={inMonth}
                    isToday={isToday}
                    onClick={() => setSelectedDate(day)}
                  />
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day detail sheet */}
      <DayDetailSheet
        date={selectedDate}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null)
        }}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Legend
// ────────────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-2 font-medium text-foreground">Площадки:</div>
      {PLATFORM_LIST.map((p) => (
        <div key={p.id} className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: p.hex }}
          />
          {p.label}
        </div>
      ))}
      <div className="mx-1 hidden h-3 w-px bg-border sm:block" />
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-full bg-amber-400" />
        Запланирован
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-full bg-emerald-500" />
        Опубликован
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-full bg-rose-500" />
        Ошибка
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Day cell
// ────────────────────────────────────────────────────────────────────────────

interface DayCellProps {
  date: Date
  bucket: DayBucket | null
  inMonth: boolean
  isToday: boolean
  onClick: () => void
}

function DayCell({ date, bucket, inMonth, isToday, onClick }: DayCellProps) {
  const dominant = bucket ? dominantPlatform(bucket) : null
  const accentColor = dominant ? PLATFORMS[dominant].hex : null
  const visiblePosts = (bucket?.posts ?? []).slice(0, 3)
  const hiddenCount = (bucket?.posts.length ?? 0) - visiblePosts.length
  const hasActivity = bucket !== null && bucket.total > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex min-h-[80px] flex-col rounded-lg border p-1.5 text-left transition sm:min-h-[110px] sm:p-2',
        'hover:border-teal-300 hover:shadow-sm',
        inMonth ? 'bg-card' : 'bg-muted/30',
        !inMonth && 'text-muted-foreground/40',
        isToday && 'border-teal-400 ring-1 ring-teal-200',
      )}
      style={
        accentColor && inMonth
          ? { borderLeftWidth: '3px', borderLeftColor: accentColor }
          : undefined
      }
    >
      {/* Day number */}
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            'text-xs font-medium tabular-nums sm:text-sm',
            isToday && 'font-bold text-teal-700',
            !inMonth && 'text-muted-foreground/40',
          )}
        >
          {format(date, 'd')}
        </span>
        {isToday ? (
          <span className="inline-block size-1.5 rounded-full bg-teal-500" aria-hidden />
        ) : null}
      </div>

      {/* Posts */}
      {hasActivity ? (
        <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
          {visiblePosts.map((post) => (
            <PostChip key={post.id} post={post} />
          ))}
          {hiddenCount > 0 ? (
            <div className="mt-0.5 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
              +{hiddenCount} ещё
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Footer counter */}
      {hasActivity && (bucket!.scheduled > 0 || bucket!.published > 0) ? (
        <div className="mt-1 hidden text-[10px] text-muted-foreground sm:block">
          {bucket!.scheduled > 0 ? (
            <span className="text-amber-600">{bucket!.scheduled} запл.</span>
          ) : null}
          {bucket!.scheduled > 0 && bucket!.published > 0 ? ' / ' : null}
          {bucket!.published > 0 ? (
            <span className="text-emerald-600">{bucket!.published} опуб.</span>
          ) : null}
        </div>
      ) : null}
    </button>
  )
}

function PostChip({ post }: { post: CalendarPostSummary }) {
  const platforms = Array.from(new Set(post.platforms)) as Platform[]
  const date = parseISO(post.scheduledAt)
  const status = post.status as PostStatus
  const statusMeta = POST_STATUS_META[status] ?? POST_STATUS_META.scheduled

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight sm:text-[11px]',
        status === 'published'
          ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
          : status === 'failed'
            ? 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
            : status === 'partial'
              ? 'bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200'
              : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
      )}
    >
      {/* Colored dots row (mobile) — always visible */}
      <div className="flex shrink-0 items-center gap-0.5">
        {platforms.map((p) => {
          const meta = PLATFORMS[p]
          if (!meta) return null
          return (
            <span
              key={p}
              className="inline-block size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: meta.hex }}
              title={meta.label}
            />
          )
        })}
      </div>
      {/* Title — hidden on mobile */}
      <span className="hidden truncate sm:inline">{truncate(post.title || 'Без названия', 18)}</span>
      <span className="ml-auto shrink-0 tabular-nums opacity-80">{format(date, 'HH:mm')}</span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Skeleton grid
// ────────────────────────────────────────────────────────────────────────────

function CalendarGridSkeleton() {
  return (
    <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
      {Array.from({ length: 35 }).map((_, i) => (
        <Skeleton
          key={i}
          className="min-h-[80px] rounded-lg sm:min-h-[110px]"
        />
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Day detail sheet
// ────────────────────────────────────────────────────────────────────────────

interface DayDetailSheetProps {
  date: Date | null
  onOpenChange: (open: boolean) => void
}

function DayDetailSheet({ date, onOpenChange }: DayDetailSheetProps) {
  const openEditor = useStore((s) => s.openEditor)

  const open = date !== null

  // Fetch full posts for the selected day
  const dayQuery = useQuery<PostListItem[]>({
    queryKey: ['posts', 'day', date ? localDateKey(date) : null],
    enabled: date !== null,
    queryFn: async () => {
      if (!date) return []
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setHours(23, 59, 59, 999)
      const params = new URLSearchParams({
        from: dayStart.toISOString(),
        to: dayEnd.toISOString(),
      })
      const res = await fetch(`/api/posts?${params.toString()}`)
      if (!res.ok) throw new Error('Не удалось загрузить посты за день')
      return res.json() as Promise<PostListItem[]>
    },
    staleTime: 30_000,
  })

  const posts = React.useMemo(() => {
    if (!dayQuery.data) return []
    return [...dayQuery.data].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )
  }, [dayQuery.data])

  const handleOpenInPosts = (post: PostListItem) => {
    openEditor(post)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-teal-600" />
            {date ? format(date, 'd MMMM yyyy', { locale: ru }) : ''}
          </SheetTitle>
          <SheetDescription>
            {dayQuery.isLoading
              ? 'Загрузка постов…'
              : `${posts.length} ${pluralizePosts(posts.length)} за этот день`}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-3 p-4">
            {dayQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <CalendarDays className="size-8 text-muted-foreground/50" />
                <div>На этот день постов не запланировано.</div>
              </div>
            ) : (
              posts.map((post) => (
                <DayPostCard
                  key={post.id}
                  post={post}
                  onOpenInPosts={() => handleOpenInPosts(post)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function DayPostCard({
  post,
  onOpenInPosts,
}: {
  post: PostListItem
  onOpenInPosts: () => void
}) {
  const date = parseISO(post.scheduledAt)
  const platforms = Array.from(
    new Set(
      post.targets
        .map((t) => t.account.platform)
        .filter((p): p is Platform => p === 'telegram' || p === 'max' || p === 'vk'),
    ),
  )
  const statusMeta = POST_STATUS_META[post.status] ?? POST_STATUS_META.scheduled
  const contentPreview = truncate((post.content ?? '').replace(/\s+/g, ' ').trim(), 120)

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span className="font-medium tabular-nums">{format(date, 'HH:mm')}</span>
          </div>
          <div className="mt-1 truncate text-sm font-semibold">
            {post.title || 'Без названия'}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn('shrink-0 border-transparent', statusMeta.bg, statusMeta.text)}
        >
          {post.status === 'published' ? (
            <CheckCircle2 className="size-3" />
          ) : post.status === 'failed' ? (
            <AlertTriangle className="size-3" />
          ) : (
            <Clock className="size-3" />
          )}
          {statusMeta.label}
        </Badge>
      </div>

      {/* Platform chips */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {platforms.map((p) => {
          const meta = PLATFORMS[p]
          if (!meta) return null
          return (
            <span
              key={p}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${meta.hex}1a`, color: meta.hex }}
            >
              <PlatformIcon platform={p} className="size-2.5" />
              {meta.label}
            </span>
          )
        })}
      </div>

      {/* Content preview */}
      {contentPreview ? (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {contentPreview}
        </p>
      ) : (
        <p className="mt-2 text-xs italic text-muted-foreground/60">Нет содержания</p>
      )}

      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onOpenInPosts} className="text-teal-700">
          Открыть
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function pluralizePosts(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'пост'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'поста'
  return 'постов'
}
